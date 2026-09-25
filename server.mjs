import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { once } from 'node:events';
import os from 'node:os';

// Match Vite's local configuration without replacing hosting environment variables.
dotenv.config({ path: process.env.NODE_ENV === 'production' ? '.env' : ['.env.local', '.env'], quiet: true });

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 3010);
const adminPassword = process.env.ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD || 'innov-care-2026';
const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'innov-super-2026';
const databaseStorageLimitBytes = Number(process.env.DB_STORAGE_LIMIT_BYTES || 8 * 1024 * 1024 * 1024);
const scrypt = promisify(scryptCallback);
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USERNAME || process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || process.env.DB_NAME || 'defaultdb',

  waitForConnections: true,
  connectionLimit: 5,

  ssl:
    process.env.DB_SSL === 'true'
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
});

let usersTableReady;
let feedbacksTableReady;
let feedbackStorageReady;
let storageCache = { expiresAt: 0, value: null };

async function ensureUsersTable() {
  if (!usersTableReady) {
    usersTableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        username VARCHAR(80) NOT NULL,
        display_name VARCHAR(120) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('responsable') NOT NULL DEFAULT 'responsable',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY users_username_unique (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((error) => {
      usersTableReady = null;
      throw error;
    });
  }
  await usersTableReady;
}

async function ensureFeedbacksTable() {
  if (!feedbacksTableReady) {
    feedbacksTableReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS feedback_submissions (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          message TEXT NOT NULL,
          comments_json JSON NULL,
          contact_email VARCHAR(200) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_feedback_submissions_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS feedbacks (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          submission_id BIGINT UNSIGNED NULL,
          comment_index SMALLINT UNSIGNED NULL,
          message TEXT NOT NULL,
          rating TINYINT UNSIGNED NULL,
          service VARCHAR(250) NULL,
          status ENUM('new', 'in_review', 'resolved') NOT NULL DEFAULT 'new',
          admin_note TEXT NULL,
          contact_email VARCHAR(200) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          archived_at TIMESTAMP NULL DEFAULT NULL,
          PRIMARY KEY (id),
          KEY idx_feedbacks_submission_id (submission_id),
          KEY idx_feedbacks_created_at (created_at),
          KEY idx_feedbacks_service (service),
          KEY idx_feedbacks_status (status),
          KEY idx_feedbacks_rating (rating),
          KEY idx_feedbacks_archived_at (archived_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      const [columnRows] = await pool.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedbacks'
      `);
      const columns = new Set(columnRows.map(({ COLUMN_NAME }) => COLUMN_NAME));
      const additions = [
        ['submission_id', 'ADD COLUMN submission_id BIGINT UNSIGNED NULL AFTER id'],
        ['comment_index', 'ADD COLUMN comment_index SMALLINT UNSIGNED NULL AFTER submission_id'],
        ['status', "ADD COLUMN status ENUM('new', 'in_review', 'resolved') NOT NULL DEFAULT 'new'"],
        ['admin_note', 'ADD COLUMN admin_note TEXT NULL'],
        ['contact_email', 'ADD COLUMN contact_email VARCHAR(200) NULL'],
        ['created_at', 'ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'],
        ['updated_at', 'ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],
        ['archived_at', 'ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL'],
      ];

      for (const [column, statement] of additions) {
        if (!columns.has(column)) await pool.query(`ALTER TABLE feedbacks ${statement}`);
      }

      const [submissionColumnRows] = await pool.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedback_submissions'
      `);
      const submissionColumns = new Set(submissionColumnRows.map(({ COLUMN_NAME }) => COLUMN_NAME));
      if (!submissionColumns.has('comments_json')) {
        await pool.query('ALTER TABLE feedback_submissions ADD COLUMN comments_json JSON NULL AFTER message');
      }

      if (columns.has('service')) {
        await pool.query('ALTER TABLE feedbacks MODIFY COLUMN service VARCHAR(250) NULL');
      }
      if (columns.has('rating')) {
        await pool.query('ALTER TABLE feedbacks MODIFY COLUMN rating TINYINT UNSIGNED NULL');
      }

      const [indexRows] = await pool.query(`
        SELECT DISTINCT INDEX_NAME
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'feedbacks'
      `);
      const indexes = new Set(indexRows.map(({ INDEX_NAME }) => INDEX_NAME));
      const indexAdditions = [
        ['idx_feedbacks_submission_id', 'submission_id'],
        ['idx_feedbacks_created_at', 'created_at'],
        ['idx_feedbacks_service', 'service'],
        ['idx_feedbacks_status', 'status'],
        ['idx_feedbacks_rating', 'rating'],
        ['idx_feedbacks_archived_at', 'archived_at'],
      ];
      for (const [name, column] of indexAdditions) {
        if (!indexes.has(name)) await pool.query(`ALTER TABLE feedbacks ADD INDEX ${name} (${column})`);
      }
    })().catch((error) => {
      feedbacksTableReady = null;
      throw error;
    });
  }
  await feedbacksTableReady;
}

async function verifyFeedbackStorage() {
  if (!feedbackStorageReady) {
    feedbackStorageReady = (async () => {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [submission] = await connection.execute(
          'INSERT INTO feedback_submissions (message, contact_email) VALUES (?, ?)',
          ['Vérification technique', null]
        );
        await connection.execute(
          'INSERT INTO feedbacks (submission_id, comment_index, message, rating, service, contact_email) VALUES (?, ?, ?, ?, ?, ?)',
          [submission.insertId, null, '', 5, 'Vérification technique', null]
        );
        await connection.rollback();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    })().catch((error) => {
      feedbackStorageReady = null;
      throw error;
    });
  }
  await feedbackStorageReady;
}

async function getDatabaseStorageUsage({ fresh = false } = {}) {
  if (!fresh && storageCache.value && storageCache.expiresAt > Date.now()) return storageCache.value;
  const [[row]] = await pool.query(`
    SELECT COALESCE(SUM(DATA_LENGTH + INDEX_LENGTH), 0) AS used_bytes
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
  `);
  const usedBytes = Number(row.used_bytes || 0);
  const limitBytes = Number.isFinite(databaseStorageLimitBytes) && databaseStorageLimitBytes > 0
    ? databaseStorageLimitBytes : 8 * 1024 * 1024 * 1024;
  const percent = Math.round((usedBytes / limitBytes) * 1000) / 10;
  const value = { usedBytes, limitBytes, percent, warning: percent >= 70 };
  storageCache = { value, expiresAt: Date.now() + 5 * 60 * 1000 };
  return value;
}

function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

const feedbackMessageExpression = `COALESCE(
  CASE WHEN s.comments_json IS NOT NULL AND f.comment_index IS NOT NULL
    THEN JSON_UNQUOTE(JSON_EXTRACT(s.comments_json, CONCAT('$[', f.comment_index, ']'))) END,
  NULLIF(s.message, ''), f.message
)`;

const feedbackSelect = `
  SELECT f.id, f.submission_id,
         ${feedbackMessageExpression} AS message,
         f.rating, f.service, f.status, f.admin_note,
         COALESCE(s.contact_email, f.contact_email) AS contact_email,
         f.created_at, f.updated_at, f.archived_at
  FROM feedbacks f
  LEFT JOIN feedback_submissions s ON s.id = f.submission_id
`;

function buildFeedbackFilters(query, { allowArchived = false } = {}) {
  const where = [];
  const params = [];
  const archived = allowArchived ? String(query.archived || 'active') : 'active';
  if (archived === 'only') where.push('f.archived_at IS NOT NULL');
  else if (archived !== 'all') where.push('f.archived_at IS NULL');
  if (query.service) { where.push('f.service LIKE ?'); params.push(`%${String(query.service).trim()}%`); }
  if (query.rating) { where.push('f.rating = ?'); params.push(Number(query.rating)); }
  if (query.status) { where.push('f.status = ?'); params.push(String(query.status)); }
  if (query.search && String(query.search).trim()) {
    const search = `%${String(query.search).trim()}%`;
    where.push(`(${feedbackMessageExpression} LIKE ? OR f.service LIKE ? OR COALESCE(s.contact_email, f.contact_email) LIKE ?)`);
    params.push(search, search, search);
  }
  return { sql: where.length ? ` WHERE ${where.join(' AND ')}` : '', params };
}

async function getFeedbackPage(query, options = {}) {
  const { page, limit, offset } = parsePagination(query);
  const filters = buildFeedbackFilters(query, options);
  const [[countRow]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM feedbacks f LEFT JOIN feedback_submissions s ON s.id = f.submission_id${filters.sql}`,
    filters.params
  );
  const total = Number(countRow.total || 0);
  const [items] = await pool.execute(
    `${feedbackSelect}${filters.sql} ORDER BY f.created_at DESC, f.id DESC LIMIT ? OFFSET ?`,
    [...filters.params, limit, offset]
  );
  return {
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

app.use(cors());
app.use(express.json({ limit: '20kb' }));

// Helper IP Réseau local
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

// ─── IP Réseau Local ────────────────────────────────────────────────────────
app.get('/api/network-ip', (_req, res) => {
  const ip = getLocalIp();
  res.json({ ip, url: `http://${ip}:5173` });
});

// ─── Santé ──────────────────────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    await ensureUsersTable();
    await ensureFeedbacksTable();
    await verifyFeedbackStorage();

    res.json({
      ok: true,
      database: process.env.DB_DATABASE || process.env.DB_NAME || 'defaultdb',
    });
  } catch (error) {
    console.error('Erreur connexion MySQL Aiven:', error);

    res.status(503).json({
      ok: false,
      message: 'Base de données indisponible.',
    });
  }
});

