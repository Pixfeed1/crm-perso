// src/components/crawl/CrawlPanel.jsx
//
// Onglet "Crawl" du Portefeuille : pilote l'outil externe (cc_prospector), suit la
// progression, affiche les sites trouvés, exporte en CSV et transforme en prospects.
// Charte : tokens de thème, react-icons, framer-motion. Aucune couleur en dur.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiDownload, FiUserPlus, FiGlobe, FiCheckCircle, FiAlertTriangle, FiLoader, FiTrash2, FiClock, FiSlash, FiX } from 'react-icons/fi';
import { crawlAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const TECHNOS = [
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'prestashop', label: 'PrestaShop' }
];
const technoLabel = (v) => (TECHNOS.find((t) => t.value === v) || {}).label || v;

// Badge de statut de job — tokens sémantiques.
const STATUT_BADGE = {
  pending: { cls: 'bg-neutral-bg text-neutral-text', label: 'En attente' },
  running: { cls: 'bg-warning-bg text-warning-text', label: 'En cours' },
  done: { cls: 'bg-success-bg text-success-text', label: 'Terminé' },
  error: { cls: 'bg-danger-bg text-danger-text', label: 'Erreur' }
};
const statutBadge = (s) => STATUT_BADGE[s] || STATUT_BADGE.pending;

const formatDateTime = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Badges plateforme — classes basées sur les tokens sémantiques (aucune couleur en dur).
const PLATFORM_BADGE = {
  WooCommerce: 'bg-info-bg text-info-text',
  PrestaShop: 'bg-warning-bg text-warning-text',
  Shopify: 'bg-success-bg text-success-text',
  WordPress: 'bg-neutral-bg text-neutral-text',
  Inconnu: 'bg-neutral-bg text-neutral-text'
};
const platformBadge = (p) => PLATFORM_BADGE[p] || 'bg-neutral-bg text-neutral-text';

