import React, { useEffect, useState, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const LOGO_SRC = '/logo.png';
const apiBase = import.meta.env.VITE_API_BASE_URL || '';

const encodeCredentials = (username, password) =>
  btoa(JSON.stringify({ username, password }))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

const ALL_SERVICES = [
  'Accueil & Réception',
  'Consultation médicale',
  'Soins & Infirmerie',
  'Laboratoire / Analyses',
  'Radiologie / Échographie',
  'Pharmacie',
  'Urgences',
  'Maternité / Gynécologie',
  'Pédiatrie',
  'Chirurgie / Bloc',
  'Hospitalisation',
  'Caisse & Facturation',
  'Autre service',
];

function Brand() {
  return (
    <div className="brand">
      <img className="brand-logo-full" src={LOGO_SRC} alt="Maison de Santé Innov Care" />
    </div>
  );
}

// ─── Sélecteur de services sous forme de Modal Pop-Up au centre ──────────────
function ServiceSelector({ selectedServices, onChange }) {
  const [isOpen, setIsOpen] = useState(false);

  function toggle(srv) {
    if (selectedServices.includes(srv)) {
      onChange(selectedServices.filter((s) => s !== srv));
    } else {
      onChange([...selectedServices, srv]);
    }
  }

  function remove(srv, e) {
    e.stopPropagation();
    onChange(selectedServices.filter((s) => s !== srv));
  }

  return (
    <div className="service-selector-container">
      {/* Zone de déclenchement sur le formulaire */}
      <div
        className="service-selector-trigger"
        onClick={() => setIsOpen(true)}
      >
        {selectedServices.length === 0 ? (
          <span className="placeholder-text">👉 Appuyez ici pour choisir vos services...</span>
        ) : (
          <div className="selected-tags-inline">
            {selectedServices.map((srv) => (
              <span key={srv} className="selected-tag-item">
                {srv}
                <button
                  type="button"
                  className="tag-remove-btn"
                  onClick={(e) => remove(srv, e)}
                  title="Retirer ce service"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <span className="dropdown-arrow">🔍 Sélectionner</span>
      </div>

      {/* POP-UP MODAL AU CENTRE DE LA PAGE */}
      {isOpen && (
        <div className="service-modal-overlay anim-fade">
          <div className="service-modal-card">
            <div className="service-modal-header">
              <h2>Choix des services médicalisés</h2>
              <button
                type="button"
                className="service-modal-close-btn"
                onClick={() => setIsOpen(false)}
              >
                ✕
              </button>
            </div>

            <p className="service-modal-tip">
              Cochez tous les services par lesquels vous êtes passé(e) :
            </p>

            <div className="service-modal-list">
              {ALL_SERVICES.map((srv) => {
                const isChecked = selectedServices.includes(srv);
                return (
                  <div
                    key={srv}
                    className={`service-modal-item ${isChecked ? 'checked' : ''}`}
                    onClick={() => toggle(srv)}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="service-modal-checkbox"
                    />
                    <span className="service-modal-label">{srv}</span>
                  </div>
                );
              })}
            </div>

            <div className="service-modal-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setIsOpen(false)}
              >
                ✓ Valider la sélection ({selectedServices.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Étoiles d'évaluation (vide par défaut, se remplit uniquement au clic) ────
function StarRatingInput({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const labels = {
    1: '1/5 — Très insatisfait',
    2: '2/5 — Insatisfait',
    3: '3/5 — Passable / Moyen',
    4: '4/5 — Satisfait',
    5: '5/5 — Très satisfait',
  };

  const activeRating = hover || value;

  return (
    <div className="star-rating-input-container">
      <div className="stars-row">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= activeRating;
          return (
            <button
              key={star}
              type="button"
              className={`star-btn ${isFilled ? 'active' : ''}`}
              onClick={() => onChange(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              aria-label={`Noter ${star} sur 5`}
            >
              ★
            </button>
          );
        })}
      </div>
      <div className="rating-text-hint">
        {activeRating > 0 ? (
          labels[activeRating]
        ) : (
          <span className="rating-not-set">Cliquez sur les étoiles pour noter</span>
        )}
      </div>
    </div>
  );
}

function StarDisplay({ rating }) {
  return (
    <div className="star-display">
      {[1, 2, 3, 4, 5].map((v) => (
        <span key={v} className={v <= rating ? 'star-gold' : 'star-muted'}>★</span>
      ))}
      <span className="star-numeric">{rating}/5</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATIENT — Formulaire unique, propre et direct
// ═══════════════════════════════════════════════════════════════════════════════
function FeedbackView() {
  const [services, setServices] = useState([]);
  const [rating, setRating] = useState(0); // Vide par défaut
  const [message, setMessage] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Synchronisation hors-ligne
  useEffect(() => {
    const syncPending = async () => {
      const pending = JSON.parse(localStorage.getItem('innov_pending_feedbacks') || '[]');
      if (!pending.length || !navigator.onLine) return;
      const remaining = [];
      for (const fb of pending) {
        try {
          const r = await fetch(`${apiBase}/api/feedbacks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fb),
          });
          if (!r.ok) remaining.push(fb);
        } catch {
          remaining.push(fb);
        }
      }
      localStorage.setItem('innov_pending_feedbacks', JSON.stringify(remaining));
    };
    syncPending();
    window.addEventListener('online', syncPending);
    return () => window.removeEventListener('online', syncPending);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (services.length === 0) {
      setError('Veuillez choisir au moins un service concerné par votre passage.');
      return;
    }
    if (rating === 0) {
      setError('Veuillez sélectionner une note avec les étoiles.');
      return;
    }
    if (!message.trim() || message.trim().length < 3) {
      setError('Veuillez écrire votre message ou remarque.');
      return;
    }

    setError('');
    setSaving(true);

    const payload = {
      services,
      rating,
      message: message.trim(),
      contact_email: contactEmail.trim() || null,
    };

    try {
      if (!navigator.onLine) throw new Error('offline');
      const res = await fetch(`${apiBase}/api/feedbacks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Impossible d\'enregistrer votre avis.');
      setSent(true);
    } catch (err) {
      if (err.message === 'offline' || !navigator.onLine) {
        const pending = JSON.parse(localStorage.getItem('innov_pending_feedbacks') || '[]');
        localStorage.setItem('innov_pending_feedbacks', JSON.stringify([...pending, payload]));
        setSent(true);
      } else {
        setError(err.message || 'Une erreur est survenue lors de l\'envoi.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <main className="patient-container anim-fade">
        <Brand />
        <section className="card patient-card success-box">
          <div className="success-icon">✓</div>
          <h2>Merci pour votre message !</h2>
          <p className="success-desc">
            Votre avis a bien été transmis à la <strong>Maison de Santé Innov Care</strong>.
            Votre retour nous aide à perfectionner notre prise en charge.
          </p>
          <button
            className="btn-primary"
            onClick={() => {
              setSent(false);
              setServices([]);
              setRating(0);
              setMessage('');
              setContactEmail('');
            }}
          >
            Donner un autre avis
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="patient-container anim-fade">
      <header className="patient-header">
        <Brand />
        <h1 className="patient-main-title">Votre avis compte pour nous</h1>
        <p className="patient-sub-title">
          Partagez votre expérience en toute simplicité et confidentialité.
        </p>
      </header>

      <form className="card patient-card" onSubmit={handleSubmit}>
        {error && <div className="error-alert">{error}</div>}

        {/* 1. Sélection dynamique des services */}
        <div className="form-group">
          <label className="form-label">
            1. Service(s) concerné(s)
            <span className="form-hint">Ouvrez la liste pour cocher vos services</span>
          </label>
          <ServiceSelector
            selectedServices={services}
            onChange={setServices}
          />
        </div>

        {/* 2. Évaluation avec étoiles (vides par défaut) */}
        <div className="form-group">
          <label className="form-label">
            2. Votre appréciation globale
          </label>
          <StarRatingInput value={rating} onChange={setRating} />
        </div>

        {/* 3. Message */}
        <div className="form-group">
          <label className="form-label" htmlFor="patient-message">
            3. Vos remarques et commentaires
          </label>
          <textarea
            id="patient-message"
            className="form-textarea"
            placeholder="Exprimez-vous librement sur l'accueil, les soins, la prise en charge, etc."
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
        </div>

        {/* 4. Contact optionnel */}
        <div className="form-group">
          <label className="form-label" htmlFor="patient-contact">
            4. Numéro de téléphone ou e-mail <span className="tag-optional">(Optionnel)</span>
          </label>
          <input
            id="patient-contact"
            type="text"
            className="form-input"
            placeholder="Laissez votre contact si vous désirez une réponse"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary btn-submit" disabled={saving}>
          {saving ? 'Envoi en cours...' : 'Envoyer mon avis'}
        </button>
      </form>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — Rôle : REGARDER UNIQUEMENT les messages qui viennent (Lecture seule)
// ═══════════════════════════════════════════════════════════════════════════════
function AdminView() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('innov_admin') || '');
  const [feedbacks, setFeedbacks] = useState([]);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrUrlInput, setQrUrlInput] = useState('http://192.168.1.7:5173');

  // Détection automatique de l'adresse réseau
  useEffect(() => {
    fetch(`${apiBase}/api/network-ip`)
      .then((r) => r.json())
      .then((data) => {
        if (data.url) setQrUrlInput(data.url);
      })
      .catch(() => { });
  }, []);

  async function apiFetch(path, options = {}, tok = token) {
    let r;
    try {
      r = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tok}`,
          ...(options.headers || {}),
        },
      });
    } catch {
      throw new Error('Connexion au serveur impossible.');
    }
    if (r.status === 401) throw new Error('Mot de passe ou identifiant incorrect.');
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.message || 'Erreur serveur.');
    }
    return r.json();
  }

  async function loadFeedbacks(tok = token) {
    try {
      const data = await apiFetch('/api/admin/feedbacks', {}, tok);
      setFeedbacks(data);
      setError('');
    } catch (err) {
      setError(err.message);
      if (err.message.includes('incorrect') || err.message.includes('requis')) {
        setToken('');
        localStorage.removeItem('innov_admin');
      }
    }
  }

  useEffect(() => {
    if (token) {
      loadFeedbacks();
    }
  }, [token]);

  async function handleLogin(e) {
    e.preventDefault();
    const creds = encodeCredentials(username.trim().toLowerCase() || 'admin', password);
    try {
      await loadFeedbacks(creds);
      localStorage.setItem('innov_admin', creds);
      setToken(creds);
    } catch (err) {
      setError(err.message);
    }
  }

  const filteredFeedbacks = feedbacks.filter((f) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      (f.message && f.message.toLowerCase().includes(q)) ||
      (f.service && f.service.toLowerCase().includes(q)) ||
      (f.contact_email && f.contact_email.toLowerCase().includes(q))
    );
  });

  if (!token) {
    return (
      <main className="admin-container anim-fade">
        <header className="patient-header">
          <Brand />
        </header>
        <div className="login-box card">
          <h2>Espace Administrateur</h2>
          <p className="login-desc">Accédez à la consultation des messages des patients</p>
          {error && <div className="error-alert">{error}</div>}
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Identifiant</label>
              <input
                type="text"
                className="form-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mot de passe</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary" style={{ marginTop: 12 }}>
              Consulter les messages
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-container anim-fade">
      {/* En-tête Admin */}
      <header className="admin-simple-header">
        <Brand />
        <div className="admin-top-actions">
          <button className="btn-secondary" onClick={() => setShowQrModal(!showQrModal)}>
            {showQrModal ? 'Masquer QR Code' : '📲 QR Code à scanner'}
          </button>
          <button
            className="btn-logout"
            onClick={() => {
              localStorage.removeItem('innov_admin');
              setToken('');
            }}
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* Panneau QR Code */}
      {showQrModal && (
        <section className="card qr-print-card anim-fade">
          <h2>QR Code pour les patients</h2>
          <p className="qr-sub-desc">
            Placez ce QR code à l'accueil ou en salle d'attente pour que les patients puissent donner leur avis.
          </p>
          <div className="qr-wrapper">
            <QRCodeCanvas value={qrUrlInput} size={220} level="H" includeMargin />
          </div>
          <div className="qr-url-edit-box">
            <label>Lien encodé dans le QR Code :</label>
            <input
              type="text"
              className="form-input"
              value={qrUrlInput}
              onChange={(e) => setQrUrlInput(e.target.value)}
            />
          </div>
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => window.print()}>
            🖨 Imprimer l'affiche QR Code
          </button>
        </section>
      )}

      {/* Titre & Recherche */}
      <div className="messages-heading">
        <div>
          <h1 className="admin-title">Messages des patients</h1>
          <p className="admin-subtitle">Consultez les remarques et retours d'expérience reçus</p>
        </div>
        <div className="badge-count-total">{feedbacks.length} avis reçu(s)</div>
      </div>

      <div className="search-bar-wrap">
        <input
          type="text"
          className="form-input search-input"
          placeholder="🔍 Rechercher par mot-clé, service ou contact..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {error && <div className="error-alert">{error}</div>}

      {/* Bannières / Cartes de messages élégantes */}
      <div className="feedbacks-list">
        {filteredFeedbacks.length === 0 ? (
          <div className="card empty-card">
            {searchTerm ? 'Aucun message ne correspond à votre recherche.' : 'Aucun message reçu pour le moment.'}
          </div>
        ) : (
          filteredFeedbacks.map((item) => (
            <article key={item.id} className="card modern-message-banner">
              {/* Bannière d'en-tête du message */}
              <div className="banner-top-bar">
                <div className="banner-service-tags">
                  {item.service
                    ? item.service.split(', ').map((s) => (
                      <span key={s} className="service-banner-chip">{s}</span>
                    ))
                    : <span className="service-banner-chip">Général</span>}
                </div>
                <div className="banner-date-badge">
                  {new Date(item.created_at).toLocaleString('fr-FR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </div>
              </div>

              {/* Étoiles d'évaluation */}
              <div className="banner-rating-row">
                <StarDisplay rating={item.rating} />
              </div>

              {/* Corps du message patient */}
              <div className="banner-message-body">
                <span className="quote-icon">“</span>
                <p className="banner-text">{item.message}</p>
                <span className="quote-icon-end">”</span>
              </div>

              {/* Coordonnées si fournies */}
              {item.contact_email && (
                <div className="banner-contact-badge">
                  ✉ <strong>Contact laissé :</strong> {item.contact_email}
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPER ADMIN — Rôle : GESTION COMPLÈTE & SUPPRESSION DES MESSAGES
// ═══════════════════════════════════════════════════════════════════════════════
function SuperAdminView() {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('innov_super_admin') || '');
  const [feedbacks, setFeedbacks] = useState([]);
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ username: '', displayName: '', password: '' });
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  async function req(path, options = {}, tok = token) {
    let r;
    try {
      r = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tok}`,
          ...(options.headers || {}),
        },
      });
    } catch {
      throw new Error('Connexion au serveur impossible.');
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || 'Opération impossible.');
    return data;
  }

  async function load(tok = token) {
    const [fb, us] = await Promise.all([
      req('/api/super-admin/feedbacks', {}, tok),
      req('/api/super-admin/users', {}, tok),
    ]);
    setFeedbacks(fb);
    setUsers(us);
  }

  useEffect(() => {
    if (token) {
      load().catch((err) => {
        setError(err.message);
        setToken('');
        localStorage.removeItem('innov_super_admin');
      });
    }
  }, []);

  async function login(e) {
    e.preventDefault();
    try {
      await load(password);
      localStorage.setItem('innov_super_admin', password);
      setToken(password);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteFeedback(id) {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer définitivement cet avis ?')) return;
    setDeletingId(id);
    try {
      await req(`/api/super-admin/feedbacks/${id}`, { method: 'DELETE' });
      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
      setError('');
    } catch (err) {
      setError(err.message || 'Erreur lors de la suppression.');
    } finally {
      setDeletingId(null);
    }
  }

  async function createUser(e) {
    e.preventDefault();
    try {
      await req('/api/super-admin/users', { method: 'POST', body: JSON.stringify(newUser) });
      setNewUser({ username: '', displayName: '', password: '' });
      await load();
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteUser(id) {
    if (!window.confirm('Supprimer ce compte administrateur ?')) return;
    try {
      await req(`/api/super-admin/users/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!token) {
    return (
      <main className="admin-container anim-fade">
        <header className="patient-header"><Brand /></header>
        <div className="login-box card">
          <h2>Super Administrateur</h2>
          <p className="login-desc">Gestion avancée & suppression des messages</p>
          {error && <div className="error-alert">{error}</div>}
          <form onSubmit={login}>
            <div className="form-group">
              <label className="form-label">Mot de passe Super Admin</label>
              <input
                type="password"
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary" style={{ marginTop: 12 }}>
              Ouvrir l'espace Super Admin
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-container anim-fade">
      <header className="admin-simple-header">
        <Brand />
        <button
          className="btn-logout"
          onClick={() => {
            localStorage.removeItem('innov_super_admin');
            setToken('');
          }}
        >
          Déconnexion Super Admin
        </button>
      </header>

      <div className="messages-heading">
        <div>
          <h1 className="admin-title">Gestion Super Admin</h1>
          <p className="admin-subtitle">Vous pouvez supprimer des avis et créer des comptes d'accès</p>
        </div>
        <div className="badge-count-total">{feedbacks.length} avis au total</div>
      </div>

      {error && <div className="error-alert">{error}</div>}

      {/* Gestion des comptes admin */}
      <div className="card" style={{ marginBottom: 30 }}>
        <h3 style={{ color: 'var(--primary-teal)', marginBottom: 12 }}>Créer un compte d'accès responsable</h3>
        <form onSubmit={createUser} className="user-create-form">
          <input
            className="form-input"
            placeholder="Identifiant (ex: reception)"
            value={newUser.username}
            onChange={(e) => setNewUser((u) => ({ ...u, username: e.target.value }))}
            required
          />
          <input
            className="form-input"
            placeholder="Nom complet"
            value={newUser.displayName}
            onChange={(e) => setNewUser((u) => ({ ...u, displayName: e.target.value }))}
            required
          />
          <input
            className="form-input"
            type="password"
            placeholder="Mot de passe (10 car. min)"
            value={newUser.password}
            onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))}
            required
          />
          <button type="submit" className="btn-primary" style={{ width: 'auto' }}>
            + Ajouter
          </button>
        </form>

        <div style={{ marginTop: 16 }}>
          {users.map((u) => (
            <div key={u.id} className="user-item-row">
              <div>
                <strong>{u.display_name}</strong> <small>({u.username})</small>
              </div>
              <button
                className="btn-delete-msg"
                onClick={() => deleteUser(u.id)}
              >
                Supprimer le compte
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Liste des avis avec bouton SUPPRIMER fonctionnel */}
      <h2 style={{ fontSize: 20, color: 'var(--primary-teal)', marginBottom: 16 }}>
        Tous les avis reçus ({feedbacks.length})
      </h2>
      <div className="feedbacks-list">
        {feedbacks.map((item) => (
          <article key={item.id} className="card modern-message-banner">
            <div className="banner-top-bar">
              <div className="banner-service-tags">
                {item.service
                  ? item.service.split(', ').map((s) => (
                    <span key={s} className="service-banner-chip">{s}</span>
                  ))
                  : <span className="service-banner-chip">Général</span>}
              </div>
              <div className="banner-date-badge">
                {new Date(item.created_at).toLocaleString('fr-FR')}
              </div>
            </div>

            <div className="banner-rating-row">
              <StarDisplay rating={item.rating} />
            </div>

            <div className="banner-message-body">
              <p className="banner-text">{item.message}</p>
            </div>

            {item.contact_email && (
              <div className="banner-contact-badge">
                ✉ <strong>Contact :</strong> {item.contact_email}
              </div>
            )}

            <div className="banner-footer-actions">
              <button
                type="button"
                className="btn-delete-action"
                disabled={deletingId === item.id}
                onClick={() => handleDeleteFeedback(item.id)}
              >
                {deletingId === item.id ? 'Suppression...' : '🗑 Supprimer définitivement cet avis'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════════════════════
function App() {
  const path = window.location.pathname;
  if (path === '/super-admin') return <SuperAdminView />;
  if (path === '/admin') return <AdminView />;
  return <FeedbackView />;
}

createRoot(document.getElementById('root')).render(<App />);