// ─── Soumission d'un lot d'avis patients (multi-services) ──────────────────
app.post('/api/feedbacks/batch', async (req, res) => {
  const { feedbacks: items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0 || items.length > 15)
    return res.status(422).json({ message: 'Fournissez entre 1 et 15 avis.' });

  const rows = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') return res.status(422).json({ message: 'Avis invalide.' });
    const cleanService = typeof item.service === 'string' ? item.service.trim() : '';
    const cleanMessage = typeof item.message === 'string' ? item.message.trim() : '';
    const isGeneral = !cleanService && item.rating == null;
    const numericRating = isGeneral ? null : Number(item.rating);
    const cleanEmail = typeof item.contact_email === 'string' && item.contact_email.trim()
      ? item.contact_email.trim() : null;

    if ((!cleanService && !isGeneral) || cleanService.length > 250 || (cleanEmail && cleanEmail.length > 200))
      return res.status(422).json({ message: 'Service ou contact invalide.' });
    if (!isGeneral && (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5))
      return res.status(422).json({ message: `Note invalide pour le service "${cleanService}".` });
    if (cleanMessage.length > 5000)
      return res.status(422).json({ message: `Commentaire trop long pour "${cleanService}".` });
    if (isGeneral && !cleanMessage)
      return res.status(422).json({ message: 'Écrivez votre message avant de l’envoyer.' });

    rows.push([cleanMessage, numericRating, cleanService || null, cleanEmail]);
  }

  try {
    await ensureFeedbacksTable();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const sharedContact = rows.find((row) => row[3])?.[3] || null;
      const [submission] = await conn.execute(
        'INSERT INTO feedback_submissions (message, comments_json, contact_email) VALUES (?, ?, ?)',
        ['', JSON.stringify(rows.map((row) => row[0])), sharedContact]
      );
      const ids = [];
      for (const [index, row] of rows.entries()) {
        const [result] = await conn.execute(
          'INSERT INTO feedbacks (submission_id, comment_index, message, rating, service, contact_email) VALUES (?, ?, ?, ?, ?, ?)',
          [submission.insertId, index, '', row[1], row[2], null]
        );
        ids.push(result.insertId);
      }
      await conn.commit();
      res.status(201).json({ ids, message: `${ids.length} avis enregistré(s).` });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    console.error("Erreur lors de l'enregistrement des avis:", error);
    res.status(500).json({ message: "Impossible d'enregistrer les avis." });
  }
});

