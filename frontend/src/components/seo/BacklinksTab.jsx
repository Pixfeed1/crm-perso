// src/components/seo/BacklinksTab.jsx
//
// Onglet "Backlinks" de la suite SEO : niches saisies en TEXTE, découverte de cibles
// (boule de neige rapide / graphe Common Crawl la nuit), vérification live, scoring
// (Open PageRank + CrUX), et outreach depuis le GMAIL PERSO (canal séparé du CRM client).
// Charte : tokens de thème, react-icons, aucune couleur en dur.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiLink, FiPlus, FiTrash2, FiPlay, FiRefreshCw, FiX, FiLoader, FiCpu,
  FiSend, FiCheckCircle, FiSlash, FiExternalLink, FiZap, FiEye, FiSearch
} from 'react-icons/fi';
import { seoBacklinksAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const Spinner = ({ size = 15 }) => (
  <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} className="inline-flex">
    <FiLoader size={size} />
  </motion.span>
);

const STATUT_BADGE = {
  nouveau: { cls: 'bg-neutral-bg text-neutral-text', label: 'Nouveau' },
  a_contacter: { cls: 'bg-info-bg text-info-text', label: 'À contacter' },
  contacte: { cls: 'bg-warning-bg text-warning-text', label: 'Contacté' },
  lien_obtenu: { cls: 'bg-success-bg text-success-text', label: '🔗 Lien obtenu' },
  refus: { cls: 'bg-danger-bg text-danger-text', label: 'Refus' },
  ecarte: { cls: 'bg-neutral-bg text-neutral-text', label: 'Écarté' }
};

