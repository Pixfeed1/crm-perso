// src/components/seo/TrafficTab.jsx
//
// Onglet « Trafic » : Google Analytics 4, propriété PAR SITE (saisie dans la fiche du site).
// Ce que Search Console ne dit pas : la visite réelle toutes sources, et ce que le visiteur
// en fait. Le rapprochement clics GSC / sessions organiques par page est le signal utile :
// une page bien classée qui ne retient pas est un problème de contenu, pas de SEO.
// Charte : tokens de thème, react-icons, recharts (comme PositionsTab), aucune couleur en dur.
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FiBarChart2, FiTrendingUp, FiTrendingDown, FiMinus, FiExternalLink, FiEdit3, FiInfo, FiLoader,
  FiRefreshCw, FiSettings, FiUsers
} from 'react-icons/fi';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { seoAPI } from '../../services/api';
import { decodeHtml } from '../../utils/formatters';

const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
const fmtPct = (n) => (n == null ? '—' : `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); };
const fmtDay = (s) => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); };
const fmtDur = (s) => (s == null ? '—' : s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`);
const shortUrl = (u) => { try { const x = new URL(u); return x.pathname || '/'; } catch { return u; } };

const CHANNEL_FR = {
  'Organic Search': 'Recherche organique', Direct: 'Direct', Referral: 'Sites référents', 'Organic Social': 'Réseaux sociaux',
  'Paid Search': 'Recherche payante', Email: 'E-mail', 'Organic Video': 'Vidéo', Unassigned: 'Non attribué', 'Cross-network': 'Multi-réseaux',
  'Paid Social': 'Réseaux payants', Display: 'Display', Affiliates: 'Affiliation', 'Organic Shopping': 'Shopping'
};

const Delta = ({ value, suffix = ' %' }) => {
  if (value == null) return <span className="text-text-muted text-xs">—</span>;
  if (Math.abs(value) < 0.05) return <span className="text-text-muted text-xs inline-flex items-center gap-0.5"><FiMinus size={10} /> 0{suffix}</span>;
  return value > 0
    ? <span className="text-success-text text-xs inline-flex items-center gap-0.5"><FiTrendingUp size={10} /> +{value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}{suffix}</span>
    : <span className="text-danger-text text-xs inline-flex items-center gap-0.5"><FiTrendingDown size={10} /> {value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}{suffix}</span>;
};

// Engagement : GA4 considère une session engagée au-delà de 10 s, d'une conversion ou de 2 pages.
const engCls = (p) => (p == null ? 'text-text-muted' : p >= 60 ? 'text-success-text' : p >= 40 ? 'text-warning-text' : 'text-danger-text');

const TOOLTIP_STYLE = {
  backgroundColor: 'rgb(var(--surface-strong))', border: '1px solid rgb(var(--border))',
  borderRadius: 8, color: 'rgb(var(--text-primary))', fontSize: 12
};