// ─── Soumission d'un avis patient (endpoint simple, rétrocompat) ─────────────
app.post('/api/feedbacks', async (req, res) => {
  const { message, rating, service, services, contact_email } = req.body || {};
  const cleanMessage = typeof message === 'string' ? message.trim() : '';
  const selectedServices = Array.isArray(services)
    ? [...new Set(services.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))]
    : (typeof service === 'string' && service.trim() ? [service.trim()] : []);
  const cleanServices = selectedServices.join(', ');
  const numericRating = Number(rating);
  const cleanEmail = typeof contact_email === 'string' && contact_email.trim() ? contact_email.trim() : null;

  if (!cleanMessage || cleanMessage.length > 5000)
    return res.status(422).json({ message: 'Le message est obligatoire et ne doit pas dépasser 5000 caractères.' });
  if (!selectedServices.length || selectedServices.length > 10 || cleanServices.length > 250)
    return res.status(422).json({ message: 'Sélectionnez entre 1 et 10 services.' });
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5)
    return res.status(422).json({ message: 'La note doit être comprise entre 1 et 5.' });
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
    return res.status(422).json({ message: 'Adresse email invalide.' });

  try {
    await ensureFeedbacksTable();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [submission] = await conn.execute(
        'INSERT INTO feedback_submissions (message, contact_email) VALUES (?, ?)',
        [cleanMessage, cleanEmail]
      );
      const [result] = await conn.execute(
        'INSERT INTO feedbacks (submission_id, message, rating, service, contact_email) VALUES (?, ?, ?, ?, ?)',
        [submission.insertId, '', numericRating, cleanServices, null]
      );
      await conn.commit();
      res.status(201).json({ id: result.insertId, message: 'Avis enregistré.' });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch { res.status(500).json({ message: 'Impossible d\'enregistrer votre avis.' }); }
});


