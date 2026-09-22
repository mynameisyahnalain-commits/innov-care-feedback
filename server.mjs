import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

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

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'code' }); }
  catch { res.status(503).json({ ok: false, message: 'Base de données indisponible.' }); }
});

app.post('/api/feedbacks', async (req, res) => {
  const { message, rating, service, services } = req.body || {};
  const cleanMessage = typeof message === 'string' ? message.trim() : '';
  const selectedServices = Array.isArray(services) ? [...new Set(services.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))] : (typeof service === 'string' && service.trim() ? [service.trim()] : []);
  const cleanServices = selectedServices.join(', ');
  const numericRating = Number(rating);
  if (cleanMessage.length < 10 || cleanMessage.length > 5000) return res.status(422).json({ message: 'Le message doit contenir entre 10 et 5000 caractères.' });
  if (!selectedServices.length || selectedServices.length > 10 || cleanServices.length > 250) return res.status(422).json({ message: 'Sélectionnez entre 1 et 10 services.' });
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) return res.status(422).json({ message: 'La note doit être comprise entre 1 et 5.' });
  try {
    const [result] = await pool.execute('INSERT INTO feedbacks (message, rating, service) VALUES (?, ?, ?)', [cleanMessage, numericRating, cleanServices]);
    res.status(201).json({ id: result.insertId, message: 'Avis enregistré.' });
  } catch (error) { res.status(500).json({ message: 'Impossible d’enregistrer votre avis.' }); }
});

function readCredentials(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try { return JSON.parse(Buffer.from(token, 'base64url').toString('utf8')); } catch { return { password: token }; }
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
    const [rows] = await pool.execute('SELECT id FROM users WHERE username = ? AND role = \'responsable\' LIMIT 1', [credentials.username || '']);
    if (rows[0] && await verifyPassword(credentials.password, rows[0].password_hash)) return next();
  } catch { return res.status(500).json({ message: 'La table des utilisateurs est indisponible.' }); }
  return res.status(401).json({ message: 'Identifiant ou mot de passe incorrect.' });
}

function checkSuperAdmin(req, res, next) {
  if (req.headers.authorization !== `Bearer ${superAdminPassword}`) return res.status(401).json({ message: 'Accès super administrateur requis.' });
  next();
}

app.get('/api/admin/feedbacks', checkAdmin, async (_req, res) => {
  try { const [rows] = await pool.query('SELECT id, message, rating, service, status, created_at FROM feedbacks ORDER BY created_at DESC'); res.json(rows); }
  catch { res.status(500).json({ message: 'Impossible de charger les avis.' }); }
});

app.patch('/api/admin/feedbacks/:id', checkAdmin, async (req, res) => {
  const allowed = ['new', 'in_review', 'resolved'];
  if (!allowed.includes(req.body?.status)) return res.status(422).json({ message: 'Statut invalide.' });
  try { await pool.execute('UPDATE feedbacks SET status = ? WHERE id = ?', [req.body.status, req.params.id]); res.json({ ok: true }); }
  catch { res.status(500).json({ message: 'Impossible de modifier le statut.' }); }
});

app.get('/api/super-admin/overview', checkSuperAdmin, async (_req, res) => {
  try {
    const [[total]] = await pool.query('SELECT COUNT(*) AS total FROM feedbacks');
    const [[average]] = await pool.query('SELECT ROUND(AVG(rating), 1) AS average FROM feedbacks');
    const [statuses] = await pool.query('SELECT status, COUNT(*) AS total FROM feedbacks GROUP BY status');
    res.json({ database: process.env.DB_DATABASE || 'code', total: Number(total.total), average: average.average === null ? null : Number(average.average), statuses });
  } catch { res.status(500).json({ message: 'Impossible de charger les informations du système.' }); }
});

app.get('/api/super-admin/feedbacks', checkSuperAdmin, async (_req, res) => {
  try { const [rows] = await pool.query('SELECT id, message, rating, service, status, created_at, updated_at FROM feedbacks ORDER BY created_at DESC'); res.json(rows); }
  catch { res.status(500).json({ message: 'Impossible de charger les avis.' }); }
});

app.get('/api/super-admin/users', checkSuperAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, display_name, role, created_at, updated_at FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch { res.status(500).json({ message: 'Impossible de charger les comptes.' }); }
});

app.post('/api/super-admin/users', checkSuperAdmin, async (req, res) => {
  const { username, displayName, password } = req.body || {};
  const cleanUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const cleanDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
  if (!/^[a-z0-9._-]{3,80}$/.test(cleanUsername)) return res.status(422).json({ message: 'Identifiant invalide.' });
  if (cleanDisplayName.length < 2 || cleanDisplayName.length > 120) return res.status(422).json({ message: 'Nom affiché invalide.' });
  if (typeof password !== 'string' || password.length < 10) return res.status(422).json({ message: 'Le mot de passe doit contenir au moins 10 caractères.' });
  try {
    const passwordHash = await hashPassword(password);
    const [result] = await pool.execute('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)', [cleanUsername, cleanDisplayName, passwordHash]);
    res.status(201).json({ id: result.insertId, username: cleanUsername, displayName: cleanDisplayName });
  } catch (error) { res.status(error.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ message: error.code === 'ER_DUP_ENTRY' ? 'Cet identifiant existe déjà.' : 'Impossible de créer le compte.' }); }
});

app.patch('/api/super-admin/users/:id/password', checkSuperAdmin, async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || password.length < 10) return res.status(422).json({ message: 'Le mot de passe doit contenir au moins 10 caractères.' });
  try {
    const passwordHash = await hashPassword(password);
    const [result] = await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Compte introuvable.' });
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Impossible de modifier le mot de passe.' }); }
});

app.delete('/api/super-admin/users/:id', checkSuperAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Compte introuvable.' });
    res.json({ ok: true });
  } catch { res.status(500).json({ message: 'Impossible de supprimer le compte.' }); }
});

app.listen(port, '0.0.0.0', () => console.log(`API Innov Care: http://0.0.0.0:${port}`));