const TrafficTab = ({ siteId, gscStatus, onLaunch, job, jobActive, onOpenSites }) => {
  const [days, setDays] = useState(28);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageSort, setPageSort] = useState('sessions');

  const load = useCallback(() => {
    if (!siteId) return;
    setLoading(true);
    seoAPI.getAnalytics(siteId, days).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [siteId, days]);
  useEffect(() => { load(); }, [load]);
  const jobStatus = job && job.job_type === 'ga_sync' ? job.status : null;
  useEffect(() => { if (jobStatus === 'done') load(); }, [jobStatus, load]);

  const running = jobActive && job && job.job_type === 'ga_sync';
  const status = (data && data.status) || {};
  const analyticsOk = status.analytics_scope || (gscStatus && gscStatus.analytics);

  const syncBtn = (
    <button onClick={() => onLaunch('ga_sync')} disabled={jobActive || !analyticsOk || !status.property_id}
      className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Récupère les données de la propriété GA4 du site (90 jours la première fois, puis la veille)">
      {running
        ? <><motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} className="inline-flex"><FiLoader size={15} /></motion.span> Synchro en cours…</>
        : <><FiBarChart2 size={15} /> Synchroniser Analytics</>}
    </button>
  );

  if (loading && !data) return <p className="text-text-muted text-sm py-10 text-center">Chargement…</p>;
  if (!data) return null;

  // Prérequis manquants : dire lequel, et où le régler.
  if (!analyticsOk || !status.property_id || !data.has_data) {
    return (
      <div className="text-center py-12 bg-surface/30 rounded-xl border border-border space-y-3">
        <FiBarChart2 className="w-10 h-10 mx-auto text-text-muted" />
        {!analyticsOk ? (
          <div className="text-sm text-text-muted max-w-xl mx-auto space-y-2">
            <p>La connexion Google actuelle ne couvre pas Analytics : elle a été accordée pour Search Console seulement.</p>
            <p>À faire une fois, sur ton poste, dans le dossier du worker : <code className="px-1 rounded bg-surface-strong/60 text-text-primary">python gsc_auth.py</code>, puis la commande <code className="px-1 rounded bg-surface-strong/60 text-text-primary">--store</code> affichée, sur le serveur (même procédure que pour Search Console). Activer aussi « Google Analytics Data API » sur le projet Google Cloud.</p>
          </div>
        ) : !status.property_id ? (
          <div className="text-sm text-text-muted max-w-xl mx-auto space-y-3">
            <p>Aucune propriété Google Analytics 4 pour <span className="text-text-primary">{data.site.domain}</span>. Renseigne son identifiant numérique dans la fiche du site (Analytics, Admin, Paramètres de la propriété, ID de propriété).</p>
            <button onClick={onOpenSites} className="px-4 py-2 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm inline-flex items-center gap-2"><FiSettings size={15} /> Ouvrir la fiche du site</button>
          </div>
        ) : (
          <div className="text-sm text-text-muted max-w-xl mx-auto space-y-3">
            <p>Propriété GA4 {status.property_id} configurée, aucune donnée encore. La première synchro récupère 90 jours ; les suivantes tournent chaque nuit.</p>
            <div>{syncBtn}</div>
          </div>
        )}
      </div>
    );
  }

  const s = data.summary;
  const cards = [
    { label: 'Sessions', value: fmtNum(s.sessions), delta: s.delta.sessions },
    { label: 'Utilisateurs', value: fmtNum(s.users), delta: s.delta.users },
    { label: 'Pages vues', value: fmtNum(s.pageviews), delta: s.delta.pageviews },
    { label: 'Sessions organiques', value: fmtNum(s.organic_sessions), delta: s.delta.organic_sessions, hint: s.organic_share != null ? `${fmtPct(s.organic_share)} du trafic` : undefined },
    { label: 'Taux d’engagement', value: fmtPct(s.engagement_rate), cls: engCls(s.engagement_rate) },
    { label: 'Engagement moyen', value: fmtDur(s.avg_engagement_s), hint: 'par session' }
  ];
  const series = (data.series || []).map((r) => ({ ...r, day: fmtDay(r.date) }));
  const pages = [...(data.pages || [])].sort((a, b) => {
    if (pageSort === 'engagement') return (a.engagement_rate ?? 101) - (b.engagement_rate ?? 101);
    if (pageSort === 'gap') return ((b.gsc_clicks || 0) - (b.organic || 0)) - ((a.gsc_clicks || 0) - (a.organic || 0));
    return (b.sessions || 0) - (a.sessions || 0);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted">Fenêtre :</span>
          {[7, 28, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`px-2.5 py-1 rounded-lg ${days === d ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>{d} j</button>
          ))}
          <span className="text-text-muted ml-2">jusqu’au {fmtDate(data.range.to)} · variation vs {days} j précédents</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Rafraîchir"><FiRefreshCw size={15} /></button>
          {syncBtn}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="bg-surface border border-border rounded-xl p-3">
            <div className="text-text-muted text-xs mb-1">{c.label}</div>
            <div className={`text-xl font-bold ${c.cls || 'text-text-primary'}`}>{c.value}</div>
            <div className="text-[10px]">{c.delta !== undefined ? <Delta value={c.delta} /> : <span className="text-text-muted">{c.hint || ''}</span>}{c.delta !== undefined && c.hint && <span className="text-text-muted"> · {c.hint}</span>}</div>
          </div>
        ))}
      </div>

      {/* Courbe sessions / organiques */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2"><FiUsers size={14} /> Sessions par jour</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="sessions" name="Toutes sources" stroke="rgb(var(--accent))" fill="rgb(var(--accent))" fillOpacity={0.15} strokeWidth={2} />
              <Area type="monotone" dataKey="organic" name="Organique" stroke="rgb(var(--success-text))" fill="rgb(var(--success-text))" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Canaux */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 text-sm font-semibold text-text-primary border-b border-border">Canaux d’acquisition</div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border/50">
              {(data.channels || []).map((c) => (
                <tr key={c.channel}>
                  <td className="px-4 py-2 text-text-primary">{CHANNEL_FR[c.channel] || c.channel}</td>
                  <td className="px-2 py-2 text-right text-text-primary font-medium">{fmtNum(c.sessions)}</td>
                  <td className="px-2 py-2 text-right text-text-muted text-xs">{fmtPct(c.share)}</td>
                  <td className="px-4 py-2 text-right"><Delta value={c.delta} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pages */}
        <div className="bg-surface border border-border rounded-xl overflow-hidden lg:col-span-2">
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-border">
            <span className="text-sm font-semibold text-text-primary">Pages</span>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-text-muted mr-1">Trier :</span>
              {[{ k: 'sessions', l: 'Sessions' }, { k: 'engagement', l: 'Engagement faible' }, { k: 'gap', l: 'Clics GSC > organique' }].map((o) => (
                <button key={o.k} onClick={() => setPageSort(o.k)} className={`px-2 py-0.5 rounded ${pageSort === o.k ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>{o.l}</button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-xs text-text-muted border-b border-border">
                  <th className="text-left px-4 py-2 font-medium">Page</th>
                  <th className="text-right px-2 py-2 font-medium">Sessions</th>
                  <th className="text-right px-2 py-2 font-medium" title="Sessions venues de la recherche organique (GA4)">Organique</th>
                  <th className="text-right px-2 py-2 font-medium" title="Clics Search Console sur la même fenêtre">Clics GSC</th>
                  <th className="text-right px-2 py-2 font-medium" title="Sessions engagées : > 10 s, conversion ou 2 pages">Engag.</th>
                  <th className="text-right px-4 py-2 font-medium">Rebond</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {pages.map((p) => (
                  <tr key={p.page_path} className="hover:bg-surface-strong/30">
                    <td className="px-4 py-2 min-w-[14rem]">
                      <div className="flex items-center gap-2 min-w-0">
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-accent truncate max-w-xs inline-flex items-center gap-1" title={p.url}>
                          {p.page_path === '/' ? 'Accueil' : (p.title ? decodeHtml(p.title) : shortUrl(p.url))} <FiExternalLink size={10} className="flex-shrink-0" />
                        </a>
                        {p.edit_url && <a href={p.edit_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover flex-shrink-0" title="Éditer dans WordPress"><FiEdit3 size={12} /></a>}
                      </div>
                      <div className="text-text-muted text-xs truncate max-w-xs">{p.page_path}</div>
                    </td>
                    <td className="px-2 py-2 text-right text-text-primary font-medium">{fmtNum(p.sessions)}</td>
                    <td className="px-2 py-2 text-right text-text-secondary">{fmtNum(p.organic)}</td>
                    <td className="px-2 py-2 text-right text-text-secondary">{p.gsc_clicks == null ? <span className="text-text-muted">—</span> : fmtNum(p.gsc_clicks)}</td>
                    <td className={`px-2 py-2 text-right ${engCls(p.engagement_rate)}`}>{fmtPct(p.engagement_rate)}</td>
                    <td className="px-4 py-2 text-right text-text-secondary">{fmtPct(p.bounce_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <p className="text-xs text-text-muted flex items-start gap-1"><FiInfo size={12} className="mt-0.5 flex-shrink-0" /> Organique (GA4) et clics GSC mesurent la même chose de deux côtés : un écart fort et durable sur une page signale un problème de suivi Analytics ou une canonique différente. Engagement : GA4 compte une session engagée au-delà de 10 s, d’une conversion ou de 2 pages vues.</p>
    </div>
  );
};

export default TrafficTab;
