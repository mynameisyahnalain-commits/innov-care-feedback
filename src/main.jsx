import React, { useEffect, useState, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { feedbackServices } from './feedback-summary.mjs';

const LOGO_SRC = '/logo.png';
const apiBase = import.meta.env.VITE_API_BASE_URL || '';

const encodeCredentials = (username, password) =>
  btoa(JSON.stringify({ username, password }))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

// Services disponibles (sans Pharmacie ni Laboratoire)
const ALL_SERVICES = [
  { id: 'accueil',       label: 'Accueil & Réception' },
  { id: 'consultation',  label: 'Consultation médicale' },
  { id: 'soins',         label: 'Soins & Infirmerie' },
  { id: 'radiologie',    label: 'Radiologie' },
  { id: 'echographie',   label: 'Échographie' },
  { id: 'cardiologie',   label: 'Cardiologie' },
  { id: 'urgences',      label: 'Urgences' },
  { id: 'maternite',     label: 'Maternité / Gynécologie' },
  { id: 'pediatrie',     label: 'Pédiatrie' },
  { id: 'hospit',        label: 'Hospitalisation' },
  { id: 'caisse',        label: 'Caisse' },
  { id: 'autre',         label: 'Autre service' },
];

const SERVICE_SYMBOLS = {
  cardiologie: <><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /><path d="M3 12h5l2-4 3 8 2-4h6" /></>,
  echographie: <><rect x="2" y="3" width="15" height="12" rx="2" /><path d="M6 19h7M9 15v4M6 8q3-3 6 0M7 11q2-2 4 0M17 8h2v8a2 2 0 0 0 4 0v-4M21 9h2v3h-2z" /></>,
  accueil: <><circle cx="12" cy="6" r="3" /><path d="M6 15v-2a6 6 0 0 1 12 0v2M3 15h18v6H3zM8 18h8" /></>,
  consultation: <><path d="M5 3v5a5 5 0 0 0 10 0V3M3 3h4M13 3h4M10 13v3a5 5 0 0 0 10 0v-2" /><circle cx="20" cy="11" r="2" /></>,
  soins: <><path d="m15 3 6 6M17 5l-3 3M19 7l-3 3M12 6l6 6-8 8H4v-6zM4 20l-2 2M9 11l3 3M7 14l2 2" /></>,
  radiologie: <><rect x="3" y="3" width="18" height="14" rx="2" /><path d="M8 21h8M12 17v4M6 10h3l2-4 3 8 2-4h2" /></>,
  urgences: <><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></>,
  maternite: <><circle cx="10" cy="4" r="2" /><path d="M8 8c-2 2-2 5-1 8l-2 5h12l-2-5c5-2 4-7-1-7l-2-2M9 12l5 2M9 21v-3" /></>,
  pediatrie: <><circle cx="12" cy="12" r="9" /><path d="M12 3c-3 1-3 4 0 4M8 10h.01M16 10h.01M8 15c2 3 6 3 8 0" /></>,
  hospit: <><path d="M3 5v16M21 12v9M3 17h18M3 10h5v7M8 11h10a3 3 0 0 1 3 3v3" /><circle cx="6" cy="8" r="2" /></>,
  caisse: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 6h6M9 10h6M9 14h2M14 14h1" /></>,
  autre: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 17.5h7M17.5 14v7" /></>,
};

function ServiceIcon({ id }) {
  return <span className={`service-symbol service-symbol-${id}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{SERVICE_SYMBOLS[id]}</svg>
  </span>;
}

function Brand() {
  return (
    <div className="brand">
      <img className="brand-logo-full" src={LOGO_SRC} alt="Maison de Santé Innov Care" />
    </div>
  );
}

function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;
  const { page, totalPages, total } = pagination;
  return (
    <nav className="pagination" aria-label="Navigation des avis">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>← Précédent</button>
      <span>Page <strong>{page}</strong> sur <strong>{totalPages}</strong> · {total} avis</span>
      <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Suivant →</button>
    </nav>
  );
}

// ─── Étoiles d'évaluation ────────────────────────────────────────────────────
function StarRatingInput({ value, onChange, size = 'normal' }) {
  const [hover, setHover] = useState(0);
  const labels = {
    1: 'Très insatisfait',
    2: 'Insatisfait',
    3: 'Passable',
    4: 'Satisfait',
    5: 'Très satisfait',
  };
  const activeRating = hover || value;

  return (
    <div className={`star-rating-input-container ${size === 'large' ? 'star-large' : ''}`}>
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
          <span className="rating-label-active">{activeRating}/5 — {labels[activeRating]}</span>
        ) : (
          <span className="rating-not-set">Appuyez sur une étoile pour noter</span>
        )}
      </div>
    </div>
  );
}

function StarDisplay({ rating }) {
  if (rating == null) return <span className="unrated-label">Sans note — message libre</span>;
  return (
    <div className="star-display">
      {[1, 2, 3, 4, 5].map((v) => (
        <span key={v} className={v <= rating ? 'star-gold' : 'star-muted'}>★</span>
      ))}
      <span className="star-numeric">{rating}/5</span>
    </div>
  );
}

// ─── Modal multi-services ─────────────────────────────────────────────────────
/*
  Nouveau flux :
  - Grille des services toujours visible
  - Clic sur une tuile → panneau de notation glisse en place (dans le même modal)
  - Une fois noté → retour à la grille (service marqué avec ✓ + étoiles)
  - Bouton "Fermer & confirmer" quand au moins 1 service noté
*/
function MultiServiceModal({ onClose, onConfirm, initialFeedbacks }) {
  // feedbackMap: { serviceId: { rating, comment } }
  const [feedbackMap, setFeedbackMap] = useState(() => Object.fromEntries(
    initialFeedbacks.flatMap(f => {
      const service = ALL_SERVICES.find(s => s.label === f.service);
      return service ? [[service.id, { rating: f.rating, comment: f.comment }]] : [];
    })
  ));
  // Service en cours de notation (null = grille visible)
  const [ratingId, setRatingId] = useState(null);
  // Feedback temporaire pendant la notation
  const [tempRating, setTempRating] = useState(0);
  const [tempComment, setTempComment] = useState('');
  const modalRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => { modalRef.current?.focus(); }, [ratingId]);

  function handleDialogKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      ratingId ? cancelRating() : onClose();
    }
    if (event.key !== 'Tab') return;
    const controls = [...modalRef.current.querySelectorAll('button:not(:disabled), textarea')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === modalRef.current)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  }

  const ratedIds = Object.keys(feedbackMap);
  const activeSrv = ratingId ? ALL_SERVICES.find(s => s.id === ratingId) : null;

  function openRating(id) {
    const existing = feedbackMap[id] || { rating: 0, comment: '' };
    setTempRating(existing.rating);
    setTempComment(existing.comment);
    setRatingId(id);
  }

  function saveAndBack() {
    if (tempRating === 0) return; // note obligatoire
    setFeedbackMap(prev => ({
      ...prev,
      [ratingId]: { rating: tempRating, comment: tempComment },
    }));
    setRatingId(null);
    setTempRating(0);
    setTempComment('');
  }

  function cancelRating() {
    setRatingId(null);
    setTempRating(0);
    setTempComment('');
  }

  function removeService(id) {
    setFeedbackMap(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function handleConfirm() {
    const entries = ratedIds.map(id => {
      const srv = ALL_SERVICES.find(s => s.id === id);
      const fb = feedbackMap[id];
      return { service: srv.label, rating: fb.rating, comment: fb.comment || '' };
    });
    onConfirm(entries);
  }

  // ── PANNEAU DE NOTATION (remplace la grille) ──────────────────────────────
  if (ratingId && activeSrv) {
    return (
      <div className="msm-overlay anim-fade">
        <div className="msm-card msm-card-rate" ref={modalRef} role="dialog" aria-modal="true" aria-label={activeSrv.label} tabIndex={-1} onKeyDown={handleDialogKey}>
          {/* Barre de progression: services notés / total cliqués */}
          {ratedIds.length > 0 && (
            <div className="msm-progress-bar-wrap">
              <div className="msm-progress-bar-fill" style={{ width: '100%' }} />
            </div>
          )}

          <div className="msm-rate-header">
            <button className="msm-close" onClick={cancelRating} aria-label="Retour">✕</button>
            {ratedIds.length > 0 && (
              <div className="msm-rate-step-badge">
                {ratedIds.length} service{ratedIds.length > 1 ? 's' : ''} noté{ratedIds.length > 1 ? 's' : ''}
              </div>
            )}
            <ServiceIcon id={activeSrv.id} />
            <h2 className="msm-rate-title">{activeSrv.label}</h2>
            <p className="msm-rate-sub">Comment évaluez-vous ce service ?</p>
          </div>

          <div className="msm-rate-body">
            <StarRatingInput
              value={tempRating}
              onChange={setTempRating}
              size="large"
            />
            <div className="msm-comment-wrap">
              <label className="msm-comment-label" htmlFor="service-comment">
                Commentaire <span className="tag-optional">(optionnel)</span>
              </label>
              <textarea
                id="service-comment"
                className="form-textarea msm-textarea" maxLength={5000}
                rows={3}
                placeholder={`Partagez votre ressenti sur ${activeSrv.label}...`}
                value={tempComment}
                onChange={(e) => setTempComment(e.target.value)}
              />
            </div>
          </div>

          <div className="msm-rate-footer">
            <button type="button" className="btn-secondary" onClick={cancelRating}>
              ← Retour aux services
            </button>
            <button
              type="button"
              className="btn-primary msm-cta"
              disabled={tempRating === 0}
              onClick={saveAndBack}
            >
              ✓ Valider ce service
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── GRILLE DES SERVICES ───────────────────────────────────────────────────
  return (
    <div className="msm-overlay anim-fade">
      <div className="msm-card" ref={modalRef} role="dialog" aria-modal="true" aria-label="Choisir les services" tabIndex={-1} onKeyDown={handleDialogKey}>
        <div className="msm-header">
          <h2 className="msm-title">
            {ratedIds.length === 0
              ? 'Quel service avez-vous utilisé ?'
              : 'Un autre service ?'}
          </h2>
          <p className="msm-subtitle">
            {ratedIds.length === 0
              ? 'Appuyez sur un service pour le noter'
              : `${ratedIds.length} service${ratedIds.length > 1 ? 's notés' : ' noté'} — ajoutez un service ou passez à l’envoi.`}
          </p>
          <button className="msm-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        <div className="msm-service-grid">
          {ALL_SERVICES.map((srv) => {
            const fb = feedbackMap[srv.id];
            const isDone = !!fb;
            return (
              <button
                key={srv.id}
                type="button"
                className={`msm-service-tile ${isDone ? 'rated' : ''}`}
                aria-label={`${srv.label} — ${isDone ? `note ${fb.rating} sur 5, modifier` : 'évaluer ce service'}`}
                onClick={() => openRating(srv.id)}
              >
                <ServiceIcon id={srv.id} />
                <span className="msm-tile-label">{srv.label}</span>
                {isDone ? (
                  <span className="msm-tile-rated-stars">
                    {[1,2,3,4,5].map(v => (
                      <span key={v} style={{ color: v <= fb.rating ? '#976315' : '#bccbc5', fontSize: 14 }}>★</span>
                    ))}
                  </span>
                ) : null}
                <span className="service-tile-action">{isDone ? 'Modifier ma note' : 'Noter'} <span aria-hidden="true">→</span></span>
              </button>
            );
          })}
        </div>

        <div className="msm-footer">
          {ratedIds.length > 0 ? (
            <button
              type="button"
              className="btn-primary msm-cta"
              onClick={handleConfirm}
            >
              Continuer vers l’envoi →
            </button>
          ) : (
            <p className="msm-footer-hint">Sélectionnez un service pour commencer</p>
          )}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// PATIENT — Formulaire principal
// ═══════════════════════════════════════════════════════════════════════════════
function FeedbackView() {
  const [mode, setMode] = useState('services');
  const [complaint, setComplaint] = useState('');
  const [queued, setQueued] = useState(false);
  const [serviceFeedbacks, setServiceFeedbacks] = useState([]);
  const [contactEmail, setContactEmail] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const summaryRef = useRef(null);
  const focusSummary = useRef(false);
  useEffect(() => {
    if (showModal || !focusSummary.current) return;
    focusSummary.current = false;
    const frame = requestAnimationFrame(() => {
      summaryRef.current?.focus({ preventScroll: true });
      summaryRef.current?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [showModal]);
  const [error, setError] = useState('');

  // Synchronisation hors-ligne
  useEffect(() => {
    const syncPending = async () => {
      const pending = JSON.parse(localStorage.getItem('innov_pending_feedbacks') || '[]');
      if (!pending.length || !navigator.onLine) return;
      const remaining = [];
      for (const payload of pending) {
        try {
          const endpoint = Array.isArray(payload.feedbacks) ? '/api/feedbacks/batch' : '/api/feedbacks';
          const r = await fetch(`${apiBase}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!r.ok) remaining.push(payload);
        } catch {
          remaining.push(payload);
        }
      }
      localStorage.setItem('innov_pending_feedbacks', JSON.stringify(remaining));
    };
    syncPending();
    window.addEventListener('online', syncPending);
    return () => window.removeEventListener('online', syncPending);
  }, []);

  function handleModalConfirm(entries) {
    focusSummary.current = true;
    setServiceFeedbacks(entries);
    setShowModal(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (mode === 'complaint' && !complaint.trim()) {
      setError('Écrivez votre message avant de l’envoyer.');
      return;
    }
    if (mode === 'services' && serviceFeedbacks.length === 0) {
      setError('Veuillez évaluer au moins un service via le bouton ci-dessus.');
      return;
    }

    setError('');
    setSaving(true);

    const payload = {
      feedbacks: mode === 'complaint' ? [{
        service: null, rating: null, message: complaint.trim(),
        contact_email: contactEmail.trim() || null,
      }] : serviceFeedbacks.map((f) => ({
        service: f.service,
        rating: f.rating,
        message: f.comment || '',
        contact_email: contactEmail.trim() || null,
      })),
    };

    try {
      if (!navigator.onLine) throw new Error('offline');
      const res = await fetch(`${apiBase}/api/feedbacks/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Impossible d'enregistrer vos avis.");
      setQueued(false);
      setSent(true);
    } catch (err) {
      if (err.message === 'offline' || !navigator.onLine) {
        const pending = JSON.parse(localStorage.getItem('innov_pending_feedbacks') || '[]');
        localStorage.setItem('innov_pending_feedbacks', JSON.stringify([...pending, payload]));
        setQueued(true);
        setSent(true);
      } else {
        setError(err.message || "Une erreur est survenue lors de l'envoi.");
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
          <h2>{queued ? 'Votre message est enregistré sur cet appareil' : 'Merci, votre message a été envoyé'}</h2>
          <p className="success-desc">
            {queued ? 'Il sera transmis lorsque la connexion reviendra. Gardez cette page ouverte ou revenez sur ce site depuis cet appareil.' : 'Votre retour a été transmis à la Maison de Santé Innov Care pour améliorer votre accueil et votre prise en charge.'}
          </p>
          <button
            className="btn-primary"
            onClick={() => {
              setSent(false);
              setServiceFeedbacks([]);
              setContactEmail('');
              setComplaint('');
              setQueued(false);
              setError('');
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
      {showModal && (
        <MultiServiceModal
          initialFeedbacks={serviceFeedbacks}
          onClose={() => setShowModal(false)}
          onConfirm={handleModalConfirm}
        />
      )}

      <header className="patient-header">
        <Brand />
        <h1 className="patient-main-title">Votre avis compte pour nous</h1>
        <p className="patient-sub-title">
          Un avis, une difficulté ou une réclamation ? Nous sommes à votre écoute.
        </p>
      </header>

      <form className="card patient-card" onSubmit={handleSubmit}>
        <fieldset className="feedback-choice" disabled={saving}>
          <legend>Comment souhaitez-vous nous faire part de votre expérience ?</legend>
          <div className="feedback-options">
            <button type="button" className={`feedback-option option-services ${mode === 'services' ? 'is-selected' : ''}`}
              aria-pressed={mode === 'services'} aria-haspopup="dialog"
              onClick={() => { setMode('services'); setError(''); setShowModal(true); }}>
              <span className="option-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{SERVICE_SYMBOLS.consultation}</svg></span>
              <strong>Évaluer un service</strong>
            </button>
            <button type="button" className={`feedback-option option-complaint ${mode === 'complaint' ? 'is-selected' : ''}`}
              aria-pressed={mode === 'complaint'} onClick={() => { setMode('complaint'); setError(''); }}>
              <span className="option-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z" /><path d="M8 8h8M8 12h5" /></svg></span>
              <strong>Faire une réclamation</strong>
            </button>
          </div>
        </fieldset>
        {error && <div className="error-alert" role="alert">{error}</div>}

        {/* Récapitulatif des services évalués */}
        {mode === 'services' ? (
        <div className="open-modal-section">
          {serviceFeedbacks.length > 0 && (
            <div ref={summaryRef} tabIndex={-1} className="feedback-final-step">
              <div className="send-reminder" role="status">
                <strong>Dernière étape : envoyez votre avis</strong>
                <p>Vos notes ne sont pas encore envoyées. Vérifiez-les, puis appuyez sur « Envoyer mon avis » en bas.</p>
              </div>
            <div className="services-summary-block">
              <div className="services-summary-header">
                <span className="services-summary-title">
                  ✓ {serviceFeedbacks.length} service{serviceFeedbacks.length > 1 ? 's' : ''} évalué{serviceFeedbacks.length > 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  className="btn-edit-services"
                  onClick={() => setShowModal(true)}
                >
                   Modifier
                </button>
              </div>
              <div className="services-rated-list">
                {serviceFeedbacks.map((f, i) => (
                  <div key={i} className="service-rated-row">
                    <span className="srv-rated-name">{f.service}</span>
                    <div className="srv-rated-stars">
                      {[1, 2, 3, 4, 5].map(v => (
                        <span key={v} style={{ color: v <= f.rating ? '#F5A623' : '#D1DDD9', fontSize: 16 }}>★</span>
                      ))}
                    </div>
                    {f.comment && <span className="srv-rated-comment">"{f.comment}"</span>}
                  </div>
                ))}
              </div>
            </div>
            </div>
          )}
        </div>
        ) : (
          <div className="form-group complaint-field">
            <label className="form-label" htmlFor="patient-complaint">Que s’est-il passé ?</label>
            <p className="field-help" id="complaint-help">Décrivez votre difficulté ou ce que vous souhaitez nous signaler. Aucune note n’est nécessaire.</p>
            <textarea id="patient-complaint" className="form-textarea" rows={5}
              placeholder="Expliquez-nous votre situation…" value={complaint}
              onChange={e => setComplaint(e.target.value)} maxLength={5000}
              required aria-describedby="complaint-help" />
          </div>
        )}

        {/* Contact optionnel */}
        <div className="form-group" style={{ marginTop: 20 }}>
          <label className="form-label" htmlFor="patient-contact">
            Numéro de téléphone ou e-mail <span className="tag-optional">(Optionnel)</span>
          </label>
          <input
            id="patient-contact"
            type="text"
            className="form-input"
            placeholder="Laissez votre contact si vous désirez une réponse"
            value={contactEmail}
            maxLength={200}
            onChange={(e) => setContactEmail(e.target.value)}
          />
        </div>

        {/* Bouton envoi final */}
        <button
          type="submit"
          className="btn-submit-final"
          disabled={saving || (mode === 'services' && serviceFeedbacks.length === 0)}
        >
          {saving ? (
            <span>⏳ Envoi en cours...</span>
          ) : (
            <>
              <span>{mode === 'complaint' ? 'Envoyer ma réclamation' : 'Envoyer mon avis'}</span>
              {mode === 'services' && serviceFeedbacks.length > 0 && (
                <span className="submit-count-badge">{serviceFeedbacks.length}</span>
              )}
            </>
          )}
        </button>
      </form>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN — Lecture seule
// ═══════════════════════════════════════════════════════════════════════════════
function AdminView() {
  const [selectedService, setSelectedService] = useState('');
  const reviewsRef = useRef(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('innov_admin') || '');
  const [feedbacks, setFeedbacks] = useState([]);
  const [stats, setStats] = useState({ total: 0, byService: [] });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrUrlInput, setQrUrlInput] = useState('http://192.168.1.7:5173');

  useEffect(() => {
    fetch(`${apiBase}/api/network-ip`)
      .then((r) => r.json())
      .then((data) => { if (data.url) setQrUrlInput(data.url); })
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

  async function loadFeedbacks(tok = token, page = pagination.page, service = selectedService, search = searchTerm) {
    try {
      setLoadingFeedbacks(true);
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (service) params.set('service', service);
      if (search.trim()) params.set('search', search.trim());
      const data = await apiFetch(`/api/admin/feedbacks?${params}`, {}, tok);
      setFeedbacks(data.items);
      setPagination(data.pagination);
      setError('');
    } catch (err) {
      setError(err.message);
      if (err.message.includes('incorrect') || err.message.includes('requis')) {
        setToken('');
        localStorage.removeItem('innov_admin');
      }
      throw err;
    } finally {
      setLoadingFeedbacks(false);
    }
  }

  async function loadStats(tok = token) {
    const data = await apiFetch('/api/admin/stats', {}, tok);
    setStats(data);
  }

  useEffect(() => {
    if (!token) return undefined;
    const timer = window.setTimeout(() => {
      loadFeedbacks(token, pagination.page, selectedService, searchTerm).catch(() => {});
    }, searchTerm ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [token, pagination.page, selectedService, searchTerm]);

  useEffect(() => {
    if (token) loadStats().catch((err) => setError(err.message));
  }, [token]);

  async function handleLogin(e) {
    e.preventDefault();
    const creds = encodeCredentials(username.trim().toLowerCase() || 'admin', password);
    try {
      await Promise.all([loadFeedbacks(creds, 1, '', ''), loadStats(creds)]);
      localStorage.setItem('innov_admin', creds);
      setToken(creds);
    } catch (err) {
      setError(err.message);
    }
  }

  const receivedSummaries = (stats.byService || []).map((row) => ({
    service: row.service || 'Réclamation générale',
    count: Number(row.count || 0),
    comments: Number(row.comments || 0),
    rated: Number(row.rated || 0),
    average: row.avg_rating == null ? null : Number(row.avg_rating),
  }));
  const serviceSummaries = ALL_SERVICES.map(service => receivedSummaries.find(s => s.service === service.label)
    || { service: service.label, count: 0, comments: 0, rated: 0, average: null });
  // Keep general and legacy combined feedback accessible without inventing separate ratings.
  serviceSummaries.push(...receivedSummaries.filter(s => !ALL_SERVICES.some(service => service.label === s.service)));
  function showServiceReviews(service) {
    setSelectedService(service);
    setSearchTerm('');
    setPagination((current) => ({ ...current, page: 1 }));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      reviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      reviewsRef.current?.focus({ preventScroll: true });
    }));
  }

  function showAllReviews() {
    setSelectedService('');
    setSearchTerm('');
    setPagination((current) => ({ ...current, page: 1 }));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      reviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      reviewsRef.current?.focus({ preventScroll: true });
    }));
  }

  if (!token) {
    return (
      <main className="admin-container anim-fade">
        <header className="patient-header"><Brand /></header>
        <div className="login-box card">
          <h2>Espace Administrateur</h2>
          <p className="login-desc">Accédez à la consultation des messages des patients</p>
          {error && <div className="error-alert">{error}</div>}
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Identifiant</label>
              <input type="text" className="form-input" value={username}
                onChange={(e) => setUsername(e.target.value)} placeholder="admin" required autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Mot de passe</label>
              <input type="password" className="form-input" value={password}
                onChange={(e) => setPassword(e.target.value)} required />
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
      <header className="admin-simple-header">
        <Brand />
        <div className="admin-top-actions">
          <button className="btn-secondary" onClick={() => setShowQrModal(!showQrModal)}>
            {showQrModal ? 'Masquer QR Code' : ' QR Code à scanner'}
          </button>
          <button className="btn-logout"
            onClick={() => { localStorage.removeItem('innov_admin'); setToken(''); }}>
            Déconnexion
          </button>
        </div>
      </header>

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
            <input type="text" className="form-input" value={qrUrlInput}
              onChange={(e) => setQrUrlInput(e.target.value)} />
          </div>
          <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => window.print()}>
             Imprimer l'affiche QR Code
          </button>
        </section>
      )}

      <div className="messages-heading">
        <div>
          <h1 className="admin-title">Messages des patients</h1>
          <p className="admin-subtitle">Consultez les remarques et retours d'expérience reçus</p>
        </div>
        <div className="badge-count-total">{stats.total} avis reçu(s)</div>
      </div>

      {serviceSummaries.length > 0 && (
        <section className="service-overview" aria-labelledby="service-overview-title">
          <div className="overview-heading">
            <div><h2 id="service-overview-title">Les services en un regard</h2>
              <p>Moyennes sur les notes reçues. Cliquez sur un service pour lire ses remarques.</p></div>
            <button type="button" className="btn-secondary" onClick={showAllReviews}>Tous les avis</button>
          </div>
          <div className="service-overview-list">
            {serviceSummaries.map(summary => {
              const service = ALL_SERVICES.find(s => s.label === summary.service);
              return <button type="button" key={summary.service}
                className={`service-overview-row ${selectedService === summary.service ? 'selected' : ''}`}
                aria-pressed={selectedService === summary.service}
                onClick={() => showServiceReviews(summary.service)}>
                <ServiceIcon id={service?.id || 'autre'} />
                <span className="overview-service"><strong>{summary.service}</strong>
                  <small>{summary.count} avis · {summary.comments} remarque{summary.comments > 1 ? 's' : ''}</small></span>
                <span className="overview-score">
                  <strong>{summary.average == null ? '—' : `${summary.average.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/5`}</strong>
                  {summary.average != null && <span className="score-track" aria-hidden="true"><span style={{ width: `${summary.average * 20}%` }} /></span>}
                  <small>{summary.rated ? `${summary.rated} note${summary.rated > 1 ? 's' : ''}` : 'Pas encore noté'}</small>
                </span>
                <span className="overview-link" aria-hidden="true">Voir les avis <span>›</span></span>
              </button>;
            })}
          </div>
          <p className="overview-footnote">Les moyennes sont calculées uniquement à partir des avis notés.</p>
        </section>
      )}

      <div ref={reviewsRef} tabIndex={-1} className="review-list-heading">
        <div><span className="section-kicker">Avis patients</span><h2>{selectedService || 'Tous les avis'}</h2></div>
        <span>{pagination.total} résultat{pagination.total > 1 ? 's' : ''}</span>
      </div>
      <div className="search-bar-wrap">
        <input type="text" className="form-input search-input"
          placeholder=" Rechercher par mot-clé, service ou contact..."
          value={searchTerm} onChange={(e) => {
            setSearchTerm(e.target.value);
            setPagination((current) => ({ ...current, page: 1 }));
          }} />
      </div>

      {error && <div className="error-alert">{error}</div>}

      <div className="feedbacks-list">
        {loadingFeedbacks ? (
          <div className="card empty-card">Chargement des avis...</div>
        ) : feedbacks.length === 0 ? (
          <div className="card empty-card">
            {searchTerm || selectedService ? 'Aucun message ne correspond à votre sélection.' : 'Aucun message reçu pour le moment.'}
          </div>
        ) : (
          feedbacks.map((item) => (
            <article key={item.id} className="patient-review">
              <header className="review-header">
                <strong>{feedbackServices(item).join(' · ')}</strong>
                <time dateTime={item.created_at}>
                  {new Date(item.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
              </header>
              <div className="review-rating">
                <StarDisplay rating={item.rating} />
              </div>
              <p className="review-message">{item.message?.trim() || <em>Aucune remarque écrite</em>}</p>
              {item.contact_email && (
                <div className="review-contact">
                   <strong>Contact laissé :</strong> {item.contact_email}
                </div>
              )}
            </article>
          ))
        )}
      </div>
      <Pagination pagination={pagination} onPageChange={(page) => {
        setPagination((current) => ({ ...current, page }));
        reviewsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }} />
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPER ADMIN
// ═══════════════════════════════════════════════════════════════════════════════
function SuperAdminView() {
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('innov_super_admin') || '');
  const [feedbacks, setFeedbacks] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [searchTerm, setSearchTerm] = useState('');
  const [archiveView, setArchiveView] = useState('active');
  const [overview, setOverview] = useState({ total: 0, archived: 0, storage: null });
  const [archiveYear, setArchiveYear] = useState(new Date().getFullYear() - 1);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
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

  async function loadFeedbacks(tok = token, page = pagination.page, search = searchTerm, archived = archiveView) {
    setLoadingFeedbacks(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50', archived });
      if (search.trim()) params.set('search', search.trim());
      const data = await req(`/api/super-admin/feedbacks?${params}`, {}, tok);
      setFeedbacks(data.items);
      setPagination(data.pagination);
    } finally {
      setLoadingFeedbacks(false);
    }
  }

  async function loadMeta(tok = token) {
    const [us, systemOverview] = await Promise.all([
      req('/api/super-admin/users', {}, tok),
      req('/api/super-admin/overview', {}, tok),
    ]);
    setUsers(us);
    setOverview(systemOverview);
  }

  async function load(tok = token) {
    await Promise.all([loadFeedbacks(tok, 1, '', 'active'), loadMeta(tok)]);
  }

  useEffect(() => {
    if (!token) return undefined;
    loadMeta().catch((err) => {
      setError(err.message);
      setToken('');
      localStorage.removeItem('innov_super_admin');
    });
    return undefined;
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const timer = window.setTimeout(() => {
      loadFeedbacks(token, pagination.page, searchTerm, archiveView).catch((err) => setError(err.message));
    }, searchTerm ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [token, pagination.page, searchTerm, archiveView]);

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
      await Promise.all([loadFeedbacks(), loadMeta()]);
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
      await loadMeta();
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteUser(id) {
    if (!window.confirm('Supprimer ce compte administrateur ?')) return;
    try {
      await req(`/api/super-admin/users/${id}`, { method: 'DELETE' });
      await loadMeta();
    } catch (err) {
      setError(err.message);
    }
  }

  async function downloadAnnualExport() {
    try {
      const response = await fetch(`${apiBase}/api/super-admin/feedbacks-export?year=${archiveYear}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Impossible de créer l’export.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `avis-innov-care-${archiveYear}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function archiveAnnualFeedbacks() {
    if (!window.confirm(`Avez-vous déjà téléchargé l’export ${archiveYear} ? Les avis seront conservés mais masqués de la vue courante.`)) return;
    try {
      const result = await req('/api/super-admin/feedbacks-archive', {
        method: 'POST', body: JSON.stringify({ year: archiveYear }),
      });
      setError('');
      await Promise.all([loadFeedbacks(token, 1, searchTerm, archiveView), loadMeta()]);
      window.alert(`${result.archived} avis archivés.`);
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
          <p className="login-desc">Gestion avancée &amp; suppression des messages</p>
          {error && <div className="error-alert">{error}</div>}
          <form onSubmit={login}>
            <div className="form-group">
              <label className="form-label">Mot de passe Super Admin</label>
              <input type="password" className="form-input" value={password}
                onChange={(e) => setPassword(e.target.value)} required />
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
        <button className="btn-logout"
          onClick={() => { localStorage.removeItem('innov_super_admin'); setToken(''); }}>
          Déconnexion Super Admin
        </button>
      </header>

      <div className="messages-heading">
        <div>
          <h1 className="admin-title">Gestion Super Admin</h1>
          <p className="admin-subtitle">Vous pouvez supprimer des avis et créer des comptes d'accès</p>
        </div>
        <div className="badge-count-total">{overview.total} avis actifs</div>
      </div>

      {error && <div className="error-alert">{error}</div>}

      {overview.storage?.warning && (
        <div className="storage-alert" role="alert">
          <strong>Stockage de la base à {overview.storage.percent}%</strong>
          <span>Exportez et archivez les anciennes années avant d’atteindre la limite.</span>
        </div>
      )}

      <section className="card annual-tools">
        <div>
          <h3>Conservation annuelle</h3>
          <p>Téléchargez d’abord le fichier CSV, puis archivez l’année pour alléger les vues quotidiennes.</p>
        </div>
        <div className="annual-tools-actions">
          <label>Année
            <input className="form-input" type="number" min="2020" max={new Date().getFullYear()}
              value={archiveYear} onChange={(e) => setArchiveYear(Number(e.target.value))} />
          </label>
          <button type="button" className="btn-secondary" onClick={downloadAnnualExport}>Télécharger le CSV</button>
          <button type="button" className="btn-archive" onClick={archiveAnnualFeedbacks}>Archiver l’année</button>
        </div>
        <small>{overview.archived || 0} avis archivés · Stockage estimé : {overview.storage?.percent ?? 0}% de 8 Go</small>
      </section>

      <div className="card" style={{ marginBottom: 30 }}>
        <h3 style={{ color: 'var(--primary-teal)', marginBottom: 12 }}>Créer un compte d'accès responsable</h3>
        <form onSubmit={createUser} className="user-create-form">
          <input className="form-input" placeholder="Identifiant (ex: reception)"
            value={newUser.username}
            onChange={(e) => setNewUser((u) => ({ ...u, username: e.target.value }))} required />
          <input className="form-input" placeholder="Nom complet"
            value={newUser.displayName}
            onChange={(e) => setNewUser((u) => ({ ...u, displayName: e.target.value }))} required />
          <input className="form-input" type="password" placeholder="Mot de passe (10 car. min)"
            value={newUser.password}
            onChange={(e) => setNewUser((u) => ({ ...u, password: e.target.value }))} required />
          <button type="submit" className="btn-primary" style={{ width: 'auto' }}>+ Ajouter</button>
        </form>
        <div style={{ marginTop: 16 }}>
          {users.map((u) => (
            <div key={u.id} className="user-item-row">
              <div><strong>{u.display_name}</strong> <small>({u.username})</small></div>
              <button className="btn-delete-msg" onClick={() => deleteUser(u.id)}>Supprimer le compte</button>
            </div>
          ))}
        </div>
      </div>

      <h2 style={{ fontSize: 20, color: 'var(--primary-teal)', marginBottom: 16 }}>
        Avis reçus ({pagination.total})
      </h2>
      <div className="admin-filter-row">
        <input type="search" className="form-input search-input"
          placeholder="Rechercher dans les avis..." value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPagination((current) => ({ ...current, page: 1 }));
          }} />
        <select className="form-input" value={archiveView} onChange={(e) => {
          setArchiveView(e.target.value);
          setPagination((current) => ({ ...current, page: 1 }));
        }}>
          <option value="active">Avis actifs</option>
          <option value="only">Avis archivés</option>
          <option value="all">Tous les avis</option>
        </select>
      </div>
      <div className="feedbacks-list">
        {loadingFeedbacks ? (
          <div className="card empty-card">Chargement des avis...</div>
        ) : feedbacks.length === 0 ? (
          <div className="card empty-card">Aucun avis ne correspond à cette sélection.</div>
        ) : feedbacks.map((item) => (
          <article key={item.id} className="card modern-message-banner">
            <div className="banner-top-bar">
              <div className="banner-service-tags">
                {item.service
                  ? item.service.split(', ').map((s) => (
                    <span key={s} className="service-banner-chip">{s}</span>
                  ))
                  : <span className="service-banner-chip">Réclamation générale</span>}
              </div>
              <div className="banner-date-badge">
                {new Date(item.created_at).toLocaleString('fr-FR')}
              </div>
            </div>
            <div className="banner-rating-row"><StarDisplay rating={item.rating} /></div>
            <div className="banner-message-body">
              <p className="banner-text">{item.message || <em>Aucun commentaire</em>}</p>
            </div>
            {item.contact_email && (
              <div className="banner-contact-badge">
                 <strong>Contact :</strong> {item.contact_email}
              </div>
            )}
            <div className="banner-footer-actions">
              <button type="button" className="btn-delete-action"
                disabled={deletingId === item.id}
                onClick={() => handleDeleteFeedback(item.id)}>
                {deletingId === item.id ? 'Suppression...' : ' Supprimer définitivement cet avis'}
              </button>
            </div>
          </article>
        ))}
      </div>
      <Pagination pagination={pagination} onPageChange={(page) => {
        setPagination((current) => ({ ...current, page }));
        window.scrollTo({ top: document.body.scrollHeight / 2, behavior: 'smooth' });
      }} />
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