const CrawlPanel = () => {
  const { toast } = useToast();
  const [techno, setTechno] = useState('ecommerce');
  const [nbSites, setNbSites] = useState(50);
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [platformFilter, setPlatformFilter] = useState('all');
  const [showNocode, setShowNocode] = useState(false); // masquer les sites no-code par défaut
  const [starting, setStarting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pbTarget, setPbTarget] = useState(null); // { ids: [...] } pour "Pas de business"
  const [pbNote, setPbNote] = useState('');
  const [pbSaving, setPbSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const pollRef = useRef(null);

  const running = job && (job.statut === 'running' || job.statut === 'pending');

  const loadHistory = useCallback(async () => {
    try {
      const data = await crawlAPI.list();
      setHistory(data || []);
      return data || [];
    } catch (error) {
      console.error('Erreur historique crawl:', error);
      return [];
    }
  }, []);

  // Au montage : charge l'historique et reprend le polling si un job tourne encore.
  useEffect(() => {
    (async () => {
      const data = await loadHistory();
      const active = data.find((j) => j.statut === 'running' || j.statut === 'pending');
      if (active) setJobId(active.id);
    })();
  }, [loadHistory]);

  const poll = useCallback(async (id) => {
    try {
      const data = await crawlAPI.get(id);
      setJob(data.job);
      setResults(data.results || []);
      if (data.job && (data.job.statut === 'done' || data.job.statut === 'error')) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        loadHistory();
      }
    } catch (error) {
      console.error('Erreur suivi crawl:', error);
    }
  }, [loadHistory]);

  useEffect(() => {
    if (!jobId) return undefined;
    poll(jobId);
    pollRef.current = setInterval(() => poll(jobId), 2000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [jobId, poll]);

  const handleStart = async () => {
    try {
      setStarting(true);
      setResults([]); setSelected(new Set()); setJob(null);
      const res = await crawlAPI.start(techno, nbSites);
      setJobId(res.id);
      loadHistory();
    } catch (error) {
      toast.error(error.message || 'Impossible de lancer le crawl');
    } finally {
      setStarting(false);
    }
  };

  // Recharge un crawl passé (sans le relancer).
  const selectFromHistory = (id) => {
    if (id === jobId) return;
    setResults([]); setSelected(new Set()); setJob(null);
    setJobId(id);
  };

  const handleDeleteJob = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await crawlAPI.delete(id);
      setHistory((prev) => prev.filter((j) => j.id !== id));
      if (id === jobId) { setJobId(null); setJob(null); setResults([]); setSelected(new Set()); }
      toast.success('Crawl supprimé');
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const handleExport = async () => {
    try {
      const res = await crawlAPI.exportCsv(jobId);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m ? m[1] : 'crawl.csv';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error('Erreur lors du téléchargement du CSV');
    }
  };

  const toggle = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const handleAddProspects = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      setAdding(true);
      const res = await crawlAPI.toProspect(jobId, ids);
      toast.success(`${res.created} prospect${res.created > 1 ? 's' : ''} créé${res.created > 1 ? 's' : ''}`);
      setSelected(new Set());
      poll(jobId);
    } catch (error) {
      toast.error(error.message || "Erreur lors de l'ajout aux prospects");
    } finally {
      setAdding(false);
    }
  };

  // "Pas de business" : crée des leads en statut pas_business (+ note), traités/exclus.
  const confirmPasBusiness = async () => {
    if (!pbTarget || pbTarget.ids.length === 0) return;
    try {
      setPbSaving(true);
      const res = await crawlAPI.toProspect(jobId, pbTarget.ids, { relation_status: 'pas_business', note: pbNote });
      toast.success(`${res.created} site${res.created > 1 ? 's' : ''} classé${res.created > 1 ? 's' : ''} « Pas de business »`);
      setPbTarget(null); setPbNote('');
      setSelected(new Set());
      poll(jobId);
    } catch (error) {
      toast.error(error.message || 'Erreur lors du classement');
    } finally {
      setPbSaving(false);
    }
  };

  // Sites no-code/SaaS fermés masqués par défaut (filtrables via le bouton dédié).
  const nocodeCount = results.filter((r) => r.is_nocode).length;
  const baseResults = showNocode ? results : results.filter((r) => !r.is_nocode);
  const platforms = Array.from(new Set(baseResults.map((r) => r.platform || 'Inconnu')));
  const visible = platformFilter === 'all' ? baseResults : baseResults.filter((r) => (r.platform || 'Inconnu') === platformFilter);
  const selectableVisible = visible.filter((r) => !r.added_as_prospect);

  const progressPct = job && job.progress_total > 0 ? Math.round((job.progress_done / job.progress_total) * 100) : 0;

  return (
    <div>
      {/* Formulaire */}
      <div className="bg-surface border border-border rounded-2xl p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm text-text-secondary mb-1">Techno</label>
            <select
              value={techno}
              onChange={(e) => setTechno(e.target.value)}
              disabled={running}
              className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
            >
              {TECHNOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">Nombre de sites</label>
            <div className="flex items-center gap-3">
              <input
                type="range" min="5" max="200" step="5"
                value={Math.min(nbSites || 5, 200)}
                onChange={(e) => setNbSites(parseInt(e.target.value, 10))}
                disabled={running}
                className="flex-1 accent-accent disabled:opacity-50"
              />
              <input
                type="number" min="1" max="5000"
                value={nbSites}
                onChange={(e) => setNbSites(e.target.value === '' ? '' : Math.max(1, Math.min(5000, parseInt(e.target.value, 10) || 0)))}
                onBlur={(e) => { if (e.target.value === '' || parseInt(e.target.value, 10) < 1) setNbSites(5); }}
                disabled={running}
                className="w-20 px-2 py-2 bg-surface-muted border border-border rounded-lg text-text-primary text-center focus:outline-none focus:border-accent disabled:opacity-50"
              />
            </div>
          </div>
          <div>
            <button
              onClick={handleStart}
              disabled={running || starting}
              className="w-full px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <FiSearch size={16} /> {running ? 'Crawl en cours…' : 'Lancer le crawl'}
            </button>
          </div>
        </div>
      </div>

      {/* Historique des crawls */}
      {history.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5 mb-5">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-3">
            <FiClock size={15} /> Historique des crawls
          </h3>
          <div className="space-y-2">
            {history.map((j) => {
              const sb = statutBadge(j.statut);
              const isCurrent = j.id === jobId;
              return (
                <div
                  key={j.id}
                  onClick={() => selectFromHistory(j.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    isCurrent ? 'border-accent bg-surface-muted/60' : 'border-border bg-surface-muted/30 hover:bg-surface-muted/60'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary">{technoLabel(j.techno)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sb.cls}`}>{sb.label}</span>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {formatDateTime(j.created_at)} · {j.nb_sites} sites demandés · {j.nb_results} résultat{j.nb_results > 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteJob(j.id, e)}
                    className="p-2 rounded-lg text-text-muted hover:text-danger-text hover:bg-surface-strong flex-shrink-0"
                    title="Supprimer ce crawl"
                  >
                    <FiTrash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pendant le job : loader + phase */}
      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-surface border border-border rounded-2xl p-6 mb-5 text-center"
          >
            <motion.div
              className="inline-flex text-accent mb-3"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <FiLoader size={28} />
            </motion.div>
            {job.phase === 'detection' && job.progress_total > 0 ? (
              <>
                <p className="text-text-primary font-medium">Détection… {job.progress_done}/{job.progress_total}</p>
                <div className="mt-3 max-w-md mx-auto h-2 bg-surface-strong rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-accent rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </>
            ) : (
              <p className="text-text-primary font-medium">Recherche des sites…</p>
            )}
            <p className="text-text-muted text-sm mt-2">Cela peut prendre quelques minutes.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Erreur */}
      {job && job.statut === 'error' && (
        <div className="bg-danger-bg text-danger-text border border-border rounded-2xl p-4 mb-5 flex items-start gap-3">
          <FiAlertTriangle className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Le crawl a échoué</p>
            <p className="text-sm whitespace-pre-wrap break-words mt-1">{job.message || 'Erreur inconnue'}</p>
          </div>
        </div>
      )}

      {/* Résultats */}
      {job && job.statut === 'done' && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPlatformFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${platformFilter === 'all' ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}
              >
                Tous ({baseResults.length})
              </button>
              {platforms.map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${platformFilter === p ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}
                >
                  {p}
                </button>
              ))}
              {nocodeCount > 0 && (
                <button
                  onClick={() => { setShowNocode((v) => !v); setPlatformFilter('all'); }}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${showNocode ? 'bg-accent text-white' : 'bg-surface-strong text-text-muted hover:bg-border-strong'}`}
                  title="Sites no-code/SaaS fermés (Wix, Squarespace, Webador…) — sans intérêt"
                >
                  {showNocode ? 'Masquer no-code' : `No-code exclus (${nocodeCount})`}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={handleExport} className="px-3 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg text-sm flex items-center gap-1">
                <FiDownload size={15} /> Télécharger le CSV
              </button>
              <button
                onClick={handleAddProspects}
                disabled={adding || selected.size === 0}
                className="px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
              >
                <FiUserPlus size={15} /> Ajouter aux prospects{selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
              <button
                onClick={() => { setPbNote(''); setPbTarget({ ids: [...selected] }); }}
                disabled={selected.size === 0}
                className="px-3 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
                title="Classer la sélection en « Pas de business »"
              >
                <FiSlash size={15} /> Pas de business{selected.size > 0 ? ` (${selected.size})` : ''}
              </button>
            </div>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-12 bg-surface/30 rounded-lg border border-border">
              <FiGlobe className="w-12 h-12 mx-auto text-text-muted mb-3" />
              <p className="text-text-muted">Aucun site trouvé pour ce crawl.</p>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-muted">
                    <tr className="text-left text-text-muted">
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectableVisible.length > 0 && selectableVisible.every((r) => selected.has(r.id))}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) selectableVisible.forEach((r) => n.add(r.id));
                              else selectableVisible.forEach((r) => n.delete(r.id));
                              return n;
                            });
                          }}
                        />
                      </th>
                      <th className="px-4 py-3">Domaine</th>
                      <th className="px-4 py-3">Plateforme</th>
                      <th className="px-4 py-3">Titre</th>
                      <th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visible.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-muted/50 transition-colors">
                        <td className="px-4 py-3">
                          {r.added_as_prospect ? (
                            <FiCheckCircle className="text-success-text" />
                          ) : (
                            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                          )}
                        </td>
                        <td className="px-4 py-3 text-text-primary">
                          {r.final_url ? (
                            <a href={r.final_url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{r.domain}</a>
                          ) : r.domain}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${platformBadge(r.platform)}`}>
                            {r.platform || 'Inconnu'}
                          </span>
                          {r.added_as_prospect && (
                            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-success-bg text-success-text">Déjà prospect</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-text-secondary truncate max-w-xs">{r.title || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {!r.added_as_prospect && (
                            <button
                              onClick={() => { setPbNote(''); setPbTarget({ ids: [r.id] }); }}
                              className="p-2 rounded-lg text-text-muted hover:text-danger-text hover:bg-surface-strong"
                              title="Pas de business"
                            >
                              <FiSlash size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modale note "Pas de business" */}
      <AnimatePresence>
        {pbTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setPbTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="panel-bg border border-border rounded-2xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-border">
                <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><FiSlash size={18} /> Pas de business</h2>
                <button onClick={() => setPbTarget(null)} className="text-text-muted hover:text-text-primary"><FiX size={20} /></button>
              </div>
              <div className="p-6 space-y-3">
                <p className="text-sm text-text-secondary">
                  {pbTarget.ids.length} site{pbTarget.ids.length > 1 ? 's' : ''} seront classés « Pas de business » : créés comme contacts non actifs (reprospectables depuis Suivi), exclus des prochains crawls.
                </p>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Note (optionnel)</label>
                  <textarea value={pbNote} onChange={(e) => setPbNote(e.target.value)} rows={3}
                    placeholder="Pourquoi ce n'est pas du business ? (déjà un presta, pas la cible, etc.)"
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-y" />
                </div>
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-border">
                <button onClick={() => setPbTarget(null)}
                  className="flex-1 px-4 py-2.5 border-2 border-border text-text-primary hover:bg-surface-strong rounded-lg font-medium transition-all">
                  Annuler
                </button>
                <button onClick={confirmPasBusiness} disabled={pbSaving}
                  className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  <FiSlash size={16} /> {pbSaving ? 'Classement…' : 'Classer'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CrawlPanel;