// ─── Authentification ────────────────────────────────────────────────────────
function readCredentials(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try { return JSON.parse(Buffer.from(token, 'base64url').toString('utf8')); }
  catch { return { password: token }; }
}

async function verifyPassword(password, storedHash) {
  const [saltHex, keyHex] = String(storedHash).split(':');
  if (!saltHex || !keyHex) return false;
  const derivedKey = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  const expectedKey = Buffer.from(keyHex, 'hex');
  return expectedKey.length === derivedKey.length && timingSafeEqual(expectedKey, derivedKey);
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt.toString('hex')}:${Buffer.from(derivedKey).toString('hex')}`;
}

async function checkAdmin(req, res, next) {
  const credentials = readCredentials(req);
  if (!credentials?.password) return res.status(401).json({ message: 'Accès administrateur requis.' });
  if (credentials.username === 'admin' && credentials.password === adminPassword) return next();
  try {
    await ensureUsersTable();
    const [rows] = await pool.execute(
      "SELECT id, password_hash FROM users WHERE username = ? AND role = 'responsable' LIMIT 1",
      [credentials.username || '']
    );
    if (rows[0] && await verifyPassword(credentials.password, rows[0].password_hash)) return next();
  } catch (error) {
    console.error('Erreur lors de la vérification du compte administrateur:', error);
    return res.status(500).json({ message: 'La table des utilisateurs est indisponible.' });
  }
  return res.status(401).json({ message: 'Identifiant ou mot de passe incorrect.' });
}

function checkSuperAdmin(req, res, next) {
  if (req.headers.authorization !== `Bearer ${superAdminPassword}`)
    return res.status(401).json({ message: 'Accès super administrateur requis.' });
  next();
}

// ─── Routes Admin ────────────────────────────────────────────────────────────
app.get('/api/admin/feedbacks', checkAdmin, async (req, res) => {
  try {
    await ensureFeedbacksTable();
    res.json(await getFeedbackPage(req.query));
  } catch (error) {
    console.error('Erreur lors du chargement des avis:', error);
    res.status(500).json({ message: 'Impossible de charger les avis.' });
  }
});

// Statistiques pour le dashboard admin
app.get('/api/admin/stats', checkAdmin, async (_req, res) => {
  try {
    await ensureFeedbacksTable();
    const [[totals]] = await pool.query(
      'SELECT COUNT(*) AS total, ROUND(AVG(rating), 1) AS average FROM feedbacks WHERE archived_at IS NULL'
    );
    const [byService] = await pool.query(
      `SELECT f.service, COUNT(*) AS count, COUNT(f.rating) AS rated, ROUND(AVG(f.rating), 1) AS avg_rating,
              SUM(CASE WHEN TRIM(${feedbackMessageExpression}) <> '' THEN 1 ELSE 0 END) AS comments
       FROM feedbacks f
       LEFT JOIN feedback_submissions s ON s.id = f.submission_id
       WHERE f.archived_at IS NULL
       GROUP BY f.service ORDER BY count DESC`
    );
    const [byRating] = await pool.query(
      'SELECT rating, COUNT(*) AS count FROM feedbacks WHERE archived_at IS NULL GROUP BY rating ORDER BY rating DESC'
    );
    const [byStatus] = await pool.query(
      "SELECT status, COUNT(*) AS count FROM feedbacks WHERE archived_at IS NULL GROUP BY status"
    );
    const [recent] = await pool.query(
      'SELECT DATE(created_at) AS day, COUNT(*) AS count FROM feedbacks WHERE archived_at IS NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY day ORDER BY day ASC'
    );
    res.json({
      total: Number(totals.total),
      average: totals.average === null ? null : Number(totals.average),
      byService,
      byRating,
      byStatus,
      recent,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Impossible de charger les statistiques.' });
  }
});

// Mise à jour statut + note interne par l'admin
app.patch('/api/admin/feedbacks/:id', checkAdmin, async (req, res) => {
  const { status, admin_note } = req.body || {};
  const allowed = ['new', 'in_review', 'resolved'];
  if (status && !allowed.includes(status))
    return res.status(422).json({ message: 'Statut invalide.' });

  const updates = [];
  const params = [];
  if (status !== undefined)     { updates.push('status = ?');     params.push(status); }
  if (admin_note !== undefined) { updates.push('admin_note = ?'); params.push(admin_note || null); }
  if (!updates.length) return res.status(422).json({ message: 'Aucune modification fournie.' });

  params.push(req.params.id);
  try {
    await pool.execute(`UPDATE feedbacks SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Impossible de modifier l\'avis.' }); }
});

