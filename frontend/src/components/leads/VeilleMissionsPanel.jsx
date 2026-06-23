// src/components/leads/VeilleMissionsPanel.jsx
//
// Onglet "Veille missions" de la Prospection : annonces freelance récupérées (Jooble),
// qualifiées au LLM, affichées en cartes (score, raisons, brouillon de réponse).
// Tokens de thème, react-icons, framer-motion, aucune couleur en dur.
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiCpu, FiSliders, FiExternalLink, FiCopy, FiEdit2, FiXCircle, FiRefreshCw,
  FiPlay, FiCheck, FiX, FiAlertCircle, FiLoader
} from 'react-icons/fi';
import { veilleAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

// Spinner animé (framer-motion).
const Spinner = ({ size = 16 }) => (
  <motion.span
    animate={{ rotate: 360 }}
    transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
    className="inline-flex"
  >
    <FiLoader size={size} />
  </motion.span>
);

// Libellé d'étape de run.
const ETAPE_LABEL = {
  recuperation: 'Récupération des annonces…',
  filtrage: 'Filtrage…',
  qualification: 'Qualification IA…',
  termine: 'Terminé',
  erreur: 'Erreur'
};

// Métadonnées du label de score -> classes tokens.
const scoreMeta = (label, score) => {
  const l = label || (score >= 70 ? 'fort' : score >= 40 ? 'à vérifier' : 'faible');
  if (l === 'fort') return { cls: 'bg-success-bg text-success-text', txt: 'match fort' };
  if (l === 'à vérifier') return { cls: 'bg-warning-bg text-warning-text', txt: 'à vérifier' };
  return { cls: 'bg-danger-bg text-danger-text', txt: 'faible' };
};

const ilYaJours = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const j = Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
  return j === 0 ? "aujourd'hui" : j === 1 ? 'il y a 1 j' : `il y a ${j} j`;
};

