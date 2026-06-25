// src/pages/Seo.jsx
//
// Module SEO (étape 1) : tableau de bord multi-site du "jus interne".
// Sélecteur de site, vue d'ensemble (santé), carte de flux (PageRank), liste des pages
// triées par jus, et section "pages affamées" avec liens internes suggérés.
// Données en LECTURE SEULE (worker Python seo_worker). Tokens de thème, react-icons, framer-motion.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  FiShare2, FiRefreshCw, FiTrendingUp, FiAlertTriangle, FiLink, FiArrowRight, FiExternalLink,
  FiPlay, FiLoader, FiCheckCircle, FiXCircle, FiClock, FiStopCircle, FiSlash, FiSearch, FiTarget
} from 'react-icons/fi';
import { seoAPI } from '../services/api';
import { useToast } from '../hooks/useToast';
import SeoGraph from '../components/seo/SeoGraph';

const HEALTH_META = {
  orpheline: { cls: 'bg-danger-bg text-danger-text', label: 'Orpheline' },
  affamee: { cls: 'bg-warning-bg text-warning-text', label: 'Affamée' },
  reservoir: { cls: 'bg-info-bg text-info-text', label: 'Réservoir' },
  saine: { cls: 'bg-success-bg text-success-text', label: 'Saine' }
};
const healthBadge = (h) => HEALTH_META[h] || { cls: 'bg-neutral-bg text-neutral-text', label: 'Non calculé' };
// Badge d'indexation à partir du coverageState GSC (texte libre Google, EN).
const indexBadge = (s) => {
  if (!s) return null;
  const low = s.toLowerCase();
  if (low.includes('not indexed') || low.includes('excluded') || low.includes('error') || low.includes('noindex')) {
    return { cls: 'bg-warning-bg text-warning-text', label: 'Non indexée' };
  }
  if (low.includes('indexed') || low.includes('submitted and indexed')) {
    return { cls: 'bg-success-bg text-success-text', label: 'Indexée' };
  }
  return { cls: 'bg-neutral-bg text-neutral-text', label: s.length > 22 ? s.slice(0, 21) + '…' : s };
};
const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
const fmtPos = (n) => (n == null ? '—' : Number(n).toFixed(1));
const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const Seo = () => {
  const { toast } = useToast();
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState(null);
  const [overview, setOverview] = useState(null);
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [pages, setPages] = useState([]);
  const [affamees, setAffamees] = useState([]);
  const [orphelines, setOrphelines] = useState([]);
  const [quasiVictoires, setQuasiVictoires] = useState([]);
  const [gscStatus, setGscStatus] = useState(null); // { connected, account_email, updated_at }
  const [tab, setTab] = useState('jus'); // 'jus' | 'affamees' | 'orphelines' | 'quasi'
  const [sort, setSort] = useState('pagerank');
  const [healthFilter, setHealthFilter] = useState('all'); // filtre liste des pages
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState(null);        // dernier job du site
  const [starting, setStarting] = useState(false);
  const jobPollRef = useRef(null);

  useEffect(() => {
    seoAPI.getSites()
      .then((s) => { setSites(s || []); if (s && s.length) setSiteId(s[0].id); else setLoading(false); })
      .catch(() => { toast.error('Erreur chargement des sites SEO'); setLoading(false); });
    seoAPI.getGscStatus().then((g) => setGscStatus(g)).catch(() => {});
  }, [toast]);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const pagesParams = { sort, limit: 500 };
      if (healthFilter !== 'all') pagesParams.health = healthFilter;
      const [ov, gr, pg, af, orph, qv] = await Promise.all([
        seoAPI.getOverview(siteId),
        seoAPI.getGraph(siteId),
        seoAPI.getPages(siteId, pagesParams),
        seoAPI.getAffamees(siteId),
        seoAPI.getPages(siteId, { health: 'orpheline', sort: 'value', limit: 500 }),
        seoAPI.getQuasiVictoires(siteId)
      ]);
      setOverview(ov); setGraph(gr || { nodes: [], edges: [] });
      setPages(pg || []); setAffamees(af || []); setOrphelines(orph || []); setQuasiVictoires(qv || []);
    } catch (e) {
      toast.error('Erreur chargement SEO');
    } finally {
      setLoading(false);
    }
  }, [siteId, sort, healthFilter, toast]);

  useEffect(() => { load(); }, [load]);

  // Suivi du job de crawl : polling tant qu'il est pending/running ; recharge à la fin.
  const stopJobPoll = () => { if (jobPollRef.current) { clearInterval(jobPollRef.current); jobPollRef.current = null; } };
  // Un job est "actif" tant qu'il n'est pas terminé (cancel_requested = annulation en cours).
  const isActiveStatus = (s) => s === 'pending' || s === 'running' || s === 'cancel_requested';
  const pollJob = useCallback((sid) => {
    stopJobPoll();
    jobPollRef.current = setInterval(async () => {
      try {
        const j = await seoAPI.getJob(sid);
        setJob(j);
        if (!j || !isActiveStatus(j.status)) {
          stopJobPoll();
          if (j && j.status === 'done') { toast.success('Crawl terminé'); load(); }
          if (j && j.status === 'failed') toast.error('Crawl en échec');
          if (j && j.status === 'cancelled') { toast.info('Crawl annulé'); load(); }
        }
      } catch (e) { stopJobPoll(); }
    }, 5000);
  }, [load, toast]);

  // Au changement de site : lire l'état du job, et reprendre le polling s'il est actif.
  useEffect(() => {
    if (!siteId) return;
    stopJobPoll();
    seoAPI.getJob(siteId).then((j) => {
      setJob(j);
      if (j && isActiveStatus(j.status)) pollJob(siteId);
    }).catch(() => {});
    return stopJobPoll;
  }, [siteId, pollJob]);

  const launchCrawl = async (jobType) => {
    if (!siteId) return;
    setStarting(true);
    try {
      const res = await seoAPI.createJob(siteId, jobType);
      setJob(res.job);
      const labels = { crawl_full: 'Crawl complet lancé', crawl_incremental: 'Crawl lancé', gsc_sync: 'Synchro Search Console lancée' };
      if (res.already_active) toast.info('Une tâche est déjà en cours pour ce site');
      else toast.success(labels[jobType] || 'Tâche lancée');
      pollJob(siteId);
    } catch (e) {
      toast.error(e.message || 'Impossible de lancer le crawl');
    } finally {
      setStarting(false);
    }
  };

  const cancelCrawl = async () => {
    if (!job || !job.id) return;
    setStarting(true);
    try {
      const res = await seoAPI.cancelJob(job.id);
      if (res.job) setJob(res.job);
      toast.info(res.job && res.job.status === 'cancelled' ? 'Crawl annulé' : 'Arrêt du crawl demandé…');
      pollJob(siteId);
    } catch (e) {
      toast.error(e.message || "Impossible d'arrêter le crawl");
    } finally {
      setStarting(false);
    }
  };

  const jobActive = job && isActiveStatus(job.status);
  const jobCancellable = job && (job.status === 'pending' || job.status === 'running');
  const jobNoun = job && job.job_type === 'gsc_sync' ? 'Synchro Search Console' : 'Crawl';
  const gscConnected = gscStatus && gscStatus.connected;

  const cards = overview ? [
    { label: 'Pages', value: overview.total_pages, icon: FiShare2 },
    { label: 'Liens internes', value: overview.total_links, icon: FiLink },
    { label: 'Orphelines', value: overview.orphelines, cls: 'text-danger-text' },
    { label: 'Affamées', value: overview.affamees, cls: 'text-warning-text' },
    { label: 'Réservoirs', value: overview.reservoirs, cls: 'text-info-text' },
    { label: 'Saines', value: overview.saines, cls: 'text-success-text' },
    ...(overview.gsc_pages ? [
      { label: 'Impressions 28j', value: fmtNum(overview.gsc_impressions) },
      { label: 'Clics 28j', value: fmtNum(overview.gsc_clicks) }
    ] : [])
  ] : [];

  return (
    <div className="h-full flex flex-col overflow-y-auto p-2 sm:p-4">
      <div className="max-w-6xl mx-auto w-full">
        {/* En-tête + sélecteur de site */}
        <header className="mb-5 pt-16 sm:pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
              <FiShare2 size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">SEO — Jus interne</h1>
              <p className="text-text-muted text-sm">
                Maillage interne &amp; PageRank maison{overview && ` · dernier crawl : ${fmtDate(overview.last_crawl)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={siteId || ''}
              onChange={(e) => setSiteId(parseInt(e.target.value, 10))}
              className="px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              {sites.map((s) => <option key={s.id} value={s.id}>{s.domain}</option>)}
            </select>
            <button
              onClick={() => launchCrawl('crawl_incremental')}
              disabled={starting || jobActive}
              className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Lancer un crawl incrémental"
            >
              <FiPlay size={15} /> Lancer le crawl
            </button>
            <button
              onClick={() => launchCrawl('crawl_full')}
              disabled={starting || jobActive}
              className="px-3 py-2 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="Reconstruction complète du graphe"
            >
              Complet
            </button>
            <button
              onClick={() => launchCrawl('gsc_sync')}
              disabled={starting || jobActive || !gscConnected}
              className="px-3 py-2 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={gscConnected ? 'Synchroniser Google Search Console' : 'Search Console non connecté (lancer gsc_auth.py)'}
            >
              <FiSearch size={15} /> Search Console
            </button>
            {jobCancellable && (
              <button
                onClick={cancelCrawl}
                disabled={starting}
                className="px-3 py-2 rounded-lg bg-danger-bg text-danger-text border border-danger-text/30 hover:bg-danger-bg/70 text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Arrêter le crawl en cours"
              >
                <FiStopCircle size={15} /> Arrêter
              </button>
            )}
            <button onClick={load} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Rafraîchir"><FiRefreshCw size={16} /></button>
          </div>
        </header>

        {/* État du dernier job de crawl */}
        {job && (
          <div className="mb-4">
            {job.status === 'running' ? (
              <div className="inline-flex items-center gap-2 text-sm bg-info-bg text-info-text border border-info-text/30 rounded-lg px-3 py-2">
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} className="inline-flex"><FiLoader size={15} /></motion.span>
                {jobNoun} en cours{job.progress_total ? ` — ${job.progress_current}/${job.progress_total}` : '…'}
              </div>
            ) : job.status === 'pending' ? (
              <div className="inline-flex items-center gap-2 text-sm bg-neutral-bg text-neutral-text border border-border rounded-lg px-3 py-2">
                <FiClock size={15} /> {jobNoun} en attente…
              </div>
            ) : job.status === 'cancel_requested' ? (
              <div className="inline-flex items-center gap-2 text-sm bg-warning-bg text-warning-text border border-warning-text/30 rounded-lg px-3 py-2">
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} className="inline-flex"><FiLoader size={15} /></motion.span>
                Annulation en cours…
              </div>
            ) : job.status === 'cancelled' ? (
              <div className="inline-flex items-center gap-2 text-sm bg-neutral-bg text-neutral-text border border-border rounded-lg px-3 py-2">
                <FiSlash size={15} /> {jobNoun} annulé{job.finished_at ? ` · ${fmtDate(job.finished_at)}` : ''}
              </div>
            ) : job.status === 'failed' ? (
              <div className="inline-flex items-center gap-2 text-sm bg-danger-bg text-danger-text border border-danger-text/30 rounded-lg px-3 py-2">
                <FiXCircle size={15} /> Dernière tâche en échec{job.error ? ` : ${job.error}` : ''}
              </div>
            ) : job.status === 'done' ? (
              <div className="inline-flex items-center gap-2 text-sm bg-success-bg text-success-text border border-success-text/30 rounded-lg px-3 py-2">
                <FiCheckCircle size={15} /> {jobNoun} terminé{job.finished_at ? ` · ${fmtDate(job.finished_at)}` : ''}
              </div>
            ) : null}
          </div>
        )}

        {/* État de connexion Google Search Console */}
        {gscStatus && (
          <div className="mb-4">
            {gscConnected ? (
              <div className="inline-flex items-center gap-2 text-sm bg-success-bg text-success-text border border-success-text/30 rounded-lg px-3 py-2">
                <FiSearch size={14} /> Search Console connecté{gscStatus.account_email ? ` · ${gscStatus.account_email}` : ''}
              </div>
            ) : (
              <div className="inline-flex items-start gap-2 text-sm bg-warning-bg text-warning-text border border-warning-text/30 rounded-lg px-3 py-2">
                <FiSearch size={14} className="mt-0.5 flex-shrink-0" />
                <span>Search Console non connecté. Lancez le consentement une fois&nbsp;: <code className="px-1 rounded bg-surface-strong/60">python gsc_auth.py</code> (voir seo_worker/README.md).</span>
              </div>
            )}
          </div>
        )}

        {sites.length === 0 && !loading ? (
          <div className="text-center py-16 bg-surface/30 rounded-xl border border-border">
            <FiShare2 className="w-10 h-10 mx-auto text-text-muted mb-3" />
            <p className="text-text-muted text-sm">Aucun site SEO. Le worker <code className="text-text-primary">seo_worker</code> les créera à son premier run.</p>
          </div>
        ) : (
          <>
            {/* Vue d'ensemble */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 mb-5">
              {cards.map((c) => (
                <div key={c.label} className="bg-surface border border-border rounded-xl p-3">
                  <div className="text-text-muted text-xs mb-1">{c.label}</div>
                  <div className={`text-xl font-bold ${c.cls || 'text-text-primary'}`}>{c.value ?? '—'}</div>
                </div>
              ))}
            </div>

            {/* Onglets */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {[
                { k: 'jus', l: 'Jus interne' },
                { k: 'affamees', l: `Pages affamées${affamees.length ? ` (${affamees.length})` : ''}` },
                { k: 'orphelines', l: `Orphelines${orphelines.length ? ` (${orphelines.length})` : ''}` },
                { k: 'quasi', l: `Quasi-victoires${quasiVictoires.length ? ` (${quasiVictoires.length})` : ''}` }
              ].map((t) => (
                <button key={t.k} onClick={() => setTab(t.k)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.k ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>
                  {t.l}
                </button>
              ))}
            </div>

            {loading ? (
              <p className="text-text-muted text-sm py-10 text-center">Chargement…</p>
            ) : tab === 'jus' ? (
              <>
                {/* Carte de flux */}
                <div className="bg-surface border border-border rounded-xl p-4 mb-5">
                  <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2"><FiTrendingUp size={15} /> Carte du jus interne</h3>
                  <SeoGraph data={graph} />
                </div>

                {/* Liste des pages triée par jus */}
                <div className="bg-surface border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h3 className="text-sm font-semibold text-text-primary">Pages ({pages.length})</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-text-muted text-xs">Trier</span>
                      <div className="flex gap-1">
                        {[{ k: 'pagerank', l: 'Jus' }, { k: 'value', l: 'Valeur' }].map((s) => (
                          <button key={s.k} onClick={() => setSort(s.k)}
                            className={`px-3 py-1 rounded-lg text-xs ${sort === s.k ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>
                            {s.l}
                          </button>
                        ))}
                      </div>
                      <span className="text-text-muted text-xs ml-2">État</span>
                      <div className="flex gap-1 flex-wrap">
                        {[
                          { k: 'all', l: 'Toutes' },
                          { k: 'orpheline', l: 'Orphelines' },
                          { k: 'affamee', l: 'Affamées' },
                          { k: 'reservoir', l: 'Réservoirs' },
                          { k: 'saine', l: 'Saines' }
                        ].map((h) => (
                          <button key={h.k} onClick={() => setHealthFilter(h.k)}
                            className={`px-3 py-1 rounded-lg text-xs ${healthFilter === h.k ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>
                            {h.l}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-text-muted text-xs text-left border-b border-border">
                          <th className="py-2 pr-2">Page</th>
                          <th className="py-2 px-2 text-right">Jus</th>
                          <th className="py-2 px-2 text-right">Liens entrants</th>
                          <th className="py-2 px-2 text-right">Valeur</th>
                          <th className="py-2 px-2 text-right">Impr.</th>
                          <th className="py-2 px-2 text-right">Clics</th>
                          <th className="py-2 px-2 text-right">Pos.</th>
                          <th className="py-2 px-2">Index</th>
                          <th className="py-2 pl-2">État</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pages.map((p) => {
                          const b = healthBadge(p.health);
                          const ib = indexBadge(p.indexation_status);
                          return (
                            <tr key={p.id} className="border-b border-border/50">
                              <td className="py-2 pr-2 min-w-0">
                                <div className="text-text-primary truncate max-w-xs">{p.title || p.url}</div>
                                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-text-muted text-xs hover:text-accent truncate inline-flex items-center gap-1 max-w-xs">
                                  {p.url} <FiExternalLink size={10} />
                                </a>
                              </td>
                              <td className="py-2 px-2 text-right text-text-secondary">{p.internal_pagerank != null ? Number(p.internal_pagerank).toFixed(4) : '—'}</td>
                              <td className="py-2 px-2 text-right text-text-secondary">{p.inlinks_count ?? '—'}</td>
                              <td className="py-2 px-2 text-right text-text-secondary">{p.value_score ?? '—'}</td>
                              <td className="py-2 px-2 text-right text-text-secondary">{fmtNum(p.gsc_impressions)}</td>
                              <td className="py-2 px-2 text-right text-text-secondary">{fmtNum(p.gsc_clicks)}</td>
                              <td className="py-2 px-2 text-right text-text-secondary">{fmtPos(p.gsc_position)}</td>
                              <td className="py-2 px-2">{ib ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ib.cls}`}>{ib.label}</span> : <span className="text-text-muted text-xs">—</span>}</td>
                              <td className="py-2 pl-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.cls}`}>{b.label}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {pages.length === 0 && <p className="text-text-muted text-sm py-6 text-center">Aucune page (worker pas encore passé).</p>}
                  </div>
                </div>
              </>
            ) : tab === 'affamees' ? (
              /* Pages affamées */
              <div className="space-y-3">
                {affamees.length === 0 ? (
                  <div className="text-center py-10 bg-surface/30 rounded-xl border border-border">
                    <FiAlertTriangle className="w-10 h-10 mx-auto text-text-muted mb-3" />
                    <p className="text-text-muted text-sm">Aucune page affamée détectée.</p>
                  </div>
                ) : affamees.map((p) => (
                  <motion.div key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-surface border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-text-primary font-medium break-words">{p.title || p.url}</div>
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-text-muted text-xs hover:text-accent inline-flex items-center gap-1">{p.url} <FiExternalLink size={10} /></a>
                      </div>
                      <div className="flex gap-2 text-xs flex-shrink-0">
                        <span className="px-2 py-0.5 rounded-full bg-warning-bg text-warning-text">valeur {p.value_score ?? '—'}</span>
                        <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">jus {p.internal_pagerank != null ? Number(p.internal_pagerank).toFixed(4) : '—'}</span>
                      </div>
                    </div>
                    {p.suggestions && p.suggestions.length > 0 && (
                      <div className="mt-3 border-t border-border/60 pt-2">
                        <div className="text-xs text-text-muted mb-1 flex items-center gap-1"><FiLink size={12} /> Liens internes à ajouter (depuis ces pages) :</div>
                        <ul className="space-y-1">
                          {p.suggestions.map((s) => (
                            <li key={s.url} className="text-sm text-text-secondary flex items-center gap-1.5 flex-wrap">
                              <FiArrowRight size={12} className="text-accent flex-shrink-0" />
                              <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent truncate">{s.title || s.url}</a>
                              {s.reason && <span className="text-xs px-1.5 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{s.reason}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            ) : tab === 'orphelines' ? (
              /* Orphelines : aucun lien entrant -> priorité indexation (triées par valeur) */
              <div className="bg-surface border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
                  <FiAlertTriangle size={15} className="text-danger-text" /> Pages orphelines ({orphelines.length})
                </h3>
                <p className="text-text-muted text-xs mb-3">Aucun lien interne entrant — à relier en priorité (indexation &amp; jus).</p>
                {orphelines.length === 0 ? (
                  <p className="text-text-muted text-sm py-6 text-center">Aucune page orpheline.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-text-muted text-xs text-left border-b border-border">
                          <th className="py-2 pr-2">Page</th>
                          <th className="py-2 px-2">Catégorie</th>
                          <th className="py-2 px-2 text-right">Valeur</th>
                          <th className="py-2 px-2 text-right">Jus</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orphelines.map((p) => (
                          <tr key={p.id} className="border-b border-border/50">
                            <td className="py-2 pr-2 min-w-0">
                              <div className="text-text-primary truncate max-w-xs">{p.title || p.url}</div>
                              <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-text-muted text-xs hover:text-accent truncate inline-flex items-center gap-1 max-w-xs">
                                {p.url} <FiExternalLink size={10} />
                              </a>
                            </td>
                            <td className="py-2 px-2 text-text-secondary">{p.category || '—'}</td>
                            <td className="py-2 px-2 text-right text-text-secondary">{p.value_score ?? '—'}</td>
                            <td className="py-2 px-2 text-right text-text-secondary">{p.internal_pagerank != null ? Number(p.internal_pagerank).toFixed(4) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              /* Quasi-victoires : positions moyennes 11-20 (GSC) -> à pousser en priorité */
              <div className="bg-surface border border-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
                  <FiTarget size={15} className="text-info-text" /> Quasi-victoires ({quasiVictoires.length})
                </h3>
                <p className="text-text-muted text-xs mb-3">Pages en position moyenne 11–20 sur Google : un coup de pouce (liens internes, contenu) peut les faire passer en page 1.</p>
                {!gscConnected ? (
                  <p className="text-text-muted text-sm py-6 text-center">Connectez Search Console et lancez une synchro pour voir ces données.</p>
                ) : quasiVictoires.length === 0 ? (
                  <p className="text-text-muted text-sm py-6 text-center">Aucune quasi-victoire (aucune page en position 11–20).</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-text-muted text-xs text-left border-b border-border">
                          <th className="py-2 pr-2">Page</th>
                          <th className="py-2 px-2 text-right">Position</th>
                          <th className="py-2 px-2 text-right">Impr.</th>
                          <th className="py-2 px-2 text-right">Clics</th>
                          <th className="py-2 px-2 text-right">Valeur</th>
                          <th className="py-2 pl-2">État</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quasiVictoires.map((p) => {
                          const b = healthBadge(p.health);
                          return (
                            <tr key={p.id} className="border-b border-border/50">
                              <td className="py-2 pr-2 min-w-0">
                                <div className="text-text-primary truncate max-w-xs">{p.title || p.url}</div>
                                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-text-muted text-xs hover:text-accent truncate inline-flex items-center gap-1 max-w-xs">
                                  {p.url} <FiExternalLink size={10} />
                                </a>
                              </td>
                              <td className="py-2 px-2 text-right text-info-text font-medium">{fmtPos(p.gsc_position)}</td>
                              <td className="py-2 px-2 text-right text-text-secondary">{fmtNum(p.gsc_impressions)}</td>
                              <td className="py-2 px-2 text-right text-text-secondary">{fmtNum(p.gsc_clicks)}</td>
                              <td className="py-2 px-2 text-right text-text-secondary">{p.value_score ?? '—'}</td>
                              <td className="py-2 pl-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${b.cls}`}>{b.label}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Seo;