// ─── Routes Super Admin ──────────────────────────────────────────────────────
app.get('/api/super-admin/overview', checkSuperAdmin, async (_req, res) => {
  try {
    await ensureFeedbacksTable();
    const [[total]] = await pool.query('SELECT COUNT(*) AS total FROM feedbacks WHERE archived_at IS NULL');
    const [[archived]] = await pool.query('SELECT COUNT(*) AS total FROM feedbacks WHERE archived_at IS NOT NULL');
    const [[average]] = await pool.query('SELECT ROUND(AVG(rating), 1) AS average FROM feedbacks WHERE archived_at IS NULL');
    const [statuses] = await pool.query('SELECT status, COUNT(*) AS total FROM feedbacks WHERE archived_at IS NULL GROUP BY status');
    const storage = await getDatabaseStorageUsage();
    res.json({
      database: process.env.DB_DATABASE || process.env.DB_NAME || 'code',
      total: Number(total.total),
      archived: Number(archived.total),
      average: average.average === null ? null : Number(average.average),
      statuses,
      storage,
    });
  } catch { res.status(500).json({ message: 'Impossible de charger les informations du système.' }); }
});

app.get('/api/super-admin/feedbacks', checkSuperAdmin, async (req, res) => {
  try {
    await ensureFeedbacksTable();
    res.json(await getFeedbackPage(req.query, { allowArchived: true }));
  } catch { res.status(500).json({ message: 'Impossible de charger les avis.' }); }
});

function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Empêche un tableur d'interpréter un commentaire patient comme une formule.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

