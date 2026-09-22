import React, { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const logo = '/logocare.jpg';
const configuredPublicUrl = import.meta.env.VITE_PUBLIC_URL || '';
const isPlaceholderUrl = configuredPublicUrl.includes('votre-nom.vercel.app') || configuredPublicUrl.includes('127.0.0.1') || configuredPublicUrl.includes('192.168.');
const publicUrl = isPlaceholderUrl || !configuredPublicUrl ? window.location.origin : configuredPublicUrl.replace(/\/$/, '');
const apiBase = import.meta.env.VITE_API_BASE_URL || '';
const encodeCredentials = (username, password) => btoa(JSON.stringify({ username, password })).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

function Brand() { return <div className="brand"><img src={logo} alt="Maison de Santé Innov Care" /><div><strong>Maison de Santé</strong><span>Innov Care</span></div></div>; }

function InstallButton() {
  const [installEvent, setInstallEvent] = useState(null);
  const [help, setHelp] = useState(false);
  useEffect(() => { const onInstall = event => { event.preventDefault(); setInstallEvent(event); }; window.addEventListener('beforeinstallprompt', onInstall); return () => window.removeEventListener('beforeinstallprompt', onInstall); }, []);
  async function install() { if (installEvent) { await installEvent.prompt(); setInstallEvent(null); return; } setHelp(!help); }
  return <div className="install-area"><button className="secondary-button" onClick={install}>Ajouter l’application</button>{help && <p className="install-help">iPhone : touchez <strong>Partager</strong> dans Safari, puis <strong>Sur l’écran d’accueil</strong>. Android : ouvrez le menu ⋮ puis <strong>Installer l’application</strong>.</p>}</div>;
}

function FeedbackView() {
  const services = ['Accueil', 'Consultation', 'Soins', 'Pharmacie', 'Laboratoire', 'Autre'];
  const [form, setForm] = useState({ services: [], rating: 0, message: '' });
  const [state, setState] = useState({ sent: false, sentMessage: '', error: '', saving: false });
  useEffect(() => {
    const syncPending = async () => {
      const pending = JSON.parse(localStorage.getItem('innov_pending_feedbacks') || '[]');
      if (!pending.length || !navigator.onLine) return;
      const remaining = [];
      for (const feedback of pending) {
        try { const response = await fetch(`${apiBase}/api/feedbacks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(feedback) }); if (!response.ok) remaining.push(feedback); } catch { remaining.push(feedback); }
      }
      localStorage.setItem('innov_pending_feedbacks', JSON.stringify(remaining));
    };
    syncPending();
    window.addEventListener('online', syncPending);
    return () => window.removeEventListener('online', syncPending);
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (form.message.trim().length < 10) return setState({ ...state, error: 'Votre message doit contenir au moins 10 caractères.' });
    if (!form.services.length) return setState({ ...state, error: 'Veuillez sélectionner au moins un service.' });
    if (!form.rating) return setState({ ...state, error: 'Veuillez sélectionner une note.' });
    setState({ sent: false, sentMessage: '', error: '', saving: true });
    try {
      if (!navigator.onLine) throw new Error('offline');
      const response = await fetch(`${apiBase}/api/feedbacks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Enregistrement impossible.');
      setState({ sent: true, sentMessage: 'Votre message a bien été transmis à notre équipe.', error: '', saving: false });
    } catch (error) {
      if (error.message === 'offline' || !navigator.onLine) {
        const pending = JSON.parse(localStorage.getItem('innov_pending_feedbacks') || '[]');
        localStorage.setItem('innov_pending_feedbacks', JSON.stringify([...pending, form]));
        setState({ sent: true, sentMessage: 'Votre avis est enregistré sur ce téléphone. Il sera envoyé automatiquement dès que la connexion reviendra.', error: '', saving: false });
      } else setState({ sent: false, sentMessage: '', error: error.message || 'La connexion au service est impossible.', saving: false });
    }
  }
  if (state.sent) return <main className="patient-page"><Brand /><InstallButton /><section className="card success-card"><div className="success-mark">✓</div><p className="eyebrow">Avis enregistré</p><h1>Merci pour votre avis.</h1><p>{state.sentMessage}</p><button className="primary-button" onClick={() => window.location.reload()}>Donner un autre avis</button></section></main>;
  return <main className="patient-page"><Brand /><InstallButton /><section className="card patient-card"><p className="eyebrow">Maison de Santé Innov Care</p><h1>Comment s’est passée votre visite ?</h1><p className="muted">Sélectionnez tous les services concernés, puis partagez vos remarques en un seul envoi.</p>{state.error && <div className="error">{state.error}</div>}<form onSubmit={submit}><fieldset className="service-options"><legend>Services concernés</legend><p className="field-hint">Vous pouvez en choisir plusieurs.</p><div className="service-grid">{services.map(service => <label className="service-option" key={service}><input type="checkbox" checked={form.services.includes(service)} onChange={event => setForm({ ...form, services: event.target.checked ? [...form.services, service] : form.services.filter(item => item !== service) })} /><span>{service}</span></label>)}</div></fieldset><fieldset><legend>Votre note globale</legend><div className="stars">{[1, 2, 3, 4, 5].map(value => <button type="button" className={value <= form.rating ? 'star active' : 'star'} onClick={() => setForm({ ...form, rating: value })} aria-label={`${value} sur 5`} key={value}>★</button>)}</div></fieldset><label>Votre avis et vos remarques<textarea value={form.message} onChange={event => setForm({ ...form, message: event.target.value })} placeholder="Écrivez vos remarques sur les services sélectionnés..." required /></label><button className="primary-button" type="submit" disabled={state.saving}>{state.saving ? 'Envoi en cours...' : 'Envoyer mon avis'}</button></form><p className="privacy">Aucun nom ni aucune donnée médicale ne vous est demandé.</p></section></main>;
}

function AdminView() {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [token, setToken] = useState(localStorage.getItem('innov_admin') || ''); const [feedbacks, setFeedbacks] = useState([]); const [error, setError] = useState(''); const [showQr, setShowQr] = useState(false); const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const homeMode = localStorage.getItem('innov_home_app_mode');
    if (homeMode === 'admin') {
      localStorage.setItem('innov_admin', token || '');
    }
  }, [token]);

  async function load(currentToken = token) { let response; try { response = await fetch(`${apiBase}/api/admin/feedbacks`, { headers: { Authorization: `Bearer ${currentToken}` } }); } catch { throw new Error('Impossible de joindre le serveur. Vérifiez la connexion Internet.'); } if (response.status === 401) throw new Error('Mot de passe administrateur incorrect.'); if (!response.ok) throw new Error('Le serveur admin est indisponible.'); setFeedbacks(await response.json()); }
  useEffect(() => { if (token) load().catch(error => { setError(error.message); setToken(''); localStorage.removeItem('innov_admin'); localStorage.setItem('innov_home_app_mode', 'patient'); }); }, []);
  async function login(event) { event.preventDefault(); const credentials = encodeCredentials(username.trim().toLowerCase() || 'admin', password); try { await load(credentials); localStorage.setItem('innov_admin', credentials); localStorage.setItem('innov_home_app_mode', 'admin'); setToken(credentials); setError(''); } catch (loginError) { setError(loginError.message); } }
  function downloadCsv() { const header = 'Date;Service;Note;Message'; const lines = feedbacks.map(item => [new Date(item.created_at).toLocaleString('fr-FR'), item.service || 'Non précisé', item.rating, item.message].map(value => `"${String(value).replaceAll('"', '""')}"`).join(';')); const blob = new Blob([`\ufeff${header}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'avis-patients-innov-care.csv'; link.click(); URL.revokeObjectURL(link.href); }
  if (!token) return <main className="admin-page"><header className="admin-header"><Brand /><InstallButton /></header><form className="admin-login card" onSubmit={login}><p className="eyebrow">Espace responsable</p><h1>Lire les avis des patients.</h1><p className="muted">Accédez aux messages transmis depuis le formulaire.</p>{error && <div className="error">{error}</div>}<label>Identifiant<input value={username} onChange={event => setUsername(event.target.value)} required autoComplete="username" /></label><label>Mot de passe<div className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" /><button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Masquer' : 'Afficher'}</button></div></label><button className="primary-button" type="submit">Voir les avis</button></form></main>;
  return <main className="admin-page"><header className="admin-header"><Brand /><div className="admin-actions"><button className="secondary-button" onClick={() => load()}>Actualiser</button><button className="secondary-button" onClick={() => setShowQr(!showQr)}>{showQr ? 'Masquer le QR' : 'Afficher le QR'}</button><button className="primary-button compact-button" onClick={downloadCsv}>Télécharger les avis</button><button className="secondary-button" onClick={() => { localStorage.removeItem('innov_admin'); setToken(''); }}>Quitter</button></div></header>{showQr && <section className="qr-print card"><p className="eyebrow">Affiche d’accueil</p><h2>Scannez pour donner votre avis</h2><QRCodeCanvas value={`${publicUrl}/`} size={300} level="H" includeMargin /><p className="qr-address">{publicUrl}/</p><button className="primary-button compact-button" onClick={() => window.print()}>Imprimer le QR code</button></section>}<div className="admin-heading"><div><p className="eyebrow">Espace responsable</p><h1>Avis et remarques.</h1></div><span className="count">{feedbacks.length} avis</span></div><section className="feedback-list">{feedbacks.length === 0 ? <div className="empty card">Aucun avis reçu pour le moment.</div> : feedbacks.map(feedback => <article className="feedback-item card" key={feedback.id}><div className="feedback-meta"><span>{feedback.service || 'Service non précisé'}</span><time>{new Date(feedback.created_at).toLocaleString('fr-FR')}</time></div><div className="rating">{'★'.repeat(feedback.rating)}<span>{'★'.repeat(5 - feedback.rating)}</span></div><p>{feedback.message}</p></article>)}</section></main>;
}

function SuperAdminView() {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('innov_super_admin') || '');
  const [feedbacks, setFeedbacks] = useState([]);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(null);

  async function request(path, options = {}, currentToken = token) {
    let response;
    try { response = await fetch(`${apiBase}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}`, ...(options.headers || {}) } }); }
    catch { throw new Error('Impossible de joindre le serveur. Vérifiez la connexion Internet.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Opération impossible.');
    return data;
  }

  async function load(currentToken = token) {
    const [systemData, feedbackData] = await Promise.all([
      request('/api/super-admin/overview', {}, currentToken),
      request('/api/super-admin/feedbacks', {}, currentToken),
    ]);
    setOverview(systemData);
    setFeedbacks(feedbackData);
  }

  useEffect(() => { if (token) load().catch(loginError => { setError(loginError.message); setToken(''); localStorage.removeItem('innov_super_admin'); }); }, []);

  async function login(event) {
    event.preventDefault();
    try { await load(password); localStorage.setItem('innov_super_admin', password); setToken(password); setError(''); }
    catch (loginError) { setError(loginError.message); }
  }

  async function updateFeedback(feedback) {
    setSaving(feedback.id);
    try {
      await request(`/api/super-admin/feedbacks/${feedback.id}`, { method: 'PATCH', body: JSON.stringify(feedback) });
      await load();
      setError('');
    } catch (saveError) { setError(saveError.message); }
    finally { setSaving(null); }
  }

  async function deleteFeedback(id) {
    if (!window.confirm('Supprimer définitivement cet avis ?')) return;
    setSaving(id);
    try { await request(`/api/super-admin/feedbacks/${id}`, { method: 'DELETE' }); await load(); setError(''); }
    catch (deleteError) { setError(deleteError.message); }
    finally { setSaving(null); }
  }

  if (!token) return <main className="admin-page"><header className="admin-header"><Brand /></header><form className="admin-login card" onSubmit={login}><p className="eyebrow">Contrôle du système</p><h1>Super administrateur.</h1><p className="muted">Gérez les données et les informations globales de l’application.</p>{error && <div className="error">{error}</div>}<label>Mot de passe super administrateur<input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" /></label><button className="primary-button" type="submit">Ouvrir le système</button></form></main>;

  return <main className="admin-page super-admin-page"><header className="admin-header"><Brand /><div className="admin-actions"><button className="secondary-button" onClick={() => load().catch(loadError => setError(loadError.message))}>Actualiser</button><button className="secondary-button" onClick={() => { localStorage.removeItem('innov_super_admin'); setToken(''); }}>Quitter</button></div></header><div className="admin-heading"><div><p className="eyebrow">Contrôle du système</p><h1>Super administrateur.</h1></div><span className="count">Accès complet</span></div>{error && <div className="error">{error}</div>}<section className="system-stats"><div className="card stat-card"><span>Base de données</span><strong>{overview?.database || '...'}</strong></div><div className="card stat-card"><span>Total des avis</span><strong>{overview?.total ?? '...'}</strong></div><div className="card stat-card"><span>Note moyenne</span><strong>{overview?.average ?? '-'} / 5</strong></div></section><section className="super-feedback-list"><div className="section-title"><h2>Toutes les données</h2><span>{feedbacks.length} enregistrement(s)</span></div>{feedbacks.length === 0 ? <div className="empty card">Aucun avis enregistré.</div> : feedbacks.map(feedback => <article className="super-feedback-item card" key={feedback.id}><div className="feedback-meta"><span>Avis #{feedback.id}</span><time>{new Date(feedback.created_at).toLocaleString('fr-FR')}</time></div><div className="super-fields"><label>Service<input value={feedback.service || ''} onChange={event => setFeedbacks(items => items.map(item => item.id === feedback.id ? { ...item, service: event.target.value } : item))} /></label><label>Note<select value={feedback.rating} onChange={event => setFeedbacks(items => items.map(item => item.id === feedback.id ? { ...item, rating: Number(event.target.value) } : item))}><option value="1">1 / 5</option><option value="2">2 / 5</option><option value="3">3 / 5</option><option value="4">4 / 5</option><option value="5">5 / 5</option></select></label><label>Statut<select value={feedback.status} onChange={event => setFeedbacks(items => items.map(item => item.id === feedback.id ? { ...item, status: event.target.value } : item))}><option value="new">Nouveau</option><option value="in_review">En cours</option><option value="resolved">Traité</option></select></label></div><label>Message<textarea value={feedback.message} onChange={event => setFeedbacks(items => items.map(item => item.id === feedback.id ? { ...item, message: event.target.value } : item))} /></label><div className="super-item-actions"><button className="primary-button compact-button" disabled={saving === feedback.id} onClick={() => updateFeedback(feedback)}>{saving === feedback.id ? 'Enregistrement...' : 'Enregistrer les modifications'}</button><button className="danger-button" disabled={saving === feedback.id} onClick={() => deleteFeedback(feedback.id)}>Supprimer</button></div></article>)}</section></main>;
}

function SuperAdminReadOnlyView() {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('innov_super_admin') || '');
  const [feedbacks, setFeedbacks] = useState([]);
  const [users, setUsers] = useState([]);
  const [overview, setOverview] = useState(null);
  const [newUser, setNewUser] = useState({ username: '', displayName: '', password: '' });
  const [error, setError] = useState('');

  async function request(path, options = {}, currentToken = token) {
    let response;
    try { response = await fetch(`${apiBase}${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}`, ...(options.headers || {}) } }); }
    catch { throw new Error('Impossible de joindre le serveur. Vérifiez la connexion Internet.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Opération impossible.');
    return data;
  }

  async function load(currentToken = token) {
    const [systemData, feedbackData, userData] = await Promise.all([
      request('/api/super-admin/overview', {}, currentToken),
      request('/api/super-admin/feedbacks', {}, currentToken),
      request('/api/super-admin/users', {}, currentToken),
    ]);
    setOverview(systemData); setFeedbacks(feedbackData); setUsers(userData);
  }

  useEffect(() => { if (token) load().catch(loadError => { setError(loadError.message); setToken(''); localStorage.removeItem('innov_super_admin'); }); }, []);

  async function login(event) {
    event.preventDefault();
    try { await load(password); localStorage.setItem('innov_super_admin', password); setToken(password); setError(''); }
    catch (loginError) { setError(loginError.message); }
  }

  async function createUser(event) {
    event.preventDefault();
    try { await request('/api/super-admin/users', { method: 'POST', body: JSON.stringify(newUser) }); setNewUser({ username: '', displayName: '', password: '' }); await load(); setError(''); }
    catch (createError) { setError(createError.message); }
  }

  async function changePassword(user) {
    const nextPassword = window.prompt(`Nouveau mot de passe pour ${user.username} (10 caractères minimum) :`);
    if (nextPassword === null) return;
    try { await request(`/api/super-admin/users/${user.id}/password`, { method: 'PATCH', body: JSON.stringify({ password: nextPassword }) }); setError(''); }
    catch (passwordError) { setError(passwordError.message); }
  }

  async function deleteUser(user) {
    if (!window.confirm(`Supprimer le compte ${user.username} ?`)) return;
    try { await request(`/api/super-admin/users/${user.id}`, { method: 'DELETE' }); await load(); setError(''); }
    catch (deleteError) { setError(deleteError.message); }
  }

  if (!token) return <main className="admin-page"><header className="admin-header"><Brand /></header><form className="admin-login card" onSubmit={login}><p className="eyebrow">Contrôle du système</p><h1>Super administrateur.</h1><p className="muted">Consultez le système et gérez les comptes responsables.</p>{error && <div className="error">{error}</div>}<label>Mot de passe super administrateur<input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" /></label><button className="primary-button" type="submit">Ouvrir le système</button></form></main>;

  return <main className="admin-page super-admin-page"><header className="admin-header"><Brand /><div className="admin-actions"><button className="secondary-button" onClick={() => load().catch(loadError => setError(loadError.message))}>Actualiser</button><button className="secondary-button" onClick={() => { localStorage.removeItem('innov_super_admin'); setToken(''); }}>Quitter</button></div></header><div className="admin-heading"><div><p className="eyebrow">Contrôle du système</p><h1>Super administrateur.</h1></div><span className="count">Lecture des avis</span></div>{error && <div className="error">{error}</div>}<section className="system-stats"><div className="card stat-card"><span>Base de données</span><strong>{overview?.database || '...'}</strong></div><div className="card stat-card"><span>Total des avis</span><strong>{overview?.total ?? '...'}</strong></div><div className="card stat-card"><span>Note moyenne</span><strong>{overview?.average ?? '-'} / 5</strong></div></section><section className="account-panel card"><div className="section-title"><h2>Comptes responsables</h2><span>{users.length} compte(s)</span></div><form className="account-form" onSubmit={createUser}><input placeholder="Identifiant" value={newUser.username} onChange={event => setNewUser({ ...newUser, username: event.target.value })} required /><input placeholder="Nom du responsable" value={newUser.displayName} onChange={event => setNewUser({ ...newUser, displayName: event.target.value })} required /><input type="password" placeholder="Mot de passe (10 caractères min.)" value={newUser.password} onChange={event => setNewUser({ ...newUser, password: event.target.value })} required minLength="10" /><button className="primary-button compact-button" type="submit">Créer le compte</button></form><div className="user-list">{users.map(user => <div className="user-row" key={user.id}><div><strong>{user.display_name}</strong><span>{user.username}</span></div><div className="user-actions"><button className="secondary-button" onClick={() => changePassword(user)}>Modifier le mot de passe</button><button className="danger-button" onClick={() => deleteUser(user)}>Supprimer</button></div></div>)}</div></section><section className="super-feedback-list"><div className="section-title"><h2>Avis patients</h2><span>{feedbacks.length} enregistrement(s), lecture seule</span></div>{feedbacks.length === 0 ? <div className="empty card">Aucun avis enregistré.</div> : feedbacks.map(feedback => <article className="feedback-item card" key={feedback.id}><div className="feedback-meta"><span>{feedback.service || 'Service non précisé'} · {feedback.status}</span><time>{new Date(feedback.created_at).toLocaleString('fr-FR')}</time></div><div className="rating">{'★'.repeat(feedback.rating)}<span>{'★'.repeat(5 - feedback.rating)}</span></div><p>{feedback.message}</p></article>)}</section></main>;
}

function App() {
  const isAdminPath = window.location.pathname === '/admin';
  const isSuperAdminPath = window.location.pathname === '/super-admin';
  const savedMode = localStorage.getItem('innov_home_app_mode');
  const hasAdminSession = localStorage.getItem('innov_admin');
  const shouldOpenAdmin = isAdminPath || savedMode === 'admin' || (hasAdminSession && window.matchMedia('(display-mode: standalone)').matches);
  if (isSuperAdminPath) return <SuperAdminReadOnlyView />;
  return shouldOpenAdmin ? <AdminView /> : <FeedbackView />;
}

if (window.location.pathname === '/admin') {
  localStorage.setItem('innov_home_app_mode', 'admin');
}

createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));