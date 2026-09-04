// src/pages/Seo.jsx
//
// Module SEO (étape 1) : tableau de bord multi-site du "jus interne".
// Sélecteur de site, vue d'ensemble (santé), carte de flux (PageRank), liste des pages
// triées par jus, et section "pages affamées" avec liens internes suggérés.
// Données en LECTURE SEULE (worker Python seo_worker). Tokens de thème, react-icons, framer-motion.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiShare2, FiRefreshCw, FiTrendingUp, FiAlertTriangle, FiLink, FiArrowRight, FiExternalLink,
  FiPlay, FiLoader, FiCheckCircle, FiXCircle, FiClock, FiStopCircle, FiSlash, FiSearch, FiTarget,
  FiChevronDown, FiChevronRight, FiInfo, FiAlertOctagon, FiActivity, FiSettings
} from 'react-icons/fi';
import { seoAPI } from '../services/api';
import { useToast } from '../hooks/useToast';
import { decodeHtml } from '../utils/formatters';
import SeoGraph from '../components/seo/SeoGraph';
import PositionsTab from '../components/seo/PositionsTab';
import BacklinksTab from '../components/seo/BacklinksTab';
import IndexationTab from '../components/seo/IndexationTab';
import SpeedTab from '../components/seo/SpeedTab';
import TrafficTab from '../components/seo/TrafficTab';
import AuthorityTab from '../components/seo/AuthorityTab';
import SiteManager from '../components/seo/SiteManager';

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
// Style + icône par gravité d'audit (tokens sémantiques, aucune couleur en dur).
const SEVERITY_META = {
  critical: { cls: 'bg-danger-bg text-danger-text', Icon: FiAlertOctagon, label: 'Critique' },
  warning: { cls: 'bg-warning-bg text-warning-text', Icon: FiAlertTriangle, label: 'Avertissement' },
  notice: { cls: 'bg-neutral-bg text-neutral-text', Icon: FiInfo, label: 'Notice' }
};
// Couleur du score de santé : vert >=80, ambre >=50, rouge en dessous.
const scoreCls = (s) => (s >= 80 ? 'text-success-text' : s >= 50 ? 'text-warning-text' : 'text-danger-text');
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
  const [cannibalisation, setCannibalisation] = useState([]);
  const [ctrAnomalies, setCtrAnomalies] = useState([]);
  const [opportunites, setOpportunites] = useState([]);
  const [audit, setAudit] = useState(null);
  const [openCat, setOpenCat] = useState(null); // catégorie d'audit dépliée
  const [oppMinImpr, setOppMinImpr] = useState(20); // plancher d'impressions (28j) ajustable
  const [gscStatus, setGscStatus] = useState(null); // { connected, account_email, updated_at }
  const [tab, setTab] = useState('jus'); // 'jus' | 'affamees' | 'orphelines' | 'quasi'
  // Mode test GSC : inspecter UNE url (1 inspection, rien en base) avant une synchro complète.
  const [testUrl, setTestUrl] = useState('');
  const [testJob, setTestJob] = useState(null);
  const [testing, setTesting] = useState(false);
  const testPollRef = useRef(null);
  const [sort, setSort] = useState('pagerank');
  const [healthFilter, setHealthFilter] = useState('all'); // filtre liste des pages
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState(null);        // dernier job du site
  const [starting, setStarting] = useState(false);
  const [confirmJob, setConfirmJob] = useState(null); // type de job en attente de confirmation
  const [showSites, setShowSites] = useState(false);  // modale de gestion des sites
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [schedule, setSchedule] = useState(null);     // planification nocturne du worker
  const jobPollRef = useRef(null);

  useEffect(() => {
    seoAPI.getSites()
      .then((s) => { setSites(s || []); if (s && s.length) setSiteId(s[0].id); else setLoading(false); })
      .catch(() => { toast.error('Erreur chargement des sites SEO'); setLoading(false); });
    seoAPI.getGscStatus().then((g) => setGscStatus(g)).catch(() => {});
    // Retour du consentement Google (callback serveur -> /seo?google=success|error).
    const q = new URLSearchParams(window.location.search);
    if (q.get('google')) {
      if (q.get('google') === 'success') toast.success('Google connecté : Search Console et Analytics');
      else toast.error(`Connexion Google refusée${q.get('detail') ? ` : ${q.get('detail')}` : ''}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast]);

  // Connexion Google en un clic (comme Semrush) : le serveur fournit l'URL de consentement,
  // Google renvoie le jeton au serveur, qui redirige ici. Sert aussi a AJOUTER Analytics a
  // une connexion Search Console existante (nouveau consentement, meme table).
  const connectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      const r = await seoAPI.getGoogleAuthUrl();
      if (r && r.authUrl) window.location.href = r.authUrl;
      else throw new Error('URL de connexion indisponible');
    } catch (e) {
      toast.error(e.message || 'Connexion Google indisponible');
      setConnectingGoogle(false);
    }
  };

  // Après ajout / modification / suppression d'un site (modale) : recharge la liste et
  // garde le site courant s'il existe encore, sinon bascule sur le premier.
  const reloadSites = useCallback(async () => {
    try {
      const list = (await seoAPI.getSites()) || [];
      setSites(list);
      if (!list.some((x) => x.id === siteId)) {
        setSiteId(list.length ? list[0].id : null);
        if (!list.length) { setOverview(null); setLoading(false); }
      }
    } catch (e) { toast.error('Erreur chargement des sites SEO'); }
  }, [siteId, toast]);

  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const pagesParams = { sort, limit: 500 };
      if (healthFilter !== 'all') pagesParams.health = healthFilter;
      const [ov, gr, pg, af, orph, qv, cannib, ctr, au] = await Promise.all([
        seoAPI.getOverview(siteId),
        seoAPI.getGraph(siteId),
        seoAPI.getPages(siteId, pagesParams),
        seoAPI.getAffamees(siteId),
        seoAPI.getPages(siteId, { health: 'orpheline', sort: 'value', limit: 500 }),
        seoAPI.getQuasiVictoires(siteId),
        seoAPI.getCannibalisation(siteId),
        seoAPI.getCtrAnomalies(siteId),
        seoAPI.getAudit(siteId)
      ]);
      setOverview(ov); setGraph(gr || { nodes: [], edges: [] });
      setPages(pg || []); setAffamees(af || []); setOrphelines(orph || []); setQuasiVictoires(qv || []);
      setCannibalisation(cannib || []); setCtrAnomalies(ctr || []);
      setAudit(au || null);
    } catch (e) {
      toast.error('Erreur chargement SEO');
    } finally {
      setLoading(false);
    }
  }, [siteId, sort, healthFilter, toast]);

  useEffect(() => { load(); }, [load]);

  // Planification nocturne (réglages du worker + dernière chaîne) : rechargée avec le job.
  useEffect(() => {
    if (!siteId) return;
    seoAPI.getSchedule(siteId).then(setSchedule).catch(() => setSchedule(null));
  }, [siteId, job]);

  // Opportunités : chargées à part pour réagir au sélecteur "impressions min" sans tout recharger.
  useEffect(() => {
    if (!siteId) return;
    seoAPI.getOpportunites(siteId, oppMinImpr).then((d) => setOpportunites(d || [])).catch(() => {});
  }, [siteId, oppMinImpr]);

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
          const noun = j ? ({ gsc_sync: 'Synchro Search Console', pagespeed: 'Mesure de vitesse', ga_sync: 'Synchro Analytics', authority: 'Analyse d’autorité' }[j.job_type] || 'Crawl') : 'Crawl';
          if (j && j.status === 'done') { toast.success(`${noun} terminé${noun.endsWith('e') ? 'e' : ''}`); load(); }
          if (j && j.status === 'failed') toast.error(`${noun} en échec`);
          if (j && j.status === 'cancelled') { toast.info(`${noun} annulé${noun.endsWith('e') ? 'e' : ''}`); load(); }
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

  // Demande de lancement : garde anti-double côté UI puis ouvre la modale de confirmation.
  const requestLaunch = (jobType) => {
    if (!siteId) return;
    if (jobActive) {
      toast.info('Une tâche est déjà en cours, impossible d’en lancer une seconde.');
      return;
    }
    setConfirmJob(jobType);
  };

  const launchCrawl = async (jobType) => {
    if (!siteId) return;
    setStarting(true);
    try {
      const res = await seoAPI.createJob(siteId, jobType);
      setJob(res.job);
      const labels = { crawl_full: 'Crawl complet lancé', crawl_incremental: 'Crawl lancé', gsc_sync: 'Synchro Search Console lancée', pagespeed: 'Mesure de vitesse lancée', ga_sync: 'Synchro Analytics lancée', authority: 'Analyse d’autorité lancée' };
      // already_active : course (double-clic) refusée en base par l'index unique partiel.
      if (res.already_active) toast.info('Une synchronisation est déjà en cours, impossible d’en lancer une seconde.');
      else toast.success(labels[jobType] || 'Tâche lancée');
      pollJob(siteId);
    } catch (e) {
      toast.error(e.message || 'Impossible de lancer le crawl');
    } finally {
      setStarting(false);
    }
  };

  const confirmLaunch = async () => {
    const jobType = confirmJob;
    setConfirmJob(null);
    if (jobType) await launchCrawl(jobType);
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

  // ----- Mode test GSC (inspecte 1 URL via un job gsc_test, suivi par id) -----
  const stopTestPoll = () => { if (testPollRef.current) { clearInterval(testPollRef.current); testPollRef.current = null; } };
  useEffect(() => stopTestPoll, []);
  const runGscTest = async () => {
    const url = testUrl.trim();
    if (!siteId || !url) return;
    setTesting(true);
    setTestJob(null);
    try {
      const res = await seoAPI.createJob(siteId, 'gsc_test', url);
      const id = res.job && res.job.id;
      if (!id) { toast.error('Impossible de lancer le test'); setTesting(false); return; }
      setTestJob(res.job);
      stopTestPoll();
      testPollRef.current = setInterval(async () => {
        try {
          const j = await seoAPI.getJobById(id);
          setTestJob(j);
          if (!j || (j.status !== 'pending' && j.status !== 'running' && j.status !== 'cancel_requested')) {
            stopTestPoll();
            setTesting(false);
          }
        } catch (e) { stopTestPoll(); setTesting(false); }
      }, 3000);
    } catch (e) {
      toast.error(e.message || 'Erreur lors du test');
      setTesting(false);
    }
  };

  const jobActive = job && isActiveStatus(job.status);
  const jobCancellable = job && (job.status === 'pending' || job.status === 'running');
  const JOB_NOUNS = { gsc_sync: 'Synchro Search Console', pagespeed: 'Mesure de vitesse', ga_sync: 'Synchro Analytics', authority: 'Analyse d’autorité' };
  const jobNoun = ((job && JOB_NOUNS[job.job_type]) || 'Crawl') + (job && job.source === 'schedule' ? ' (automatique)' : '');
  const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const JOB_SHORT = { crawl_incremental: 'crawl', crawl_full: 'crawl complet', gsc_sync: 'Search Console', pagespeed: 'vitesse' };
  const gscConnected = gscStatus && gscStatus.connected;

  // Contenu d'un bouton de lancement : si CE type de job tourne, on l'indique explicitement
  // (spinner + progression X/Y) ; sinon libellé normal. Le polling rafraîchit `job` -> le
  // bouton se grise/anime tout seul sans recharger la page.
  const isThisJobRunning = (jobType) => jobActive && job.job_type === jobType;
  const spinner = <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} className="inline-flex"><FiLoader size={15} /></motion.span>;
  const runningLabel = (jobType) => {
    const noun = jobType === 'gsc_sync' || jobType === 'ga_sync' ? 'Synchro' : jobType === 'pagespeed' ? 'Mesure' : jobType === 'authority' ? 'Analyse' : 'Crawl';
    const prog = job && job.progress_total ? ` ${job.progress_current}/${job.progress_total}` : '';
    return `${noun} en cours…${prog}`;
  };

  // Texte de la modale de confirmation selon le type de job.
  const hoursSinceGscSync = overview && overview.gsc_synced_at
    ? (Date.now() - new Date(overview.gsc_synced_at).getTime()) / 3600000 : null;
  const gscRanRecently = confirmJob === 'gsc_sync' && hoursSinceGscSync != null && hoursSinceGscSync < 24;
  const confirmMeta = {
    crawl_incremental: { title: 'Lancer le crawl ?', body: 'Un crawl incrémental recrawle uniquement les pages modifiées depuis le dernier passage.' },
    crawl_full: { title: 'Reconstruction complète ?', body: 'Le site entier sera recrawlé et le graphe de liens reconstruit. C’est plus long qu’un crawl incrémental.' },
    gsc_sync: { title: 'Lancer la synchronisation Search Console ?', body: 'Cela inspecte toutes les pages et consomme du quota Google. Une seule par jour suffit.' },
    ga_sync: { title: 'Synchroniser Google Analytics ?', body: 'Récupère les sessions, utilisateurs et engagement de la propriété GA4 du site (90 jours la première fois, puis la veille). Rapide et sans quota sensible.' },
    authority: { title: 'Analyser l’autorité et les liens entrants ?', body: 'Interroge Open PageRank (score d’autorité du domaine) et Bing Webmaster Tools (liens entrants connus de Bing, page par page). Une à deux minutes. Une analyse par jour suffit, la planification nocturne s’en charge.' },
    pagespeed: { title: 'Mesurer la vitesse ?', body: 'Interroge PageSpeed Insights pour l’accueil et les pages les plus vues (mobile et desktop), plus un lot de pages en rotation (mobile) : 15 à 30 min, le site entier est couvert en quelques semaines. Une mesure par jour suffit.' }
  }[confirmJob] || {};

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
            <button onClick={() => setShowSites(true)} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Gérer les sites suivis (ajouter, modifier, supprimer)">
              <FiSettings size={16} />
            </button>
            <button
              onClick={() => requestLaunch('crawl_incremental')}
              disabled={starting || jobActive}
              className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Lancer un crawl incrémental"
            >
              {isThisJobRunning('crawl_incremental') ? <>{spinner} {runningLabel('crawl_incremental')}</> : <><FiPlay size={15} /> Lancer le crawl</>}
            </button>
            <button
              onClick={() => requestLaunch('crawl_full')}
              disabled={starting || jobActive}
              className="px-3 py-2 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Reconstruction complète du graphe"
            >
              {isThisJobRunning('crawl_full') ? <>{spinner} {runningLabel('crawl_full')}</> : 'Complet'}
            </button>
            <button
              onClick={() => requestLaunch('gsc_sync')}
              disabled={starting || jobActive || !gscConnected}
              className="px-3 py-2 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={gscConnected ? 'Synchroniser Google Search Console' : 'Search Console non connecté (bouton « Connecter Google » ci-dessous)'}
            >
              {isThisJobRunning('gsc_sync') ? <>{spinner} {runningLabel('gsc_sync')}</> : <><FiSearch size={15} /> Search Console</>}
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
              <div className="flex flex-col gap-1.5">
                <div className="inline-flex items-center gap-2 text-sm bg-success-bg text-success-text border border-success-text/30 rounded-lg px-3 py-2 self-start">
                  <FiCheckCircle size={15} /> {jobNoun} terminé{job.finished_at ? ` · ${fmtDate(job.finished_at)}` : ''}
                </div>
                {job.error && (
                  <div className="inline-flex items-center gap-2 text-sm bg-warning-bg text-warning-text border border-warning-text/30 rounded-lg px-3 py-2 self-start">
                    <FiClock size={15} /> {job.error}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Planification nocturne : ce que le worker fera seul, et ce qu'il a fait la dernière fois */}
        {schedule && (
          <div className="mb-4 text-xs text-text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
            <FiClock size={13} className="flex-shrink-0" />
            {schedule.enabled ? (
              <>
                <span>
                  Automatique chaque nuit à {String(schedule.hour).padStart(2, '0')}h ({schedule.tz}) : crawl
                  {schedule.full_weekday >= 0 ? ` (complet le ${WEEKDAYS[schedule.full_weekday]})` : ''}
                  {gscConnected ? ', Search Console' : ''}{schedule.pagespeed ? ', vitesse' : ''}.
                </span>
                {schedule.last_day && (
                  <span>
                    Dernier passage {fmtDate(schedule.last_day)} :{' '}
                    {schedule.last_jobs.map((j) => (
                      <span key={j.job_type} className={`inline-flex items-center gap-1 mr-1.5 ${j.status === 'done' ? 'text-success-text' : j.status === 'failed' ? 'text-danger-text' : ''}`} title={j.error || j.status}>
                        {j.status === 'done' ? <FiCheckCircle size={11} /> : j.status === 'failed' ? <FiXCircle size={11} /> : <FiClock size={11} />} {JOB_SHORT[j.job_type] || j.job_type}
                      </span>
                    ))}
                  </span>
                )}
              </>
            ) : (
              <span>Planification nocturne désactivée (SEO_SCHEDULE=0) : crawls, synchros et mesures sont manuels.</span>
            )}
          </div>
        )}

        {/* État de connexion Google Search Console */}
        {gscStatus && (
          <div className="mb-4">
            {gscConnected && gscStatus.analytics ? (
              <div className="inline-flex items-center gap-2 text-sm bg-success-bg text-success-text border border-success-text/30 rounded-lg px-3 py-2">
                <FiSearch size={14} /> Google connecté : Search Console et Analytics{gscStatus.account_email ? ` · ${gscStatus.account_email}` : ''}
              </div>
            ) : gscConnected ? (
              <div className="inline-flex flex-wrap items-center gap-3 text-sm bg-warning-bg text-warning-text border border-warning-text/30 rounded-lg px-3 py-2">
                <span className="inline-flex items-center gap-2"><FiSearch size={14} /> Search Console connecté{gscStatus.account_email ? ` · ${gscStatus.account_email}` : ''}, Analytics pas encore autorisé.</span>
                <button onClick={connectGoogle} disabled={connectingGoogle} className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                  {connectingGoogle ? <FiLoader size={13} /> : <FiPlay size={13} />} Ajouter Analytics à la connexion
                </button>
              </div>
            ) : (
              <div className="inline-flex flex-wrap items-center gap-3 text-sm bg-warning-bg text-warning-text border border-warning-text/30 rounded-lg px-3 py-2">
                <span className="inline-flex items-center gap-2"><FiSearch size={14} /> Google non connecté (Search Console et Analytics).</span>
                <button onClick={connectGoogle} disabled={connectingGoogle} className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                  {connectingGoogle ? <FiLoader size={13} /> : <FiPlay size={13} />} Connecter Google
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mode test GSC : inspecter UNE URL (1 inspection, rien en base) avant une synchro complète */}
        {gscConnected && (
          <div className="mb-5 bg-surface border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <FiTarget size={14} className="text-text-muted" />
              <span className="text-sm font-medium text-text-primary">Tester l'indexation d'une page</span>
              <span className="text-xs text-text-muted">(1 inspection, sans lancer la synchro complète)</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runGscTest(); }}
                placeholder="https://jurojin.net/ma-page/"
                className="flex-1 min-w-0 px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent"
              />
              <button
                onClick={runGscTest}
                disabled={testing || !testUrl.trim()}
                className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testing ? (
                  <><motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} className="inline-flex"><FiLoader size={14} /></motion.span> Test…</>
                ) : (<><FiSearch size={14} /> Tester</>)}
              </button>
            </div>

            {/* Résultat du test */}
            {testJob && (testJob.status === 'pending' || testJob.status === 'running') && (
              <p className="text-xs text-text-muted mt-2">Inspection en cours… (le worker traite la demande)</p>
            )}
            {testJob && testJob.status === 'done' && testJob.result && (
              <div className="mt-3 text-sm">
                {testJob.result.ok ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-success-bg text-success-text">OK</span>
                      <span className="text-text-secondary break-all">{testJob.result.url_sent}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-text-secondary mt-1">
                      <div><span className="text-text-muted">coverageState :</span> {testJob.result.coverageState ?? '—'}</div>
                      <div><span className="text-text-muted">verdict :</span> {testJob.result.verdict ?? '—'}</div>
                      <div><span className="text-text-muted">indexingState :</span> {testJob.result.indexingState ?? '—'}</div>
                      <div><span className="text-text-muted">pageFetchState :</span> {testJob.result.pageFetchState ?? '—'}</div>
                      <div className="sm:col-span-2 break-all"><span className="text-text-muted">googleCanonical :</span> {testJob.result.googleCanonical ?? '—'}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-warning-text">
                    <FiAlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    <span className="break-all">{testJob.result.error || 'Inspection en échec'}</span>
                  </div>
                )}
              </div>
            )}
            {testJob && (testJob.status === 'failed' || testJob.status === 'cancelled') && (
              <p className="text-xs text-danger-text mt-2">Test interrompu ({testJob.status}).</p>
            )}
          </div>
        )}

        {sites.length === 0 && !loading ? (
          <div className="text-center py-16 bg-surface/30 rounded-xl border border-border">
            <FiShare2 className="w-10 h-10 mx-auto text-text-muted mb-3" />
            <p className="text-text-muted text-sm mb-3">Aucun site SEO suivi.</p>
            <button onClick={() => setShowSites(true)} className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm inline-flex items-center gap-2"><FiSettings size={15} /> Ajouter un site</button>
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
                { k: 'quasi', l: `Quasi-victoires${quasiVictoires.length ? ` (${quasiVictoires.length})` : ''}` },
                { k: 'cannibalisation', l: `Cannibalisation${cannibalisation.length ? ` (${cannibalisation.length})` : ''}` },
                { k: 'ctr', l: `CTR à optimiser${ctrAnomalies.length ? ` (${ctrAnomalies.length})` : ''}` },
                { k: 'opportunites', l: `Opportunités${opportunites.length ? ` (${opportunites.length})` : ''}` },
                { k: 'audit', l: `Audit technique${audit && audit.score != null ? ` (${audit.score}/100)` : ''}` },
                { k: 'indexation', l: 'Indexation' },
                { k: 'vitesse', l: 'Vitesse' },
                { k: 'trafic', l: 'Trafic' },
                { k: 'autorite', l: 'Autorité & liens' },
                { k: 'positions', l: 'Suivi de positions' },
                { k: 'backlinks', l: '🔗 Backlinks' }
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
                                <div className="text-text-primary truncate max-w-xs">{decodeHtml(p.title) || p.url}</div>
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
                        <div className="text-text-primary font-medium break-words">{decodeHtml(p.title) || p.url}</div>
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
                              {s.anchors && s.anchors.length > 0 && <span className="text-xs text-text-muted">ancre : « {s.anchors[0]} »</span>}
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
                              <div className="text-text-primary truncate max-w-xs">{decodeHtml(p.title) || p.url}</div>
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
            ) : tab === 'quasi' ? (
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
                                <div className="text-text-primary truncate max-w-xs">{decodeHtml(p.title) || p.url}</div>
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
            ) : tab === 'cannibalisation' ? (
              /* Cannibalisation : requêtes où plusieurs pages du site se concurrencent (GSC) */
              <div className="space-y-3">
                <div className="bg-surface border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
                    <FiAlertTriangle size={15} className="text-warning-text" /> Cannibalisation ({cannibalisation.length})
                  </h3>
                  <p className="text-text-muted text-xs">Requêtes où plusieurs de tes pages se disputent la même intention : Google hésite, tes positions et ton CTR se diluent. Choisis UNE page cible par requête (renforce-la, et désoptimise ou redirige les autres).</p>
                </div>
                {!gscConnected ? (
                  <div className="text-center py-10 bg-surface/30 rounded-xl border border-border">
                    <FiAlertTriangle className="w-10 h-10 mx-auto text-text-muted mb-3" />
                    <p className="text-text-muted text-sm">Connectez Search Console et lancez une synchro pour détecter la cannibalisation.</p>
                  </div>
                ) : cannibalisation.length === 0 ? (
                  <div className="text-center py-10 bg-surface/30 rounded-xl border border-border">
                    <p className="text-text-muted text-sm">Aucune cannibalisation détectée (aucune requête avec ≥ 2 pages concurrentes).</p>
                  </div>
                ) : cannibalisation.map((c) => (
                  <motion.div key={c.query} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-surface border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <span className="text-text-primary font-medium break-words">« {c.query} »</span>
                      <div className="flex flex-wrap gap-1.5 text-xs flex-shrink-0">
                        <span className="px-2 py-0.5 rounded-full bg-warning-bg text-warning-text font-medium">{c.pages_count} pages</span>
                        <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{fmtNum(c.total_impressions)} impr.</span>
                        <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{fmtNum(c.total_clicks)} clics</span>
                      </div>
                    </div>
                    <ul className="mt-2 border-t border-border/60 pt-2 space-y-1">
                      {c.pages.map((pg, i) => (
                        <li key={pg.url} className="text-sm text-text-secondary flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${i === 0 ? 'bg-accent/15 text-accent' : 'bg-neutral-bg text-neutral-text'}`}>{i === 0 ? 'principale' : `#${i + 1}`}</span>
                          <a href={pg.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent truncate">{decodeHtml(pg.title) || pg.url}</a>
                          <span className="text-xs text-text-muted flex-shrink-0">{fmtNum(pg.impressions)} impr · {fmtNum(pg.clicks)} clics · pos {fmtPos(pg.position)}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                ))}
              </div>
            ) : tab === 'ctr' ? (
              /* CTR à optimiser : bien positionné mais peu cliqué -> title/meta à réécrire */
              <div className="space-y-3">
                <div className="bg-surface border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
                    <FiTarget size={15} className="text-accent" /> CTR à optimiser ({ctrAnomalies.length})
                  </h3>
                  <p className="text-text-muted text-xs">Pages bien positionnées mais peu cliquées (CTR très en dessous de la moyenne pour leur position). Réécris le <b>title</b> et la <b>meta description</b> pour récupérer des clics. Triées par clics potentiels récupérables.</p>
                </div>
                {!gscConnected ? (
                  <div className="text-center py-10 bg-surface/30 rounded-xl border border-border">
                    <FiTarget className="w-10 h-10 mx-auto text-text-muted mb-3" />
                    <p className="text-text-muted text-sm">Connectez Search Console et lancez une synchro pour révéler les pages au CTR faible.</p>
                  </div>
                ) : ctrAnomalies.length === 0 ? (
                  <div className="text-center py-10 bg-surface/30 rounded-xl border border-border">
                    <p className="text-text-muted text-sm">Aucune anomalie de CTR notable. Tes titres/metas tiennent la route 👍</p>
                  </div>
                ) : ctrAnomalies.map((r) => (
                  <motion.div key={`${r.query}-${r.url}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-surface border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <span className="text-text-primary font-medium break-words">« {r.query} »</span>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-text-muted text-xs hover:text-accent inline-flex items-center gap-1 break-all mt-0.5">{decodeHtml(r.title) || r.url} <FiExternalLink size={10} /></a>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-xs flex-shrink-0">
                        <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium">+{fmtNum(r.missed_clicks)} clics potentiels</span>
                        <span className="px-2 py-0.5 rounded-full bg-info-bg text-info-text">pos. {fmtPos(r.position)}</span>
                        <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{fmtNum(r.impressions)} impr.</span>
                        <span className="px-2 py-0.5 rounded-full bg-warning-bg text-warning-text">CTR {(r.ctr * 100).toFixed(1)}% / attendu ~{(r.expected_ctr * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    {(() => {
                      const tips = [];
                      if (r.desc_present === false) tips.push('Pas de meta description');
                      else if (r.desc_len != null && r.desc_len < 70) tips.push(`Meta description courte (${r.desc_len} car.)`);
                      else if (r.desc_len != null && r.desc_len > 160) tips.push(`Meta description longue (${r.desc_len} car.)`);
                      if (r.title_len != null && r.title_len > 60) tips.push(`Title long (${r.title_len} car.)`);
                      return tips.length ? (
                        <p className="text-xs text-text-muted mt-2 flex items-center gap-1"><FiInfo size={11} /> {tips.join(' · ')}</p>
                      ) : null;
                    })()}
                  </motion.div>
                ))}
              </div>
            ) : tab === 'opportunites' ? (
              /* Opportunités : potentiel gâché = demande Google × marge × déficit de maillage */
              <div className="space-y-3">
                <div className="bg-surface border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
                        <FiTrendingUp size={15} className="text-accent" /> Potentiel gâché ({opportunites.length})
                      </h3>
                      <p className="text-text-muted text-xs">Pages qui intéressent Google (impressions) mais étranglées par le maillage : triées par score d'opportunité.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-muted text-xs">Impressions min</span>
                      <select
                        value={oppMinImpr}
                        onChange={(e) => setOppMinImpr(parseInt(e.target.value, 10))}
                        className="px-2 py-1 bg-surface-muted border border-border rounded-lg text-text-primary text-xs focus:outline-none focus:border-accent"
                      >
                        {[10, 20, 50, 100].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {!gscConnected ? (
                  <div className="text-center py-10 bg-surface/30 rounded-xl border border-border">
                    <FiTrendingUp className="w-10 h-10 mx-auto text-text-muted mb-3" />
                    <p className="text-text-muted text-sm">Connectez Search Console et lancez une synchro pour révéler les opportunités.</p>
                  </div>
                ) : opportunites.length === 0 ? (
                  <div className="text-center py-10 bg-surface/30 rounded-xl border border-border">
                    <p className="text-text-muted text-sm">Aucune opportunité au-dessus de {oppMinImpr} impressions/28j. Baissez le seuil pour élargir.</p>
                  </div>
                ) : opportunites.map((p) => (
                  <motion.div key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-surface border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-accent/15 text-accent">Score {p.score}</span>
                          <span className="text-text-primary font-medium break-words">{decodeHtml(p.title) || p.url}</span>
                        </div>
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-text-muted text-xs hover:text-accent inline-flex items-center gap-1 break-all mt-0.5">{p.url} <FiExternalLink size={10} /></a>
                        {p.reason && <p className="text-text-muted text-xs mt-1">{p.reason}</p>}
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-xs flex-shrink-0">
                        <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{fmtNum(p.gsc_impressions)} impr.</span>
                        <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{fmtNum(p.gsc_clicks)} clics</span>
                        <span className="px-2 py-0.5 rounded-full bg-info-bg text-info-text">pos. {fmtPos(p.gsc_position)}</span>
                        <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">jus {p.internal_pagerank != null ? Number(p.internal_pagerank).toFixed(4) : '—'}</span>
                        <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{p.inlinks_count ?? '—'} entrants</span>
                      </div>
                    </div>
                    {p.suggestions && p.suggestions.length > 0 && (
                      <div className="mt-3 border-t border-border/60 pt-2">
                        <div className="text-xs text-text-muted mb-1 flex items-center gap-1"><FiLink size={12} /> Liens internes à ajouter (depuis ces pages) :</div>
                        <ul className="space-y-1">
                          {p.suggestions.map((s) => (
                            <li key={s.url} className="text-sm text-text-secondary flex items-center gap-1.5 flex-wrap">
                              <FiArrowRight size={12} className="text-accent flex-shrink-0" />
                              <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent truncate">{decodeHtml(s.title) || s.url}</a>
                              {s.reason && <span className="text-xs px-1.5 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{s.reason}</span>}
                              {s.anchors && s.anchors.length > 0 && <span className="text-xs text-text-muted">ancre : « {s.anchors[0]} »</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            ) : tab === 'audit' ? (
              /* Audit technique : vue d'ensemble de TOUS les problèmes du site, par gravité */
              <div className="space-y-4">
                {!audit ? (
                  <div className="text-center py-10 bg-surface/30 rounded-xl border border-border">
                    <FiActivity className="w-10 h-10 mx-auto text-text-muted mb-3" />
                    <p className="text-text-muted text-sm">Aucun audit pour l'instant. Lancez un crawl : le worker extrait l'audit du HTML déjà récupéré.</p>
                  </div>
                ) : (
                  <>
                    {/* Score de santé + sitemap */}
                    <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`text-4xl font-bold ${scoreCls(audit.score)}`}>{audit.score}<span className="text-text-muted text-lg font-normal">/100</span></div>
                        <div>
                          <div className="text-sm font-semibold text-text-primary flex items-center gap-2"><FiActivity size={15} /> Santé technique</div>
                          <div className="text-text-muted text-xs">{audit.total_pages} pages auditées</div>
                        </div>
                      </div>
                      <div className="text-xs text-text-muted">
                        Sitemap : {audit.sitemap && audit.sitemap.fetched
                          ? <>trouvé ({fmtNum(audit.sitemap.count)} URLs{audit.sitemap.orphans_404 ? `, ${audit.sitemap.orphans_404} en 404` : ''})</>
                          : 'non trouvé'}
                      </div>
                    </div>

                    {audit.categories.length === 0 ? (
                      <div className="text-center py-10 bg-surface/30 rounded-xl border border-border">
                        <FiCheckCircle className="w-10 h-10 mx-auto text-success-text mb-3" />
                        <p className="text-text-muted text-sm">Aucun problème technique détecté.</p>
                      </div>
                    ) : audit.categories.map((c) => {
                      const meta = SEVERITY_META[c.severity] || SEVERITY_META.notice;
                      const Icon = meta.Icon;
                      const open = openCat === c.key;
                      return (
                        <div key={c.key} className="bg-surface border border-border rounded-xl overflow-hidden">
                          <button
                            onClick={() => setOpenCat(open ? null : c.key)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-strong/40 transition-colors text-left"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${meta.cls}`}><Icon size={12} /> {meta.label}</span>
                              <span className="text-text-primary text-sm font-medium truncate">{c.label}</span>
                            </span>
                            <span className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-text-primary font-bold text-sm">{c.count}</span>
                              {open ? <FiChevronDown size={16} className="text-text-muted" /> : <FiChevronRight size={16} className="text-text-muted" />}
                            </span>
                          </button>
                          {open && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-t border-border">
                              <ul className="divide-y divide-border/50 max-h-96 overflow-y-auto">
                                {c.pages.map((pg, i) => (
                                  <li key={`${c.key}-${i}`} className="px-4 py-2 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      {pg.title && <div className="text-text-primary text-sm truncate max-w-md">{decodeHtml(pg.title)}</div>}
                                      <a href={pg.url} target="_blank" rel="noopener noreferrer" className="text-text-muted text-xs hover:text-accent inline-flex items-center gap-1 break-all">{pg.url} <FiExternalLink size={10} /></a>
                                    </div>
                                    {pg.detail && <span className="text-xs text-text-secondary flex-shrink-0">{pg.detail}</span>}
                                  </li>
                                ))}
                                {c.count > c.pages.length && (
                                  <li className="px-4 py-2 text-xs text-text-muted">… et {c.count - c.pages.length} autres</li>
                                )}
                              </ul>
                            </motion.div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            ) : tab === 'indexation' ? (
              /* Indexation Google, sitemap, redirections, focus keywords — actionnable (liens d'édition WP) */
              <IndexationTab siteId={siteId} gscConnected={gscConnected} />
            ) : tab === 'vitesse' ? (
              /* Core Web Vitals / PageSpeed (job 'pagespeed' du worker) */
              <SpeedTab siteId={siteId} onLaunch={requestLaunch} job={job} jobActive={!!jobActive} />
            ) : tab === 'trafic' ? (
              /* Google Analytics 4 (job 'ga_sync', propriété GA4 par site) */
              <TrafficTab siteId={siteId} gscStatus={gscStatus} onLaunch={requestLaunch} job={job} jobActive={!!jobActive} onOpenSites={() => setShowSites(true)} onConnectGoogle={connectGoogle} />
            ) : tab === 'autorite' ? (
              /* Autorité du domaine (Open PageRank) + liens entrants (Bing WMT), job 'authority' */
              <AuthorityTab siteId={siteId} onLaunch={requestLaunch} job={job} jobActive={!!jobActive} />
            ) : tab === 'backlinks' ? (
              /* Campagnes backlinks (niches, découverte, scoring, outreach Gmail) */
              <BacklinksTab />
            ) : (
              /* Suivi de positions (rank tracker) — composant dédié */
              <PositionsTab siteId={siteId} gscConnected={gscConnected} />
            )}
          </>
        )}
      </div>

      {/* Gestion des sites suivis (source unique : seo_sites, lue par le worker) */}
      <AnimatePresence>
        {showSites && <SiteManager sites={sites} onClose={() => setShowSites(false)} onChange={reloadSites} />}
      </AnimatePresence>

      {/* Modale de confirmation avant lancement (évite les lancements accidentels / quota) */}
      <AnimatePresence>
        {confirmJob && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-overlay/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setConfirmJob(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 16 }}
              className="bg-surface-muted border border-border rounded-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
                  {confirmJob === 'gsc_sync' ? <FiSearch size={18} /> : confirmJob === 'pagespeed' ? <FiActivity size={18} /> : <FiPlay size={18} />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text-primary">{confirmMeta.title}</h3>
                  <p className="text-text-secondary text-sm mt-1">{confirmMeta.body}</p>
                </div>
              </div>

              {gscRanRecently && (
                <div className="flex items-start gap-2 text-sm bg-warning-bg text-warning-text border border-warning-text/30 rounded-lg p-3 mb-3">
                  <FiAlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                  <span>
                    Une synchro a déjà tourné il y a {Math.max(1, Math.round(hoursSinceGscSync))} h. Le quota Google est
                    limité (~2000/jour) — relancer maintenant pourrait l’épuiser. Continuer ?
                  </span>
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setConfirmJob(null)}
                  className="flex-1 px-4 py-2.5 border border-border text-text-primary hover:bg-surface-strong rounded-lg font-medium transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmLaunch}
                  disabled={starting}
                  className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  <FiPlay size={15} /> Lancer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Seo;