app.get('/api/super-admin/feedbacks-export', checkSuperAdmin, async (req, res) => {
  const year = Number.parseInt(req.query.year, 10);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 2020 || year > currentYear)
    return res.status(422).json({ message: 'Année invalide.' });

  try {
    await ensureFeedbacksTable();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="avis-innov-care-${year}.csv"`);
    res.write('\uFEFFID,Service,Note,Message,Contact,Statut,Date,Archive\r\n');
    let lastId = 0;
    while (true) {
      const [rows] = await pool.execute(
        `${feedbackSelect}
         WHERE f.created_at >= ? AND f.created_at < ? AND f.id > ?
         ORDER BY f.id ASC LIMIT 1000`,
        [`${year}-01-01`, `${year + 1}-01-01`, lastId]
      );
      if (!rows.length) break;
      for (const row of rows) {
        const line = [row.id, row.service || 'Réclamation générale', row.rating, row.message,
          row.contact_email, row.status, new Date(row.created_at).toISOString(), row.archived_at ? 'Oui' : 'Non']
          .map(csvCell).join(',') + '\r\n';
        if (!res.write(line)) await once(res, 'drain');
      }
      lastId = rows.at(-1).id;
    }
    res.end();
  } catch (error) {
    console.error('Erreur export annuel:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Impossible de créer l’export annuel.' });
    else res.end();
  }
});

app.post('/api/super-admin/feedbacks-archive', checkSuperAdmin, async (req, res) => {
  const year = Number.parseInt(req.body?.year, 10);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 2020 || year >= currentYear)
    return res.status(422).json({ message: 'Seules les années terminées peuvent être archivées.' });
  try {
    await ensureFeedbacksTable();
    const [result] = await pool.execute(
      `UPDATE feedbacks SET archived_at = NOW()
       WHERE archived_at IS NULL AND created_at >= ? AND created_at < ?`,
      [`${year}-01-01`, `${year + 1}-01-01`]
    );
    res.json({ archived: Number(result.affectedRows) });
  } catch { res.status(500).json({ message: 'Impossible d’archiver les avis.' }); }
});

app.get('/api/super-admin/users', checkSuperAdmin, async (_req, res) => {
  try {
    await ensureUsersTable();
    const [rows] = await pool.query(
      'SELECT id, username, display_name, role, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch { res.status(500).json({ message: 'Impossible de charger les comptes.' }); }
});

app.post('/api/super-admin/users', checkSuperAdmin, async (req, res) => {
  const { username, displayName, password } = req.body || {};
  const cleanUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const cleanDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
  if (!/^[a-z0-9._-]{3,80}$/.test(cleanUsername))
    return res.status(422).json({ message: 'Identifiant invalide.' });
  if (cleanDisplayName.length < 2 || cleanDisplayName.length > 120)
    return res.status(422).json({ message: 'Nom affiché invalide.' });
  if (typeof password !== 'string' || password.length < 10)
    return res.status(422).json({ message: 'Le mot de passe doit contenir au moins 10 caractères.' });
  try {
    await ensureUsersTable();
    const passwordHash = await hashPassword(password);
    const [result] = await pool.execute(
      'INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)',
      [cleanUsername, cleanDisplayName, passwordHash]
    );
    res.status(201).json({ id: result.insertId, username: cleanUsername, displayName: cleanDisplayName });
  } catch (error) {
    res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({
      message: error.code === 'ER_DUP_ENTRY' ? 'Cet identifiant existe déjà.' : 'Impossible de créer le compte.',
    });
  }
});

app.patch('/api/super-admin/users/:id/password', checkSuperAdmin, async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || password.length < 10)
    return res.status(422).json({ message: 'Le mot de passe doit contenir au moins 10 caractères.' });
  try {
    await ensureUsersTable();
    const passwordHash = await hashPassword(password);
    const [result] = await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Compte introuvable.' });
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Impossible de modifier le mot de passe.' }); }
});

app.patch('/api/super-admin/feedbacks/:id', checkSuperAdmin, async (req, res) => {
  const { message, rating, service, status } = req.body || {};
  const updates = [];
  const params = [];
  if (message !== undefined)  { updates.push('message = ?');  params.push(message); }
  if (rating !== undefined)   { updates.push('rating = ?');   params.push(Number(rating)); }
  if (service !== undefined)  { updates.push('service = ?');  params.push(service); }
  if (status !== undefined)   { updates.push('status = ?');   params.push(status); }
  if (!updates.length) return res.status(422).json({ message: 'Aucune modification fournie.' });
  params.push(req.params.id);
  try {
    await pool.execute(`UPDATE feedbacks SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Impossible de modifier l\'avis.' }); }
});

app.delete('/api/super-admin/feedbacks/:id', checkSuperAdmin, async (req, res) => {
  await ensureFeedbacksTable();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[feedback]] = await conn.execute('SELECT submission_id FROM feedbacks WHERE id = ? FOR UPDATE', [req.params.id]);
    const [result] = await conn.execute('DELETE FROM feedbacks WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ message: 'Avis introuvable.' });
    }
    if (feedback?.submission_id) {
      await conn.execute(
        `DELETE s FROM feedback_submissions s
         WHERE s.id = ? AND NOT EXISTS (SELECT 1 FROM feedbacks f WHERE f.submission_id = s.id)`,
        [feedback.submission_id]
      );
    }
    await conn.commit();
    res.json({ ok: true });
  } catch {
    await conn.rollback();
    res.status(500).json({ message: 'Impossible de supprimer l\'avis.' });
  } finally {
    conn.release();
  }
});

app.delete('/api/super-admin/users/:id', checkSuperAdmin, async (req, res) => {
  try {
    await ensureUsersTable();
    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Compte introuvable.' });
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Impossible de supprimer le compte.' }); }
});

import path from 'node:path';

// Serveur de fichiers statiques pour la production (Render / VPS)
app.use(express.static('dist'));
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.resolve('dist/index.html'));
});

app.listen(port, '0.0.0.0', () => console.log(`Serveur Innov Care: http://0.0.0.0:${port}`));
