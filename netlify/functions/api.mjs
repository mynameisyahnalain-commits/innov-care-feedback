import mysql from 'mysql2/promise';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE || 'code',
      port: Number(process.env.DB_PORT || 4000),
      waitForConnections: true,
      connectionLimit: 2,
      ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
    });
  }
  return pool;
}

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

function credentials(event) {
  const token = event.headers.authorization?.replace(/^Bearer\s+/i, '');
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

async function isAdmin(event) {
  const auth = credentials(event);
  if (!auth?.password) return false;
  if (auth.username === 'admin' && auth.password === process.env.ADMIN_PASSWORD) return true;
  const [rows] = await getPool().execute('SELECT password_hash FROM users WHERE username = ? AND role = \'responsable\' LIMIT 1', [auth.username || '']);
  return Boolean(rows[0] && await verifyPassword(auth.password, rows[0].password_hash));
}

function isSuperAdmin(event) {
  const token = event.headers.authorization?.replace(/^Bearer\s+/i, '');
  return token && token === process.env.SUPER_ADMIN_PASSWORD;
}

function requestPath(event) {
  return event.path.replace(/^\/\.netlify\/functions\/api/, '') || '/';
}

export default async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }, body: '' };
  const path = requestPath(event);
  const body = event.body ? JSON.parse(event.body) : {};
  const database = getPool();

  try {
    if (event.httpMethod === 'GET' && path === '/health') {
      await database.query('SELECT 1');
      return json(200, { ok: true, database: process.env.DB_DATABASE || 'code' });
    }

    if (event.httpMethod === 'POST' && path === '/feedbacks') {
      const cleanMessage = typeof body.message === 'string' ? body.message.trim() : '';
      const selectedServices = Array.isArray(body.services) ? [...new Set(body.services.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))] : (typeof body.service === 'string' && body.service.trim() ? [body.service.trim()] : []);
      const cleanServices = selectedServices.join(', ');
      const numericRating = Number(body.rating);
      if (cleanMessage.length < 10 || cleanMessage.length > 5000) return json(422, { message: 'Le message doit contenir entre 10 et 5000 caractères.' });
      if (!selectedServices.length || selectedServices.length > 10 || cleanServices.length > 250) return json(422, { message: 'Sélectionnez entre 1 et 10 services.' });
      if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) return json(422, { message: 'La note doit être comprise entre 1 et 5.' });
      const [result] = await database.execute('INSERT INTO feedbacks (message, rating, service) VALUES (?, ?, ?)', [cleanMessage, numericRating, cleanServices]);
      return json(201, { id: result.insertId, message: 'Avis enregistré.' });
    }

    if (path.startsWith('/admin/') && !await isAdmin(event)) return json(401, { message: 'Accès administrateur requis.' });
    if (event.httpMethod === 'GET' && path === '/admin/feedbacks') {
      const [rows] = await database.query('SELECT id, message, rating, service, status, created_at FROM feedbacks ORDER BY created_at DESC');
      return json(200, rows);
    }

    if (path.startsWith('/super-admin/') && !isSuperAdmin(event)) return json(401, { message: 'Accès super administrateur requis.' });
    if (event.httpMethod === 'GET' && path === '/super-admin/overview') {
      const [[total]] = await database.query('SELECT COUNT(*) AS total FROM feedbacks');
      const [[average]] = await database.query('SELECT ROUND(AVG(rating), 1) AS average FROM feedbacks');
      const [statuses] = await database.query('SELECT status, COUNT(*) AS total FROM feedbacks GROUP BY status');
      return json(200, { database: process.env.DB_DATABASE || 'code', total: Number(total.total), average: average.average === null ? null : Number(average.average), statuses });
    }
    if (event.httpMethod === 'GET' && path === '/super-admin/feedbacks') {
      const [rows] = await database.query('SELECT id, message, rating, service, status, created_at, updated_at FROM feedbacks ORDER BY created_at DESC');
      return json(200, rows);
    }
    if (event.httpMethod === 'GET' && path === '/super-admin/users') {
      const [rows] = await database.query('SELECT id, username, display_name, role, created_at, updated_at FROM users ORDER BY created_at DESC');
      return json(200, rows);
    }
    if (event.httpMethod === 'POST' && path === '/super-admin/users') {
      const cleanUsername = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      const cleanDisplayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
      if (!/^[a-z0-9._-]{3,80}$/.test(cleanUsername)) return json(422, { message: 'Identifiant invalide.' });
      if (cleanDisplayName.length < 2 || cleanDisplayName.length > 120) return json(422, { message: 'Nom affiché invalide.' });
      if (typeof body.password !== 'string' || body.password.length < 10) return json(422, { message: 'Le mot de passe doit contenir au moins 10 caractères.' });
      const [result] = await database.execute('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)', [cleanUsername, cleanDisplayName, await hashPassword(body.password)]);
      return json(201, { id: result.insertId, username: cleanUsername, displayName: cleanDisplayName });
    }
    if (event.httpMethod === 'PATCH' && /^\/super-admin\/users\/\d+\/password$/.test(path)) {
      if (typeof body.password !== 'string' || body.password.length < 10) return json(422, { message: 'Le mot de passe doit contenir au moins 10 caractères.' });
      const id = path.split('/')[3];
      const [result] = await database.execute('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(body.password), id]);
      return result.affectedRows ? json(200, { ok: true }) : json(404, { message: 'Compte introuvable.' });
    }
    if (event.httpMethod === 'DELETE' && /^\/super-admin\/users\/\d+$/.test(path)) {
      const id = path.split('/')[3];
      const [result] = await database.execute('DELETE FROM users WHERE id = ?', [id]);
      return result.affectedRows ? json(200, { ok: true }) : json(404, { message: 'Compte introuvable.' });
    }
    return json(404, { message: 'Route introuvable.' });
  } catch (error) {
    const duplicate = error.code === 'ER_DUP_ENTRY';
    return json(duplicate ? 409 : 500, { message: duplicate ? 'Cet identifiant existe déjà.' : 'Le service est momentanément indisponible.' });
  }
}