const VeilleMissionsPanel = () => {
  const { toast } = useToast();
  const [annonces, setAnnonces] = useState([]);
  const [criteres, setCriteres] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runState, setRunState] = useState(null); // { etape, message, error } pendant/après le run
  const pollRef = useRef(null);
  const [showCriteres, setShowCriteres] = useState(false);
  const [scoreFilter, setScoreFilter] = useState('all'); // all | fort | verifier | faible
  const [search, setSearch] = useState('');
  const [statutView, setStatutView] = useState('actives'); // 'actives' | 'ecartees'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // actives -> sans param (le backend exclut les écartées) ; ecartees -> statut=ecarte
      const params = statutView === 'ecartees' ? { statut: 'ecarte' } : {};
      const [a, c] = await Promise.all([
        veilleAPI.getAnnonces(params),
        veilleAPI.getCriteres().catch(() => null)
      ]);
      setAnnonces(Array.isArray(a) ? a : []);
      setCriteres(c);
    } catch (e) {
      toast.error('Erreur lors du chargement de la veille');
    } finally {
      setLoading(false);
    }
  }, [toast, statutView]);

  useEffect(() => { load(); }, [load]);

  // Nettoyage du polling au démontage.
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const finishRun = useCallback((status) => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setRunning(false);
    setRunState(status);
    if (status && status.etape === 'erreur') {
      toast.error(status.error || 'Erreur lors du run');
    } else {
      const n = status && status.report ? status.report.retenues : 0;
      toast.success(n > 0 ? `${n} nouvelle(s) annonce(s)` : 'Aucune nouvelle annonce cette fois');
      load();
    }
  }, [toast, load]);

  const runNow = async () => {
    if (running) return;
    setRunning(true);
    setRunState({ etape: 'recuperation', message: 'Démarrage…' });
    try {
      await veilleAPI.run(); // 202 : lancé en arrière-plan (ou 409 si déjà en cours)
    } catch (e) {
      // 409 = un run est déjà en cours -> on suit quand même via le polling.
      if (!/déjà en cours|already/i.test(e.message || '')) {
        setRunning(false);
        setRunState({ etape: 'erreur', error: e.message || 'Erreur lors du lancement (clés API configurées ?)' });
        toast.error(e.message || 'Erreur lors du lancement du run');
        return;
      }
    }
    // Polling de l'étape courante toutes les 2 s.
    pollRef.current = setInterval(async () => {
      try {
        const s = await veilleAPI.runStatus();
        setRunState(s);
        if (s && !s.running) finishRun(s);
      } catch (e) {
        finishRun({ etape: 'erreur', error: 'Suivi interrompu' });
      }
    }, 2000);
  };

  const ecarter = async (id) => {
    const prev = annonces;
    // Retrait optimiste : l'annonce disparaît immédiatement (animation de sortie).
    setAnnonces((list) => list.filter((a) => a.id !== id));
    try {
      await veilleAPI.ecarter(id);
    } catch (e) {
      setAnnonces(prev); // rollback
      toast.error(e.message || "Impossible d'écarter l'annonce");
    }
  };

  const reactiver = async (id) => {
    const prev = annonces;
    setAnnonces((list) => list.filter((a) => a.id !== id)); // quitte la vue "Écartées"
    try {
      await veilleAPI.reactiver(id);
      toast.success('Annonce réactivée');
    } catch (e) {
      setAnnonces(prev);
      toast.error(e.message || 'Impossible de réactiver l\'annonce');
    }
  };

  const copier = async (texte) => {
    try { await navigator.clipboard.writeText(texte || ''); toast.success('Brouillon copié'); }
    catch { toast.info('Copie impossible'); }
  };

  const aujourdhui = useMemo(
    () => annonces.filter((a) => a.statut !== 'ecarte' && ilYaJours(a.created_at) === "aujourd'hui").length,
    [annonces]
  );

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return annonces.filter((a) => {
      if (scoreFilter === 'fort' && (a.score_label || '') !== 'fort') return false;
      if (scoreFilter === 'verifier' && (a.score_label || '') !== 'à vérifier') return false;
      if (scoreFilter === 'faible' && (a.score_label || '') !== 'faible') return false;
      if (q && !`${a.titre} ${a.entreprise} ${a.raison}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [annonces, scoreFilter, search]);

  const FILTERS = [
    { key: 'all', label: 'Toutes' },
    { key: 'fort', label: 'Match fort' },
    { key: 'verifier', label: 'À vérifier' },
    { key: 'faible', label: 'Faibles' }
  ];

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="bg-surface border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
              <FiCpu size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-text-primary">Veille missions</h3>
              <p className="text-sm text-text-muted">{aujourdhui} annonce{aujourdhui > 1 ? 's' : ''} qualifiée{aujourdhui > 1 ? 's' : ''} aujourd'hui</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Rafraîchir"><FiRefreshCw size={16} /></button>
            <button onClick={runNow} disabled={running} className="px-3 py-2 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
              {running ? <Spinner size={15} /> : <FiPlay size={15} />}
              {running ? 'Recherche en cours…' : 'Lancer la veille'}
            </button>
            <button onClick={() => setShowCriteres((v) => !v)} className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm flex items-center gap-2">
              <FiSliders size={15} /> Mes critères
            </button>
          </div>
        </div>

        {/* Rappel des critères en pastilles */}
        {criteres && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs px-2 py-1 rounded-full bg-success-bg text-success-text">Requis : {(criteres.mots_requis || []).length}</span>
            <span className="text-xs px-2 py-1 rounded-full bg-danger-bg text-danger-text">Exclus : {(criteres.mots_exclus || []).length}</span>
            {criteres.full_remote_only && <span className="text-xs px-2 py-1 rounded-full bg-info-bg text-info-text">Full remote</span>}
            <span className="text-xs px-2 py-1 rounded-full bg-neutral-bg text-neutral-text">TJM ≥ {criteres.tjm_min} €</span>
            <span className="text-xs px-2 py-1 rounded-full bg-neutral-bg text-neutral-text">Run {criteres.heure_run}</span>
          </div>
        )}

        {/* Indicateur de progression / résultat du run */}
        <AnimatePresence>
          {(running || (runState && (runState.etape === 'erreur' || runState.etape === 'termine'))) && (
            <motion.div
              initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`mt-3 flex items-center gap-2 rounded-lg p-3 text-sm border ${
                runState && runState.etape === 'erreur'
                  ? 'bg-danger-bg text-danger-text border-danger-text/30'
                  : runState && runState.etape === 'termine'
                  ? 'bg-success-bg text-success-text border-success-text/30'
                  : 'bg-info-bg text-info-text border-info-text/30'
              }`}
            >
              {running ? <Spinner size={16} /> : runState && runState.etape === 'erreur' ? <FiAlertCircle size={16} /> : <FiCheck size={16} />}
              <div className="min-w-0">
                <div>
                  {running
                    ? (runState && (runState.message || ETAPE_LABEL[runState.etape])) || 'Analyse des annonces en cours, cela peut prendre une minute…'
                    : runState && runState.etape === 'erreur'
                    ? (runState.error || 'Erreur lors du run')
                    : (runState && runState.message) || 'Terminé'}
                </div>
                {/* Récap chiffré des étapes (après le run) */}
                {!running && runState && runState.report && (
                  <div className="text-xs opacity-80 mt-0.5">
                    {runState.report.recuperees} récupérées → {runState.report.apres_prefiltre_langue} filtrées → {runState.report.qualifiees_ia} qualifiées → {runState.report.retenues} retenues
                    {runState.report.sources && (
                      <> · France Travail {runState.report.sources.france_travail.retenues} · JSearch {runState.report.sources.jsearch.retenues} · Jooble {runState.report.sources.jooble.retenues}</>
                    )}
                    {runState.report.rejets && (
                      <> · rejets : {runState.report.rejets.non_francophone} langue, {runState.report.rejets.non_remote} sur site, {runState.report.rejets.tjm_insuffisant} TJM, {runState.report.rejets.doublon} doublons</>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Panneau critères */}
      <AnimatePresence>
        {showCriteres && criteres && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <CriteresEditor criteres={criteres} onClose={() => setShowCriteres(false)} onSaved={(c) => { setCriteres(c); setShowCriteres(false); toast.success('Critères enregistrés'); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vue Actives / Écartées */}
      <div className="flex gap-2">
        {[{ key: 'actives', label: 'Actives' }, { key: 'ecartees', label: 'Écartées' }].map((v) => (
          <button key={v.key} onClick={() => setStatutView(v.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statutView === v.key ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Filtres rapides */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setScoreFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${scoreFilter === f.key ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher (techno, entreprise…)"
          className="flex-1 bg-surface-muted/50 border border-border rounded-lg px-3 py-2 text-text-primary placeholder-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent" />
      </div>

      {/* Liste */}
      {loading ? (
        <p className="text-text-muted text-sm py-8 text-center">Chargement…</p>
      ) : visibles.length === 0 ? (
        <div className="text-center py-10 bg-surface/30 rounded-xl border border-border">
          <FiCpu className="w-10 h-10 mx-auto text-text-muted mb-3" />
          <p className="text-text-muted text-sm">
            {statutView === 'ecartees' ? 'Aucune annonce écartée.' : 'Aucune annonce. Lance la veille ou ajuste tes critères.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {visibles.map((a) => (
              <AnnonceCard key={a.id} annonce={a} onEcarter={ecarter} onReactiver={reactiver} onCopier={copier} ecartee={statutView === 'ecartees'} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

const AnnonceCard = ({ annonce, onEcarter, onReactiver, onCopier, ecartee }) => {
  const sm = scoreMeta(annonce.score_label, annonce.score);
  const ecarte = annonce.statut === 'ecarte';
  const faible = (annonce.score_label || '') === 'faible';
  const [editing, setEditing] = useState(false);
  const [brouillon, setBrouillon] = useState(annonce.brouillon || '');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}
      className={`bg-surface border border-border rounded-xl p-4 transition-opacity ${ecarte || faible ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-text-primary font-semibold break-words">{annonce.titre}</h4>
          <div className="text-xs text-text-muted mt-0.5 flex items-center gap-2 flex-wrap">
            {annonce.entreprise && <span>{annonce.entreprise}</span>}
            {annonce.source_label && <span className="text-info-text">{annonce.source_label}</span>}
            <span>· {ilYaJours(annonce.created_at) || ilYaJours(annonce.date_annonce)}</span>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${sm.cls}`}>
          {annonce.score} % · {sm.txt}
        </span>
      </div>

      {/* Pastilles raisons */}
      <div className="flex flex-wrap gap-2 mt-2">
        {annonce.full_remote && <span className="text-xs px-2 py-0.5 rounded-full bg-info-bg text-info-text">Full remote</span>}
        {annonce.montant && <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{annonce.montant}</span>}
        {annonce.raison && <span className="text-xs px-2 py-0.5 rounded-full bg-surface-strong text-text-secondary">{annonce.raison}</span>}
      </div>

      {/* Brouillon */}
      <div className="mt-3 bg-surface-muted/50 border border-border rounded-lg p-3">
        <div className="flex items-center gap-1.5 text-xs text-text-muted mb-1">
          <FiAlertCircle size={12} /> Brouillon de réponse (à relire avant envoi)
        </div>
        {editing ? (
          <textarea value={brouillon} onChange={(e) => setBrouillon(e.target.value)} rows={4}
            className="w-full bg-surface-muted/50 border border-border rounded-lg px-3 py-2 text-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent" />
        ) : (
          <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">{brouillon || '—'}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {annonce.lien && (
          <a href={annonce.lien} target="_blank" rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm flex items-center gap-1.5">
            <FiExternalLink size={14} /> Ouvrir l'offre
          </a>
        )}
        <button onClick={() => onCopier(brouillon)} className="px-3 py-1.5 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-1.5">
          <FiCopy size={14} /> Copier le brouillon
        </button>
        <button onClick={() => setEditing((v) => !v)} className="px-3 py-1.5 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-1.5">
          {editing ? <><FiCheck size={14} /> Terminer</> : <><FiEdit2 size={14} /> Éditer</>}
        </button>
        {ecartee ? (
          <button onClick={() => onReactiver(annonce.id)} className="px-3 py-1.5 rounded-lg text-accent hover:bg-surface-strong text-sm flex items-center gap-1.5 ml-auto">
            <FiRefreshCw size={14} /> Réactiver
          </button>
        ) : (
          <button onClick={() => onEcarter(annonce.id)} className="px-3 py-1.5 rounded-lg text-text-muted hover:text-danger-text hover:bg-surface-strong text-sm flex items-center gap-1.5 ml-auto">
            <FiXCircle size={14} /> Écarter
          </button>
        )}
      </div>
    </motion.div>
  );
};

// Éditeur de critères (mots requis/exclus, TJM, full remote, heure du run).
const CriteresEditor = ({ criteres, onClose, onSaved }) => {
  const { toast } = useToast();
  const [form, setForm] = useState({
    mots_requis: (criteres.mots_requis || []).join(', '),
    mots_exclus: (criteres.mots_exclus || []).join(', '),
    tjm_min: criteres.tjm_min,
    full_remote_only: criteres.full_remote_only,
    garder_sans_montant: criteres.garder_sans_montant,
    heure_run: criteres.heure_run,
    actif: criteres.actif
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        mots_requis: form.mots_requis.split(',').map((s) => s.trim()).filter(Boolean),
        mots_exclus: form.mots_exclus.split(',').map((s) => s.trim()).filter(Boolean),
        tjm_min: parseInt(form.tjm_min, 10) || 0,
        full_remote_only: !!form.full_remote_only,
        garder_sans_montant: !!form.garder_sans_montant,
        heure_run: form.heure_run,
        actif: !!form.actif
      };
      const updated = await veilleAPI.updateCriteres(payload);
      onSaved(updated);
    } catch (e) {
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full bg-surface-muted/50 border border-border rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

  return (
    <div className="bg-surface border border-border rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-text-primary">Mes critères de veille</h4>
        <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong"><FiX size={16} /></button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-text-muted mb-1">Mots requis (séparés par des virgules)</label>
          <textarea value={form.mots_requis} onChange={(e) => setForm((p) => ({ ...p, mots_requis: e.target.value }))} rows={2} className={field} />
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Mots exclus (séparés par des virgules)</label>
          <textarea value={form.mots_exclus} onChange={(e) => setForm((p) => ({ ...p, mots_exclus: e.target.value }))} rows={2} className={field} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">TJM minimum (€)</label>
            <input type="number" value={form.tjm_min} onChange={(e) => setForm((p) => ({ ...p, tjm_min: e.target.value }))} className={field} />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Heure du run (HH:MM)</label>
            <input type="text" value={form.heure_run} onChange={(e) => setForm((p) => ({ ...p, heure_run: e.target.value }))} placeholder="07:30" className={field} />
          </div>
          <div className="flex flex-col gap-2 justify-end">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={form.full_remote_only} onChange={(e) => setForm((p) => ({ ...p, full_remote_only: e.target.checked }))} className="accent-accent" /> Full remote seulement
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={form.garder_sans_montant} onChange={(e) => setForm((p) => ({ ...p, garder_sans_montant: e.target.checked }))} className="accent-accent" /> Garder sans montant
            </label>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={form.actif} onChange={(e) => setForm((p) => ({ ...p, actif: e.target.checked }))} className="accent-accent" /> Veille active (run quotidien)
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-text-secondary hover:bg-surface-strong text-sm" disabled={saving}>Annuler</button>
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm disabled:opacity-50">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </div>
  );
};

export default VeilleMissionsPanel;
