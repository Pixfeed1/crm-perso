// src/components/suivi/SuiviCockpit.jsx
//
// Cockpit "Suivi" : vrai poste de prospection. Source unique = table interactions.
// Bandeau de compteurs cliquables, recherche + filtre plateforme + onglets, liste
// lisible (statut, dernier contact, prochaine relance + canal), actions rapides.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiBell, FiAlertTriangle, FiStar, FiMessageCircle, FiSlash, FiSearch,
  FiPhone, FiMail, FiFileText, FiCheck, FiRotateCcw, FiClock, FiMoon, FiTrendingUp,
  FiFacebook, FiInstagram
} from 'react-icons/fi';
import { interactionsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import LogExchangeModal from '../common/LogExchangeModal';
import InteractionHistoryModal from '../common/InteractionHistoryModal';
import QuickEmail from '../common/QuickEmail';
import { statusMeta, reachedMeta, channelLabel } from '../../utils/relationStatus';
import { decodeHtml } from '../../utils/decodeHtml';

const fmtDM = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};
const dayOf = (s) => { const d = new Date(s); d.setHours(0, 0, 0, 0); return d; };

// Urgence de la prochaine relance : rouge (aujourd'hui/en retard), orange (<=3j), gris (aucune).
const relanceUrgency = (dateStr) => {
  if (!dateStr) return { cls: 'text-text-muted', label: 'Aucune relance' };
  const today = dayOf(new Date());
  const d = dayOf(dateStr);
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0) return { cls: 'bg-danger-bg text-danger-text', label: `En retard (${fmtDM(dateStr)})` };
  if (diff === 0) return { cls: 'bg-danger-bg text-danger-text', label: "Aujourd'hui" };
  if (diff <= 3) return { cls: 'bg-warning-bg text-warning-text', label: fmtDM(dateStr) };
  return { cls: 'bg-neutral-bg text-neutral-text', label: fmtDM(dateStr) };
};

const lastContactLabel = (r) => {
  if (!r.last_date) return 'jamais contacté';
  const rm = reachedMeta(r.last_reached);
  return rm ? `${rm.verb} le ${fmtDM(r.last_date)}` : `contacté le ${fmtDM(r.last_date)}`;
};

const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const COUNTERS = [
  { key: 'ouverts', label: 'Chauds (ont ouvert)', icon: FiTrendingUp },
  { key: 'relance_today', label: 'À relancer aujourd\'hui', icon: FiBell },
  { key: 'overdue', label: 'En retard', icon: FiAlertTriangle },
  { key: 'dormants', label: 'Dormants (90j+)', icon: FiMoon },
  { key: 'nouveaux', label: 'Nouveaux à traiter', icon: FiStar },
  { key: 'en_discussion', label: 'En discussion', icon: FiMessageCircle },
  { key: 'sans_reponse', label: 'Sans réponse', icon: FiPhone }
];

const TABS = [
  { key: 'ouverts', label: 'Chauds' },
  { key: 'relance_today', label: 'À relancer' },
  { key: 'overdue', label: 'En retard' },
  { key: 'dormants', label: 'Dormants' },
  { key: 'nouveaux', label: 'Nouveaux' },
  { key: 'contacte', label: 'Contactés' },
  { key: 'en_discussion', label: 'En discussion' },
  { key: 'devis_envoye', label: 'Devis envoyé' },
  { key: 'gagne_perdu', label: 'Gagné/Perdu' },
  { key: 'pas_business', label: 'Pas de business' },
  { key: 'all', label: 'Tous' }
];

// Dormant : contact ACTIF déjà contacté (y compris client gagné — c'est la base qui répond
// à ~20% !), dernier échange il y a 90j+ et AUCUNE relance planifiée = chaud mais oublié.
const isDormant = (r, today) => Boolean(
  r.relation_status !== 'pas_business' && !r.next_followup && r.last_date
  && (today - dayOf(r.last_date)) > 90 * 86400000
);

