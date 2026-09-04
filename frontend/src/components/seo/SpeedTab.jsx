// src/components/seo/SpeedTab.jsx
//
// Onglet « Vitesse » : Core Web Vitals / PageSpeed des pages du site (accueil + pages les
// plus vues), mesurés par le worker (job 'pagespeed', API PageSpeed Insights, gratuite).
// Deux lectures côte à côte, volontairement :
//   - TERRAIN (CrUX) : utilisateurs réels, p75 sur 28 j. C'est ce que Google utilise pour
//     classer. Absent sur les pages à faible trafic.
//   - LABO (Lighthouse) : score 0..100 reproductible, disponible pour toute page, avec les
//     opportunités d'optimisation. Sert à diagnostiquer et à vérifier une correction le jour même.
// Charte : tokens de thème, react-icons, framer-motion, aucune couleur en dur.
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FiZap, FiSmartphone, FiMonitor, FiExternalLink, FiEdit3, FiChevronDown, FiChevronRight,
  FiTrendingUp, FiTrendingDown, FiMinus, FiInfo, FiLoader, FiRefreshCw
} from 'react-icons/fi';
import { seoAPI } from '../../services/api';
import { decodeHtml } from '../../utils/formatters';

const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};
const shortUrl = (u) => { try { const x = new URL(u); return x.pathname || '/'; } catch { return u; } };
const ms = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);

// Score Lighthouse : vert >= 90, ambre >= 50, rouge en dessous (échelle officielle).
const scoreCls = (s) => (s == null ? 'text-text-muted' : s >= 90 ? 'text-success-text' : s >= 50 ? 'text-warning-text' : 'text-danger-text');
const scoreBg = (s) => (s == null ? 'bg-neutral-bg text-neutral-text' : s >= 90 ? 'bg-success-bg text-success-text' : s >= 50 ? 'bg-warning-bg text-warning-text' : 'bg-danger-bg text-danger-text');
// Note terrain : good / needs / poor (seuils CWV officiels, calculés côté serveur).
const rateCls = (r) => (r === 'good' ? 'text-success-text' : r === 'needs' ? 'text-warning-text' : r === 'poor' ? 'text-danger-text' : 'text-text-muted');
const CATEGORY = { FAST: { cls: 'bg-success-bg text-success-text', label: 'Bon' }, AVERAGE: { cls: 'bg-warning-bg text-warning-text', label: 'À améliorer' }, SLOW: { cls: 'bg-danger-bg text-danger-text', label: 'Mauvais' } };

const Delta = ({ value }) => {
  if (value == null) return null;
  if (value === 0) return <span className="text-text-muted inline-flex items-center gap-0.5 text-xs"><FiMinus size={10} /></span>;
  return value > 0
    ? <span className="text-success-text inline-flex items-center gap-0.5 text-xs"><FiTrendingUp size={10} /> +{value}</span>
    : <span className="text-danger-text inline-flex items-center gap-0.5 text-xs"><FiTrendingDown size={10} /> {value}</span>;
};