const BacklinksTab = () => {
  const { toast } = useToast();
  const [niches, setNiches] = useState([]);
  const [status, setStatus] = useState(null); // config gmail/opr/crux/graph + job en cours
  const [activeNiche, setActiveNiche] = useState(null);
  const [targets, setTargets] = useState([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', site_cible: '', hubs: '', seeds: '' });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(''); // 'discover' | 'verify' | 'score'
  const pollRef = useRef(null);

  // Modale outreach
  const [outreachTarget, setOutreachTarget] = useState(null);
  const [draft, setDraft] = useState(null); // { subject, body }
  const [drafting, setDrafting] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [angle, setAngle] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const [n, s] = await Promise.all([seoBacklinksAPI.listNiches(), seoBacklinksAPI.status()]);
      setNiches(Array.isArray(n) ? n : []);
      setStatus(s);
      return { niches: n, status: s };
    } catch (e) {
      toast.error('Erreur de chargement des niches');
      return null;
    }
  }, [toast]);

  const loadTargets = useCallback(async (nicheId) => {
    setLoadingTargets(true);
    try {
      const t = await seoBacklinksAPI.listTargets(nicheId);
      setTargets(Array.isArray(t) ? t : []);
    } catch (e) {
      toast.error('Erreur de chargement des cibles');
    } finally {
      setLoadingTargets(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeNiche) loadTargets(activeNiche.id); }, [activeNiche, loadTargets]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Poll léger tant qu'un job tourne (découverte/vérif de la niche active).
  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const data = await load();
      const running = data && data.status && data.status.running_niche_id;
      if (!running) {
        clearInterval(pollRef.current); pollRef.current = null;
        setBusy('');
        if (activeNiche) loadTargets(activeNiche.id);
      }
    }, 4000);
  };

  const createNiche = async () => {
    if (!form.name.trim() || !form.hubs.trim()) { toast.error('Nom et hubs requis'); return; }
    setSaving(true);
    try {
      await seoBacklinksAPI.createNiche(form);
      toast.success('Niche créée');
      setShowCreate(false); setForm({ name: '', site_cible: '', hubs: '', seeds: '' });
      load();
    } catch (e) {
      toast.error(e.message || 'Erreur à la création');
    } finally { setSaving(false); }
  };

  const removeNiche = async (n) => {
    if (!window.confirm(`Supprimer la niche « ${n.name} » et toutes ses cibles ?`)) return;
    try {
      await seoBacklinksAPI.deleteNiche(n.id);
      if (activeNiche && activeNiche.id === n.id) { setActiveNiche(null); setTargets([]); }
      load();
    } catch (e) { toast.error('Suppression impossible'); }
  };

  const runAction = async (action, mode) => {
    if (!activeNiche) return;
    setBusy(action);
    try {
      if (action === 'discover') await seoBacklinksAPI.discover(activeNiche.id, mode);
      else if (action === 'verify') await seoBacklinksAPI.verify(activeNiche.id);
      else if (action === 'score') {
        const r = await seoBacklinksAPI.score(activeNiche.id);
        toast.success(`Scoring : ${r.scored} cibles (OPR ${r.opr_found}, CrUX ${r.crux_checked})`);
        setBusy(''); loadTargets(activeNiche.id); load();
        return;
      }
      toast.success(action === 'discover' ? (mode === 'graph' ? 'Scan du graphe lancé (long — batch)' : 'Boule de neige lancée') : 'Vérification live lancée');
      startPolling();
    } catch (e) {
      setBusy('');
      toast.error(e.message || 'Erreur au lancement');
    }
  };

  const setTargetStatus = async (t, statut, raison) => {
    try {
      await seoBacklinksAPI.updateTarget(t.id, { statut, raison_ecarte: raison || null });
      setTargets((list) => list.map((x) => x.id === t.id ? { ...x, statut } : x).filter((x) => statut !== 'ecarte' || x.id !== t.id));
      if (statut === 'lien_obtenu') toast.success('🔗 Lien marqué obtenu, bravo !');
    } catch (e) { toast.error('Mise à jour impossible'); }
  };

  const openOutreach = (t) => {
    setOutreachTarget(t); setDraft(null); setAngle('');
    setSendTo(t.contact_email || '');
    generateDraft(t, '');
  };

  const generateDraft = async (t, angleVal) => {
    setDrafting(true);
    try {
      const d = await seoBacklinksAPI.draftEmail(t.id, { angle: angleVal || undefined });
      setDraft(d);
    } catch (e) {
      toast.error(e.message || 'Échec de la rédaction');
    } finally { setDrafting(false); }
  };

  const send = async () => {
    if (!outreachTarget || !draft || !sendTo.trim()) { toast.error('Destinataire requis'); return; }
    setSending(true);
    try {
      const r = await seoBacklinksAPI.sendEmail(outreachTarget.id, { to: sendTo.trim(), subject: draft.subject, body: draft.body });
      toast.success(`Envoyé depuis ton Gmail — relance prévue le ${new Date(r.followup_date).toLocaleDateString('fr-FR')}`);
      setOutreachTarget(null);
      loadTargets(activeNiche.id);
    } catch (e) {
      toast.error(e.message || "Échec de l'envoi");
    } finally { setSending(false); }
  };

  const cfgWarn = status && (!status.gmail || !status.opr);

  return (
    <div className="space-y-4">
      {/* Bandeau config */}
      {cfgWarn && (
        <div className="bg-warning-bg text-warning-text border border-warning-text/30 rounded-lg p-3 text-sm">
          {!status.gmail && <div>⚠️ Gmail non configuré (GMAIL_USER + GMAIL_APP_PASSWORD dans le .env) — l'envoi est désactivé.</div>}
          {!status.opr && <div>⚠️ Clé Open PageRank absente (OPR_API_KEY) — le scoring d'autorité sera vide.</div>}
          {!status.graph_ready && <div className="text-text-muted">ℹ️ Graphe CC non téléchargé — la découverte « graphe » sera indisponible (la boule de neige marche sans).</div>}
        </div>
      )}

      {/* Niches */}
      <div className="bg-surface border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3 className="text-lg font-bold text-text-primary flex items-center gap-2"><FiLink /> Campagnes backlinks</h3>
          <button onClick={() => setShowCreate((v) => !v)} className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm flex items-center gap-2">
            <FiPlus size={15} /> Nouvelle niche
          </button>
        </div>

        <AnimatePresence>
          {showCreate && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="border border-border rounded-lg p-4 mb-3 space-y-3 bg-surface-muted/30">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Niche (texte libre)</label>
                    <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="ex : DAZ Studio"
                      className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="block text-xs text-text-muted mb-1">Ton site à faire linker</label>
                    <input value={form.site_cible} onChange={(e) => setForm((p) => ({ ...p, site_cible: e.target.value }))} placeholder="monsite.fr"
                      className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Sites hubs de la niche (séparés par des virgules) — ceux que toute la communauté linke</label>
                  <input value={form.hubs} onChange={(e) => setForm((p) => ({ ...p, hubs: e.target.value }))} placeholder="daz3d.com, renderosity.com"
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Seeds boule de neige (optionnel — défaut : les hubs)</label>
                  <input value={form.seeds} onChange={(e) => setForm((p) => ({ ...p, seeds: e.target.value }))} placeholder="blogfr-daz.fr, forum3d.fr"
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowCreate(false)} className="px-3 py-2 rounded-lg text-text-secondary hover:bg-surface-strong text-sm">Annuler</button>
                  <button onClick={createNiche} disabled={saving} className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm disabled:opacity-50">
                    {saving ? 'Création…' : 'Créer la niche'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {niches.length === 0 ? (
          <p className="text-text-muted text-sm py-4 text-center">Aucune niche. Crée ta première campagne (ex : DAZ Studio).</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {niches.map((n) => (
              <div key={n.id} className={`rounded-lg border px-3 py-2 flex items-center gap-2 cursor-pointer transition-colors ${activeNiche && activeNiche.id === n.id ? 'border-accent bg-accent/10' : 'border-border bg-surface-muted/40 hover:border-border-strong'}`}
                onClick={() => setActiveNiche(n)}>
                <div>
                  <div className="text-sm font-medium text-text-primary">{n.name}</div>
                  <div className="text-xs text-text-muted">
                    {n.nb_cibles} cible{n.nb_cibles > 1 ? 's' : ''}{n.liens_obtenus > 0 ? ` · 🔗 ${n.liens_obtenus}` : ''}
                    {status && status.running_niche_id === n.id && <span className="text-warning-text"> · job en cours…</span>}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeNiche(n); }} className="p-1 rounded text-text-muted hover:text-danger-text" title="Supprimer">
                  <FiTrash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cibles de la niche active */}
      {activeNiche && (
        <div className="bg-surface border border-border rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div>
              <h4 className="font-semibold text-text-primary">{activeNiche.name}</h4>
              {activeNiche.discovery_message && <p className="text-xs text-text-muted">{activeNiche.discovery_message}</p>}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => runAction('discover', 'keyword')} disabled={!!busy || (status && (status.running_niche_id || !status.anthropic))}
                className="px-3 py-1.5 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                title="Claude cherche sur le web les sites FR de la niche — plafonné à 25 recherches (~0,40 $ max)">
                {busy === 'discover' ? <Spinner /> : <FiSearch size={14} />} Recherche mot-clé
              </button>
              <button onClick={() => runAction('discover', 'snowball')} disabled={!!busy || (status && status.running_niche_id)}
                className="px-3 py-1.5 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                title="Rapide (minutes) : suit les liens depuis les seeds">
                {busy === 'discover' ? <Spinner /> : <FiPlay size={14} />} Boule de neige
              </button>
              <button onClick={() => runAction('discover', 'graph')} disabled={!!busy || (status && (status.running_niche_id || !status.graph_ready))}
                className="px-3 py-1.5 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                title="Exhaustif (heures) : scanne le graphe Common Crawl téléchargé">
                <FiZap size={14} /> Graphe CC
              </button>
              <button onClick={() => runAction('verify')} disabled={!!busy || (status && status.running_niche_id)}
                className="px-3 py-1.5 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                title="Re-visite les cibles : langue, vivant, email de contact">
                {busy === 'verify' ? <Spinner /> : <FiRefreshCw size={14} />} Vérif live
              </button>
              <button onClick={() => runAction('score')} disabled={!!busy}
                className="px-3 py-1.5 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
                title="Open PageRank + CrUX + score composite">
                {busy === 'score' ? <Spinner /> : <FiCheckCircle size={14} />} Scorer
              </button>
            </div>
          </div>

          {loadingTargets ? (
            <p className="text-text-muted text-sm py-6 text-center">Chargement…</p>
          ) : targets.length === 0 ? (
            <p className="text-text-muted text-sm py-6 text-center">Aucune cible. Lance une découverte (boule de neige pour un premier résultat rapide).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-muted border-b border-border">
                    <th className="px-3 py-2">Domaine</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">OPR</th>
                    <th className="px-3 py-2">Trafic</th>
                    <th className="px-3 py-2">Langue</th>
                    <th className="px-3 py-2">Statut</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((t) => {
                    const sb = STATUT_BADGE[t.statut] || STATUT_BADGE.nouveau;
                    return (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-surface-muted/30">
                        <td className="px-3 py-2">
                          <a href={`https://${t.domain}`} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-accent inline-flex items-center gap-1">
                            {t.domain} <FiExternalLink size={11} className="opacity-50" />
                          </a>
                          {t.title && <div className="text-xs text-text-muted truncate max-w-xs">{t.title}</div>}
                          {t.via === 'both' && <span className="text-xs px-1.5 py-0.5 rounded-full bg-success-bg text-success-text ml-1" title="Trouvé par les 2 moteurs (graphe + boule de neige)">×2</span>}
                          {(t.open_count > 0) && <span className="text-xs px-1.5 py-0.5 rounded-full bg-warning-bg text-warning-text ml-1" title="Email ouvert"><FiEye size={10} className="inline" /> ouvert{t.click_count > 0 ? ' · cliqué' : ''}</span>}
                        </td>
                        <td className="px-3 py-2 font-semibold text-text-primary">{t.score ?? '—'}</td>
                        <td className="px-3 py-2 text-text-secondary">{t.opr != null ? Number(t.opr).toFixed(1) : '—'}</td>
                        <td className="px-3 py-2">{t.crux === true ? <span title="Présent dans CrUX : trafic réel mesuré par Google">📈 réel</span> : t.crux === false ? <span className="text-text-muted" title="Absent de CrUX">faible</span> : '—'}</td>
                        <td className="px-3 py-2 text-text-secondary">{t.lang || '—'}</td>
                        <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sb.cls}`}>{sb.label}</span></td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {t.statut !== 'lien_obtenu' && (
                            <>
                              <button onClick={() => openOutreach(t)} disabled={status && !status.gmail}
                                className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-surface-strong disabled:opacity-40"
                                title={status && !status.gmail ? 'Configure Gmail dans le .env' : 'Rédiger et envoyer une demande de lien (depuis ton Gmail)'}>
                                <FiSend size={14} />
                              </button>
                              <button onClick={() => setTargetStatus(t, 'lien_obtenu')} className="p-1.5 rounded-lg text-text-muted hover:text-success-text hover:bg-surface-strong" title="Lien obtenu !">
                                <FiCheckCircle size={14} />
                              </button>
                              <button onClick={() => setTargetStatus(t, 'ecarte', 'écarté manuellement')} className="p-1.5 rounded-lg text-text-muted hover:text-danger-text hover:bg-surface-strong" title="Écarter">
                                <FiSlash size={14} />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modale outreach : rédaction Claude + envoi Gmail */}
      <AnimatePresence>
        {outreachTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setOutreachTarget(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="panel-bg border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-6 py-4 border-b border-border">
                <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><FiCpu size={18} /> Demande de lien — {outreachTarget.domain}</h2>
                <button onClick={() => setOutreachTarget(null)} className="text-text-muted hover:text-text-primary"><FiX size={20} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-text-muted mb-1">Angle (optionnel — ex : « j'ai adoré leur tuto sur X »)</label>
                    <input value={angle} onChange={(e) => setAngle(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary text-sm focus:outline-none focus:border-accent" />
                  </div>
                  <button onClick={() => generateDraft(outreachTarget, angle)} disabled={drafting}
                    className="px-3 py-2 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-1.5 disabled:opacity-50">
                    {drafting ? <Spinner /> : <FiRefreshCw size={14} />} Régénérer
                  </button>
                </div>

                {drafting ? (
                  <div className="flex items-center gap-2 text-text-secondary text-sm py-8 justify-center"><Spinner size={18} /> Claude rédige…</div>
                ) : draft ? (
                  <>
                    <div>
                      <label className="block text-sm text-text-secondary mb-1">Destinataire</label>
                      <input type="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="contact@site.fr"
                        className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" />
                      {!outreachTarget.contact_email && <p className="text-xs text-warning-text mt-1">Pas d'email détecté — lance « Vérif live » ou cherche-le sur le site.</p>}
                    </div>
                    <div>
                      <label className="block text-sm text-text-secondary mb-1">Objet</label>
                      <input value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                        className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" />
                    </div>
                    <div>
                      <label className="block text-sm text-text-secondary mb-1">Message (à relire — envoyé depuis TON Gmail)</label>
                      <textarea value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} rows={10}
                        className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent resize-y" />
                    </div>
                  </>
                ) : null}
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-border">
                <button onClick={() => setOutreachTarget(null)} className="flex-1 px-4 py-2.5 border-2 border-border text-text-primary hover:bg-surface-strong rounded-lg font-medium">Annuler</button>
                <button onClick={send} disabled={sending || drafting || !draft || !sendTo.trim()}
                  className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                  <FiSend size={16} /> {sending ? 'Envoi…' : 'Envoyer via Gmail'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BacklinksTab;