const matchesFilter = (r, filter) => {
  const today = dayOf(new Date());
  const active = r.relation_status !== 'pas_business';
  switch (filter) {
    case 'relance_today': return active && r.next_followup && dayOf(r.next_followup).getTime() === today.getTime();
    case 'overdue': return active && r.next_followup && dayOf(r.next_followup) < today;
    case 'dormants': return isDormant(r, today);
    case 'ouverts': return active && (r.email_opens > 0 || r.email_clicks > 0);
    case 'nouveaux': return r.relation_status === 'nouveau';
    case 'contacte': return r.relation_status === 'contacte';
    case 'en_discussion': return r.relation_status === 'en_discussion';
    case 'devis_envoye': return r.relation_status === 'devis_envoye';
    case 'gagne_perdu': return r.relation_status === 'gagne' || r.relation_status === 'perdu';
    case 'pas_business': return r.relation_status === 'pas_business';
    case 'sans_reponse': return active && r.relation_status !== 'gagne' && r.relation_status !== 'perdu' && r.last_reached === 'pas_reponse';
    case 'all':
    default: return active;
  }
};

const SuiviCockpit = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('all');
  const [data, setData] = useState({ stats: {}, contacts: [] });
  const [loading, setLoading] = useState(true);
  const [logTarget, setLogTarget] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await interactionsAPI.getCockpit();
      // Décodage des entités HTML des libellés scrapés (nom + site), une seule fois :
      // profite à l'affichage, à la recherche et aux modales (log/historique).
      const clean = res && Array.isArray(res.contacts)
        ? { ...res, contacts: res.contacts.map((c) => ({ ...c, contact_name: decodeHtml(c.contact_name), site: decodeHtml(c.site) })) }
        : res;
      setData(clean || { stats: {}, contacts: [] });
    } catch (error) {
      console.error('Erreur cockpit suivi:', error);
      toast.error('Erreur lors du chargement du suivi');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const platforms = useMemo(
    () => Array.from(new Set((data.contacts || []).map((c) => c.platform).filter(Boolean))).sort(),
    [data.contacts]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data.contacts || []).filter((r) => {
      if (!matchesFilter(r, filter)) return false;
      if (platform !== 'all' && (r.platform || '') !== platform) return false;
      if (q) {
        const hay = `${r.contact_name || ''} ${r.site || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data.contacts, filter, platform, search]);

  const openLog = (r, type) => setLogTarget({
    contact_type: r.contact_type, contact_id: r.contact_id, name: r.contact_name,
    phone: r.contact_phone, type, relation_status: r.relation_status, reprogram: false
  });

  const markDone = async (r) => {
    if (!r.followup_id) return;
    try {
      const res = await interactionsAPI.markFollowupDone(r.followup_id, true);
      // Cascade auto : si le backend a déjà programmé la relance suivante (J+7), on l'annonce
      // et on n'ouvre PAS la modale de reprogrammation (déjà fait).
      const auto = res && res.next_followup_created;
      if (auto) {
        const d = auto.next_followup_date;
        toast.success(`Relance clôturée — prochaine relance auto le ${d ? new Date(d).toLocaleDateString('fr-FR') : 'J+7'}`);
        load();
        return;
      }
      toast.success('Relance clôturée');
      // Sinon (relance manuelle ou fin de cascade) : propose d'en reprogrammer une.
      setLogTarget({
        contact_type: r.contact_type, contact_id: r.contact_id, name: r.contact_name,
        phone: r.contact_phone, type: 'note', relation_status: r.relation_status, reprogram: true
      });
      load();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  // Relance multi-canal : ouvre le profil social + logge la relance + clôt la relance
  // email en cours (on bascule de canal) + programme un rappel J+4.
  const relanceSocial = async (r, canal) => {
    const url = canal === 'facebook' ? r.facebook_url : r.instagram_url;
    if (url) window.open(url, '_blank', 'noopener');
    const j4 = new Date(); j4.setDate(j4.getDate() + 4);
    try {
      await interactionsAPI.create({
        contact_type: r.contact_type, contact_id: r.contact_id, type: 'note',
        notes: `Relance via ${canal === 'facebook' ? 'Facebook' : 'Instagram'}`,
        result: `outreach:${canal}:sent`,
        next_followup_date: j4.toISOString().slice(0, 10), next_followup_channel: 'autre'
      });
      if (r.followup_id) await interactionsAPI.markFollowupDone(r.followup_id, true);
      toast.success(`Relance ${canal === 'facebook' ? 'Facebook' : 'Instagram'} enregistrée`);
      load();
    } catch (e) { toast.error('Erreur lors de la relance sociale'); }
  };

  const setStatus = async (r, status) => {
    try {
      await interactionsAPI.setContactStatus(r.contact_type, r.contact_id, status);
      const msg = status === 'pas_business' ? 'Classé « Pas de business »'
        : status === 'en_discussion' ? 'Marqué « a répondu » — relances auto stoppées'
        : 'Contact réactivé';
      toast.success(msg);
      load();
    } catch (error) {
      toast.error('Erreur lors du changement de statut');
    }
  };

  // Deep-link direct vers la fiche du prospect (au lieu de la liste). Clients -> onglet clients.
  const goToContact = (r) => navigate(
    r.contact_type === 'lead' ? `/leads?lead=${r.contact_id}` : '/portefeuille?tab=clients'
  );

  const stats = data.stats || {};

  return (
    <div>
      {/* Barre d'actions : envoi rapide (email libre, sans prospect) */}
      <div className="flex justify-end mb-3">
        <QuickEmail />
      </div>
      {/* Bandeau de compteurs cliquables */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 mb-5">
        {COUNTERS.map((c) => {
          const Icon = c.icon;
          const isActive = filter === c.key;
          return (
            <button key={c.key} onClick={() => setFilter(c.key)}
              className={`text-left bg-surface border rounded-xl p-3 transition-all ${isActive ? 'border-accent' : 'border-border hover:border-border-strong'}`}>
              <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1">
                <Icon size={14} /> <span className="truncate">{c.label}</span>
              </div>
              <div className="text-xl font-bold text-text-primary">{stats[c.key] || 0}</div>
            </button>
          );
        })}
      </div>

      {/* Barre : recherche + plateforme */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un contact ou un site…"
            className="w-full pl-9 pr-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}
          className="px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent">
          <option value="all">Toutes plateformes</option>
          {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === t.key ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <p className="text-text-muted text-sm py-8 text-center">Chargement…</p>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 bg-surface/30 rounded-lg border border-border">
          <FiBell className="w-12 h-12 mx-auto text-text-muted mb-3" />
          <p className="text-text-muted">Aucun contact pour ce filtre.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {visible.map((r) => {
              const sm = statusMeta(r.relation_status);
              const urg = relanceUrgency(r.next_followup);
              const isPB = r.relation_status === 'pas_business';
              return (
                <motion.div
                  key={`${r.contact_type}-${r.contact_id}`}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={`bg-surface border border-border rounded-xl p-3 flex items-center gap-3 transition-colors ${isPB ? 'opacity-60' : 'hover:border-border-strong'}`}
                >
                  <button onClick={() => goToContact(r)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="w-10 h-10 rounded-full bg-accent/15 text-accent flex items-center justify-center text-sm font-semibold flex-shrink-0">
                      {initials(r.contact_name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium text-text-primary truncate ${isPB ? 'line-through' : ''}`}>{r.contact_name || 'Contact'}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sm.cls}`}>{sm.label}</span>
                        <span className="text-xs text-text-muted">{r.contact_type === 'lead' ? 'Prospect' : 'Client'}</span>
                        {r.email_opens > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-warning-bg text-warning-text"
                            title={`Email ouvert ${r.email_opens} fois${r.email_clicks > 0 ? `, ${r.email_clicks} clic(s)` : ''}`}>
                            🔥 Ouvert{r.email_opens > 1 ? ` ×${r.email_opens}` : ''}{r.email_clicks > 0 ? ' · cliqué' : ''}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-text-muted mt-0.5 truncate">
                        {[r.site, r.platform].filter(Boolean).join(' · ')}{(r.site || r.platform) ? ' — ' : ''}{lastContactLabel(r)}
                      </div>
                    </div>
                  </button>

                  {/* Prochaine relance */}
                  <div className="hidden sm:block flex-shrink-0 text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${urg.cls}`}>
                      {r.next_followup_channel ? `${channelLabel(r.next_followup_channel)} · ` : ''}{urg.label}
                    </span>
                  </div>

                  {/* Actions rapides */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setHistoryTarget({ contact_type: r.contact_type, contact_id: r.contact_id, name: r.contact_name })} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Voir l'historique des échanges"><FiClock size={15} /></button>
                    {!isPB && (
                      <>
                        <button onClick={() => openLog(r, 'appel')} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Enregistrer un appel"><FiPhone size={15} /></button>
                        <button onClick={() => openLog(r, 'email')} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Enregistrer un email"><FiMail size={15} /></button>
                        <button onClick={() => openLog(r, 'note')} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Ajouter une note"><FiFileText size={15} /></button>
                        {r.contact_type === 'lead' && r.relation_status !== 'en_discussion' && (
                          <button onClick={() => setStatus(r, 'en_discussion')} className="p-2 rounded-lg text-info-text hover:bg-info-bg" title="Le prospect a répondu (arrête les relances auto)"><FiMessageCircle size={15} /></button>
                        )}
                        {r.facebook_url && (
                          <button onClick={() => relanceSocial(r, 'facebook')} className="p-2 rounded-lg text-text-muted hover:text-info-text hover:bg-info-bg" title="Relancer sur Facebook (ouvre le profil + logue la relance)"><FiFacebook size={15} /></button>
                        )}
                        {r.instagram_url && (
                          <button onClick={() => relanceSocial(r, 'instagram')} className="p-2 rounded-lg text-text-muted hover:text-info-text hover:bg-info-bg" title="Relancer sur Instagram (ouvre le profil + logue la relance)"><FiInstagram size={15} /></button>
                        )}
                        {r.followup_id && (
                          <button onClick={() => markDone(r)} className="p-2 rounded-lg text-success-text hover:bg-success-bg" title="Relance faite"><FiCheck size={15} /></button>
                        )}
                        <button onClick={() => setStatus(r, 'pas_business')} className="p-2 rounded-lg text-text-muted hover:text-danger-text hover:bg-surface-strong" title="Pas de business"><FiSlash size={15} /></button>
                      </>
                    )}
                    {isPB && (
                      <button onClick={() => setStatus(r, 'a_contacter')} className="px-3 py-2 rounded-lg text-accent hover:bg-surface-strong text-sm flex items-center gap-1" title="Réactiver">
                        <FiRotateCcw size={14} /> Réactiver
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <LogExchangeModal
        isOpen={!!logTarget}
        onClose={() => setLogTarget(null)}
        onSaved={load}
        contactType={logTarget?.contact_type}
        contactId={logTarget?.contact_id}
        contactName={logTarget?.name}
        phone={logTarget?.phone}
        defaultType={logTarget?.type || 'appel'}
        currentStatus={logTarget?.relation_status || 'nouveau'}
      />

      <InteractionHistoryModal
        isOpen={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        contactType={historyTarget?.contact_type}
        contactId={historyTarget?.contact_id}
        contactName={historyTarget?.name}
      />
    </div>
  );
};

export default SuiviCockpit;
