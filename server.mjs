import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import os from 'node:os';

const app = express();
const port = Number(process.env.PORT || process.env.API_PORT || 3010);
const adminPassword = process.env.ADMIN_PASSWORD || 'innov-care-2026';
const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'innov-super-2026';
const scrypt = promisify(scryptCallback);
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'code',
  waitForConnections: true,
  connectionLimit: 5,
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
});

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
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'code' }); }
  catch { res.status(503).json({ ok: false, message: 'Base de données indisponible.' }); }
});

// ─── Soumission d'un avis patient ───────────────────────────────────────────
app.post('/api/feedbacks', async (req, res) => {
  const { message, rating, service, services, contact_email } = req.body || {};
  const cleanMessage = typeof message === 'string' ? message.trim() : '';
  const selectedServices = Array.isArray(services)
    ? [...new Set(services.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))]
    : (typeof service === 'string' && service.trim() ? [service.trim()] : []);
  const cleanServices = selectedServices.join(', ');
  const numericRating = Number(rating);
  const cleanEmail = typeof contact_email === 'string' && contact_email.trim() ? contact_email.trim() : null;

  if (cleanMessage.length < 10 || cleanMessage.length > 5000)
    return res.status(422).json({ message: 'Le message doit contenir entre 10 et 5000 caractères.' });
  if (!selectedServices.length || selectedServices.length > 10 || cleanServices.length > 250)
    return res.status(422).json({ message: 'Sélectionnez entre 1 et 10 services.' });
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5)
    return res.status(422).json({ message: 'La note doit être comprise entre 1 et 5.' });
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))
    return res.status(422).json({ message: 'Adresse email invalide.' });

  try {
    const [result] = await pool.execute(
      'INSERT INTO feedbacks (message, rating, service, contact_email) VALUES (?, ?, ?, ?)',
      [cleanMessage, numericRating, cleanServices, cleanEmail]
    );
    res.status(201).json({ id: result.insertId, message: 'Avis enregistré.' });
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
    const [rows] = await pool.execute(
      "SELECT id, password_hash FROM users WHERE username = ? AND role = 'responsable' LIMIT 1",
      [credentials.username || '']
    );
    if (rows[0] && await verifyPassword(credentials.password, rows[0].password_hash)) return next();
  } catch { return res.status(500).json({ message: 'La table des utilisateurs est indisponible.' }); }
  return res.status(401).json({ message: 'Identifiant ou mot de passe incorrect.' });
}

function checkSuperAdmin(req, res, next) {
  if (req.headers.authorization !== `Bearer ${superAdminPassword}`)
    return res.status(401).json({ message: 'Accès super administrateur requis.' });
  next();
}

// ─── Routes Admin ────────────────────────────────────────────────────────────
app.get('/api/admin/feedbacks', checkAdmin, async (req, res) => {
  const { service, rating, status } = req.query;
  let query = 'SELECT id, message, rating, service, status, admin_note, contact_email, created_at FROM feedbacks WHERE 1=1';
  const params = [];
  if (service) { query += ' AND service LIKE ?'; params.push(`%${service}%`); }
  if (rating)  { query += ' AND rating = ?'; params.push(Number(rating)); }
  if (status)  { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';
  try {
    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch { res.status(500).json({ message: 'Impossible de charger les avis.' }); }
});

// Statistiques pour le dashboard admin
app.get('/api/admin/stats', checkAdmin, async (_req, res) => {
  try {
    const [[totals]] = await pool.query(
      'SELECT COUNT(*) AS total, ROUND(AVG(rating), 1) AS average FROM feedbacks'
    );
    const [byService] = await pool.query(
      'SELECT service, COUNT(*) AS count, ROUND(AVG(rating), 1) AS avg_rating FROM feedbacks GROUP BY service ORDER BY count DESC'
    );
    const [byRating] = await pool.query(
      'SELECT rating, COUNT(*) AS count FROM feedbacks GROUP BY rating ORDER BY rating DESC'
    );
    const [byStatus] = await pool.query(
      "SELECT status, COUNT(*) AS count FROM feedbacks GROUP BY status"
    );
    const [recent] = await pool.query(
      'SELECT DATE(created_at) AS day, COUNT(*) AS count FROM feedbacks WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY day ORDER BY day ASC'
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
    const [[total]] = await pool.query('SELECT COUNT(*) AS total FROM feedbacks');
    const [[average]] = await pool.query('SELECT ROUND(AVG(rating), 1) AS average FROM feedbacks');
    const [statuses] = await pool.query('SELECT status, COUNT(*) AS total FROM feedbacks GROUP BY status');
    res.json({
      database: process.env.DB_DATABASE || 'code',
      total: Number(total.total),
      average: average.average === null ? null : Number(average.average),
      statuses,
    });
  } catch { res.status(500).json({ message: 'Impossible de charger les informations du système.' }); }
});

app.get('/api/super-admin/feedbacks', checkSuperAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, message, rating, service, status, admin_note, contact_email, created_at, updated_at FROM feedbacks ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch { res.status(500).json({ message: 'Impossible de charger les avis.' }); }
});

app.get('/api/super-admin/users', checkSuperAdmin, async (_req, res) => {
  try {
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
  try {
    const [result] = await pool.execute('DELETE FROM feedbacks WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Avis introuvable.' });
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Impossible de supprimer l\'avis.' }); }
});

app.delete('/api/super-admin/users/:id', checkSuperAdmin, async (req, res) => {
  try {
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