const Score = ({ m }) => {
  if (!m) return <span className="text-text-muted text-xs">—</span>;
  if (m.error && m.perf_score == null) return <span className="text-danger-text text-xs" title={m.error}>erreur</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold ${scoreBg(m.perf_score)}`}>{m.perf_score ?? '—'}</span>
      <Delta value={m.delta} />
    </span>
  );
};

const SpeedTab = ({ siteId, onLaunch, job, jobActive }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState('mobile');
  const [openUrl, setOpenUrl] = useState(null);

  const load = useCallback(() => {
    if (!siteId) return;
    setLoading(true);
    seoAPI.getPagespeed(siteId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [siteId]);
  useEffect(() => { load(); }, [load]);
  // Le job vient de se terminer -> recharge (le parent rafraîchit `job` par polling).
  const jobStatus = job && job.job_type === 'pagespeed' ? job.status : null;
  useEffect(() => { if (jobStatus === 'done') load(); }, [jobStatus, load]);

  const running = jobActive && job && job.job_type === 'pagespeed';
  const s = (data && data.summary) || {};
  const pages = (data && data.pages) || [];
  const origin = s.origin_category ? CATEGORY[s.origin_category] : null;

  const cards = [
    { label: 'Accueil mobile', value: s.home_mobile, cls: scoreCls(s.home_mobile), suffix: '/100' },
    { label: 'Accueil desktop', value: s.home_desktop, cls: scoreCls(s.home_desktop), suffix: '/100' },
    { label: 'Moyenne mobile', value: s.moyenne_mobile, cls: scoreCls(s.moyenne_mobile), suffix: '/100' },
    { label: 'CWV terrain « bon »', value: s.cwv_evaluees ? `${s.cwv_bon}/${s.cwv_evaluees}` : '—', hint: 'pages avec assez de trafic réel' },
    { label: 'Site (CrUX)', value: origin ? origin.label : '—', cls: origin ? origin.cls.split(' ')[1] : '' },
    { label: 'Dernière mesure', value: fmtDate(s.derniere_mesure) }
  ];

  const launchBtn = (
    <button onClick={() => onLaunch('pagespeed')} disabled={jobActive}
      className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Mesurer l'accueil et les pages les plus vues, en mobile et desktop">
      {running
        ? <><motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} className="inline-flex"><FiLoader size={15} /></motion.span> Mesure en cours{job.progress_total ? ` ${job.progress_current}/${job.progress_total}` : '…'}</>
        : <><FiZap size={15} /> Mesurer la vitesse</>}
    </button>
  );

  if (loading && !data) return <p className="text-text-muted text-sm py-10 text-center">Chargement…</p>;

  if (!pages.length) {
    return (
      <div className="text-center py-12 bg-surface/30 rounded-xl border border-border space-y-3">
        <FiZap className="w-10 h-10 mx-auto text-text-muted" />
        <p className="text-text-muted text-sm max-w-lg mx-auto">
          Aucune mesure pour ce site. La mesure interroge l'API PageSpeed Insights de Google pour l'accueil et les pages les plus vues (mobile et desktop) ; comptez 15 à 40 s par page.
        </p>
        {data && !data.api_key_configured && (
          <p className="text-xs text-warning-text max-w-lg mx-auto inline-flex items-start gap-1"><FiInfo size={13} className="mt-0.5 flex-shrink-0" /> Aucune clé PAGESPEED_API_KEY dans backend/.env : quota anonyme, la mesure peut s'interrompre. Une clé Google Cloud gratuite lève la limite.</p>
        )}
        <div>{launchBtn}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="bg-surface border border-border rounded-xl p-3">
            <div className="text-text-muted text-xs mb-1">{c.label}</div>
            <div className={`text-xl font-bold ${c.cls || 'text-text-primary'}`}>{c.value ?? '—'}{c.value != null && c.suffix && <span className="text-text-muted text-xs font-normal">{c.suffix}</span>}</div>
            {c.hint && <div className="text-text-muted text-[10px]">{c.hint}</div>}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted">Détail :</span>
          {[{ k: 'mobile', l: 'Mobile', I: FiSmartphone }, { k: 'desktop', l: 'Desktop', I: FiMonitor }].map(({ k, l, I }) => (
            <button key={k} onClick={() => setStrategy(k)}
              className={`px-2.5 py-1 rounded-lg inline-flex items-center gap-1 ${strategy === k ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}><I size={12} /> {l}</button>
          ))}
          {data && !data.api_key_configured && <span className="text-warning-text inline-flex items-center gap-1 ml-2"><FiInfo size={12} /> sans clé API (quota anonyme)</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Rafraîchir"><FiRefreshCw size={15} /></button>
          {launchBtn}
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-muted border-b border-border">
                <th className="text-left px-4 py-2 font-medium">Page</th>
                <th className="text-center px-2 py-2 font-medium" title="Score performance Lighthouse (labo)"><span className="inline-flex items-center gap-1"><FiSmartphone size={12} /> Mobile</span></th>
                <th className="text-center px-2 py-2 font-medium" title="Score performance Lighthouse (labo)"><span className="inline-flex items-center gap-1"><FiMonitor size={12} /> Desktop</span></th>
                <th className="text-center px-2 py-2 font-medium" title="Utilisateurs réels (CrUX, p75, 28 j) — ce que Google utilise">Terrain {strategy}</th>
                <th className="text-right px-2 py-2 font-medium" title="Largest Contentful Paint">LCP</th>
                <th className="text-right px-2 py-2 font-medium" title="Interaction to Next Paint (terrain uniquement)">INP</th>
                <th className="text-right px-2 py-2 font-medium" title="Cumulative Layout Shift">CLS</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {pages.map((p) => {
                const m = p[strategy];
                const f = m && m.field;
                const open = openUrl === p.url;
                const opps = (m && m.opportunities) || [];
                return (
                  <React.Fragment key={p.url}>
                    <tr className="hover:bg-surface-strong/30">
                      <td className="px-4 py-2 min-w-[14rem]">
                        <div className="flex items-center gap-2 min-w-0">
                          <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-accent truncate max-w-xs inline-flex items-center gap-1" title={p.url}>
                            {p.is_home ? 'Accueil' : (p.title ? decodeHtml(p.title) : shortUrl(p.url))} <FiExternalLink size={10} className="flex-shrink-0" />
                          </a>
                          {p.edit_url && <a href={p.edit_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover flex-shrink-0" title="Éditer dans WordPress"><FiEdit3 size={12} /></a>}
                        </div>
                        <div className="text-text-muted text-xs truncate max-w-xs">{shortUrl(p.url)}{p.gsc_impressions ? ` · ${Number(p.gsc_impressions).toLocaleString('fr-FR')} impr.` : ''}</div>
                      </td>
                      <td className="px-2 py-2 text-center"><Score m={p.mobile} /></td>
                      <td className="px-2 py-2 text-center"><Score m={p.desktop} /></td>
                      <td className="px-2 py-2 text-center text-xs">
                        {f && f.category
                          ? <span className={`px-2 py-0.5 rounded-full ${CATEGORY[f.category] ? CATEGORY[f.category].cls : 'bg-neutral-bg text-neutral-text'}`}>{CATEGORY[f.category] ? CATEGORY[f.category].label : f.category}</span>
                          : <span className="text-text-muted" title="Pas assez de visiteurs réels sur 28 j pour cette page">trafic insuffisant</span>}
                      </td>
                      <td className="px-2 py-2 text-right text-xs whitespace-nowrap">
                        {f && f.lcp_ms != null
                          ? <span className={rateCls(f.lcp)} title="terrain">{ms(f.lcp_ms)}</span>
                          : <span className="text-text-secondary" title="labo (pas de donnée terrain)">{ms(m && m.lcp_ms)}<span className="text-text-muted"> labo</span></span>}
                      </td>
                      <td className="px-2 py-2 text-right text-xs whitespace-nowrap">
                        {f && f.inp_ms != null ? <span className={rateCls(f.inp)}>{ms(f.inp_ms)}</span>
                          : <span className="text-text-secondary" title="Pas d'INP en labo : TBT (Total Blocking Time) en approximation">{ms(m && m.tbt_ms)}<span className="text-text-muted"> TBT</span></span>}
                      </td>
                      <td className="px-2 py-2 text-right text-xs whitespace-nowrap">
                        {f && f.cls != null ? <span className={rateCls(f.cls_rating)}>{f.cls.toFixed(2)}</span>
                          : <span className="text-text-secondary">{m && m.cls != null ? Number(m.cls).toFixed(2) : '—'}<span className="text-text-muted"> labo</span></span>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {opps.length > 0 && (
                          <button onClick={() => setOpenUrl(open ? null : p.url)} className="text-text-muted hover:text-text-primary p-1 rounded" title="Opportunités d'optimisation">
                            {open ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                          </button>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={8} className="px-4 pb-3 pt-0 bg-surface-strong/20">
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs space-y-1 pt-2">
                            <div className="text-text-muted">Opportunités Lighthouse ({strategy}), gain estimé sur le chargement :</div>
                            <ul className="space-y-0.5">
                              {opps.map((o) => (
                                <li key={o.id} className="flex items-center justify-between gap-3">
                                  <span className="text-text-secondary">{o.title}</span>
                                  <span className="text-text-primary font-medium whitespace-nowrap">− {ms(o.savings_ms)}</span>
                                </li>
                              ))}
                            </ul>
                            <div className="text-text-muted pt-1">
                              Labo : FCP {ms(m.fcp_ms)} · Speed Index {ms(m.si_ms)} · TTFB {ms(m.ttfb_ms)} · mesuré le {fmtDate(m.checked_at)}
                            </div>
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-text-muted flex items-start gap-1"><FiInfo size={12} className="mt-0.5 flex-shrink-0" /> Seuils Core Web Vitals : LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,10 pour « bon ». Le terrain (CrUX) fait foi pour le classement ; le labo sert à diagnostiquer et à vérifier une correction immédiatement.</p>
    </div>
  );
};

export default SpeedTab;
