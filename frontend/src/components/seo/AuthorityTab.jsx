// src/components/seo/AuthorityTab.jsx
//
// Onglet « Autorité & liens » : l'équivalent des blocs Authority Score / Backlinks /
// Domaines référents du tableau de bord Semrush, avec des sources gratuites et nommées :
//   - Open PageRank : score 0..10 (proxy de l'Authority Score, pas la même formule),
//     rang mondial, domaines référents ;
//   - Bing Webmaster Tools : liens entrants connus de Bing, domaine par domaine, avec
//     ancre et page cible ; liens gagnés / perdus.
// Données produites par le worker (job 'authority'), un instantané par jour.
// Charte : tokens de thème, react-icons, recharts, aucune couleur en dur.
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FiAward, FiExternalLink, FiEdit3, FiTrendingUp, FiTrendingDown, FiMinus, FiInfo,
  FiLoader, FiRefreshCw, FiPlusCircle, FiMinusCircle, FiShield, FiChevronDown, FiChevronRight
} from 'react-icons/fi';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { seoAPI } from '../../services/api';
import { decodeHtml } from '../../utils/formatters';

const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); };
const fmtDay = (s) => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); };
const shortUrl = (u) => { try { const x = new URL(u); return (x.pathname || '/') + (x.search || ''); } catch { return u; } };

// Score Open PageRank : vert >= 5, ambre >= 3, sinon neutre (échelle 0..10, logarithmique).
const oprCls = (s) => (s == null ? 'text-text-muted' : s >= 5 ? 'text-success-text' : s >= 3 ? 'text-warning-text' : 'text-text-primary');

const Delta = ({ value, dec = 0, suffix = '' }) => {
  if (value == null) return null;
  if (Math.abs(value) < Math.pow(10, -dec) / 2) return <span className="text-text-muted text-xs inline-flex items-center gap-0.5"><FiMinus size={10} /></span>;
  const txt = Math.abs(value).toLocaleString('fr-FR', { maximumFractionDigits: dec });
  return value > 0
    ? <span className="text-success-text text-xs inline-flex items-center gap-0.5"><FiTrendingUp size={10} /> +{txt}{suffix}</span>
    : <span className="text-danger-text text-xs inline-flex items-center gap-0.5"><FiTrendingDown size={10} /> −{txt}{suffix}</span>;
};

const REL_FR = { follow: 'Follow', nofollow: 'Nofollow', sponsored: 'Sponsored', ugc: 'UGC', unknown: 'Non vérifié' };
const TYPE_FR = { text: 'Texte', image: 'Image', unknown: 'Non vérifié' };
const COUNTRY_FR = { FR: 'France', US: 'États-Unis', DE: 'Allemagne', GB: 'Royaume-Uni', BE: 'Belgique', CH: 'Suisse', CA: 'Canada', ES: 'Espagne', IT: 'Italie', NL: 'Pays-Bas', SG: 'Singapour', MD: 'Moldavie', RU: 'Russie', IN: 'Inde', CN: 'Chine', JP: 'Japon', '??': 'Inconnu' };
const toxBadge = (t) => (t == null ? null : t >= 60 ? <span className="px-1.5 py-0.5 rounded bg-danger-bg text-danger-text text-xs">toxique {t}</span> : t >= 30 ? <span className="px-1.5 py-0.5 rounded bg-warning-bg text-warning-text text-xs">douteux {t}</span> : <span className="px-1.5 py-0.5 rounded bg-success-bg text-success-text text-xs">sain {t}</span>);

// Barres horizontales simples : libellé, part, effectif. Même gabarit que Semrush, sans couleur en dur.
const Bars = ({ title, rows, labelOf = (r) => r.label, hint }) => {
  const total = rows.reduce((a, r) => a + (r.n || 0), 0) || 1;
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-sm font-semibold text-text-primary mb-2">{title}{hint && <span className="text-text-muted text-xs font-normal ml-2">{hint}</span>}</div>
      {rows.length === 0 && <p className="text-xs text-text-muted">Pas encore de données.</p>}
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={i} className="text-xs">
            <div className="flex items-center justify-between gap-2"><span className="text-text-secondary truncate">{labelOf(r)}</span><span className="text-text-muted whitespace-nowrap">{Math.round((100 * (r.n || 0)) / total)} % <span className="text-text-primary font-medium ml-1">{fmtNum(r.n)}</span></span></div>
            <div className="h-1.5 rounded bg-surface-strong overflow-hidden"><div className="h-full bg-accent/70 rounded" style={{ width: `${Math.max(1, (100 * (r.n || 0)) / total)}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
};

const TOOLTIP_STYLE = {
  backgroundColor: 'rgb(var(--surface-strong))', border: '1px solid rgb(var(--border))',
  borderRadius: 8, color: 'rgb(var(--text-primary))', fontSize: 12
};

const AuthorityTab = ({ siteId, onLaunch, job, jobActive }) => {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('domains'); // domains | recent | targets
  const [showLost, setShowLost] = useState(true);
  const [openTox, setOpenTox] = useState(null);

  const load = useCallback(() => {
    if (!siteId) return;
    setLoading(true);
    seoAPI.getAuthority(siteId, days).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [siteId, days]);
  useEffect(() => { load(); }, [load]);
  const jobStatus = job && job.job_type === 'authority' ? job.status : null;
  useEffect(() => { if (jobStatus === 'done') load(); }, [jobStatus, load]);

  const running = jobActive && job && job.job_type === 'authority';
  const status = (data && data.status) || {};
  const launchBtn = (
    <button onClick={() => onLaunch('authority')} disabled={jobActive || (!status.opr_configured && !status.bing_configured)}
      className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      title="Open PageRank (autorité) + Bing Webmaster Tools (liens entrants)">
      {running
        ? <><motion.span animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} className="inline-flex"><FiLoader size={15} /></motion.span> Analyse en cours{job.progress_total ? ` ${job.progress_current}/${job.progress_total}` : '…'}</>
        : <><FiAward size={15} /> Analyser l’autorité</>}
    </button>
  );

  if (loading && !data) return <p className="text-text-muted text-sm py-10 text-center">Chargement…</p>;
  if (!data) return null;

  if (!data.has_data) {
    return (
      <div className="text-center py-12 bg-surface/30 rounded-xl border border-border space-y-3">
        <FiAward className="w-10 h-10 mx-auto text-text-muted" />
        <p className="text-text-muted text-sm max-w-xl mx-auto">
          Aucune analyse d’autorité pour ce site. L’analyse interroge Open PageRank (score d’autorité du domaine, gratuit) et Bing Webmaster Tools (liens entrants connus de Bing, gratuit). Une à deux minutes.
        </p>
        {(!status.opr_configured || !status.bing_configured) && (
          <p className="text-xs text-warning-text max-w-xl mx-auto inline-flex items-start gap-1"><FiInfo size={13} className="mt-0.5 flex-shrink-0" />
            {!status.opr_configured && !status.bing_configured ? 'Ni OPR_API_KEY ni BING_WMT_API_KEY dans backend/.env : rien à interroger.'
              : !status.opr_configured ? 'OPR_API_KEY absent de backend/.env : pas de score d’autorité, liens Bing seulement.'
                : 'BING_WMT_API_KEY absent de backend/.env : score d’autorité seulement, pas de liste de liens.'}
          </p>
        )}
        <div>{launchBtn}</div>
      </div>
    );
  }

  const s = data.summary;
  const d = s.delta || {};
  const cards = [
    { label: 'Autorité (Open PageRank)', value: s.opr_score == null ? '—' : s.opr_score.toLocaleString('fr-FR', { maximumFractionDigits: 2 }), suffix: s.opr_score == null ? '' : '/10', cls: oprCls(s.opr_score), delta: <Delta value={d.opr_score} dec={2} /> },
    { label: 'Rang mondial', value: s.opr_rank == null ? '—' : `#${fmtNum(s.opr_rank)}`, delta: <Delta value={d.opr_rank} />, hint: 'plus petit = mieux' },
    { label: 'Domaines référents (OPR)', value: fmtNum(s.opr_referring_domains), delta: <Delta value={d.opr_referring_domains} /> },
    { label: 'Liens entrants (Bing)', value: fmtNum(s.bing_backlinks), delta: <Delta value={d.bing_backlinks} /> },
    { label: 'Domaines référents (Bing)', value: fmtNum(s.bing_referring_domains), delta: <Delta value={d.bing_referring_domains} /> },
    { label: `Gagnés / perdus (${days} j)`, value: <span><span className="text-success-text">+{fmtNum(s.gained)}</span> <span className="text-text-muted">/</span> <span className="text-danger-text">−{fmtNum(s.lost)}</span></span>, hint: `${s.gained_domains} / ${s.lost_domains} domaines` }
  ];
  const series = (data.series || []).map((r) => ({ ...r, day: fmtDay(r.date) }));
  const domains = (data.domains || []).filter((x) => showLost || !x.lost);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted">Variation sur :</span>
          {[7, 30, 90].map((n) => (
            <button key={n} onClick={() => setDays(n)} className={`px-2.5 py-1 rounded-lg ${days === n ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>{n} j</button>
          ))}
          <span className="text-text-muted ml-2">instantané du {fmtDate(s.date)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Rafraîchir"><FiRefreshCw size={15} /></button>
          {launchBtn}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="bg-surface border border-border rounded-xl p-3">
            <div className="text-text-muted text-xs mb-1">{c.label}</div>
            <div className={`text-xl font-bold ${c.cls || 'text-text-primary'}`}>{c.value}{c.suffix && <span className="text-text-muted text-xs font-normal">{c.suffix}</span>}</div>
            <div className="text-[10px] text-text-muted">{c.delta}{c.hint && <span> {c.delta ? '· ' : ''}{c.hint}</span>}</div>
          </div>
        ))}
      </div>

      {series.length > 1 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2"><FiAward size={14} /> Tendance</div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }} minTickGap={24} />
                <YAxis yAxisId="l" tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }} domain={[0, 10]} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="l" type="monotone" dataKey="opr_score" name="Autorité (0-10)" stroke="rgb(var(--accent))" strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="r" type="monotone" dataKey="opr_referring_domains" name="Domaines référents (OPR)" stroke="rgb(var(--success-text))" strokeWidth={2} dot={false} connectNulls />
                <Line yAxisId="r" type="monotone" dataKey="bing_referring_domains" name="Domaines référents (Bing)" stroke="rgb(var(--warning-text))" strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Nouveaux / perdus par semaine (12 semaines) */}
      {(data.weekly || []).some((w) => w.gained || w.lost) && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2"><FiPlusCircle size={14} /> Liens nouveaux et perdus par semaine</div>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(data.weekly || []).map((w) => ({ ...w, week: fmtDay(w.week), lostNeg: -w.lost }))} margin={{ top: 4, right: 8, left: -18, bottom: 0 }} stackOffset="sign">
                <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [Math.abs(v), name]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine y={0} stroke="rgb(var(--border))" />
                <Bar dataKey="gained" name="Nouveaux" stackId="a" fill="rgb(var(--accent))" radius={[3, 3, 0, 0]} />
                <Bar dataKey="lostNeg" name="Perdus" stackId="a" fill="rgb(var(--danger-text))" radius={[0, 0, 3, 3]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Attributs, types, autorité, TLD, pays, ancres */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <Bars title="Attributs de liens" rows={(data.attributes && data.attributes.rel) || []} labelOf={(r) => REL_FR[r.rel] || r.rel}
          hint={data.attributes ? `${fmtNum(data.attributes.verified)}/${fmtNum(data.attributes.total_active)} vérifiés à la source` : ''} />
        <Bars title="Type de backlinks" rows={(data.attributes && data.attributes.types) || []} labelOf={(r) => TYPE_FR[r.link_type] || r.link_type} />
        <Bars title="Domaines référents par autorité" rows={[...(data.opr_buckets || [])].sort((a, b) => (b.bucket === 'inconnu' ? -1 : a.bucket === 'inconnu' ? 1 : b.bucket.localeCompare(a.bucket)))} labelOf={(r) => (r.bucket === 'inconnu' ? 'Autorité inconnue' : `Open PageRank ${r.bucket}`)} />
        <Bars title="Répartition TLD" rows={data.tlds || []} labelOf={(r) => `.${r.tld}`} hint="domaines référents" />
        <Bars title="Pays d’hébergement" rows={data.countries || []} labelOf={(r) => COUNTRY_FR[r.country] || r.country} hint="ccTLD, sinon registre de l’IP" />
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-sm font-semibold text-text-primary mb-2">Meilleures ancres</div>
          {(data.anchors || []).length === 0 && <p className="text-xs text-text-muted">Pas encore d’ancre connue.</p>}
          <ul className="space-y-1">
            {(data.anchors || []).map((a) => (
              <li key={a.anchor} className="text-xs flex items-center justify-between gap-2">
                <span className="text-text-secondary truncate" title={a.anchor}>« {a.anchor} »</span>
                <span className="text-text-muted whitespace-nowrap">{fmtNum(a.domains)} dom. · {fmtNum(a.n)} liens</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Toxicité maison */}
      {data.toxicity && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <div className="text-sm font-semibold text-text-primary flex items-center gap-2"><FiShield size={14} /> Toxicité des liens entrants</div>
            <div className="flex items-center gap-4 text-xs">
              <span className={`text-2xl font-bold ${data.toxicity.score == null ? 'text-text-muted' : data.toxicity.score >= 20 ? 'text-danger-text' : data.toxicity.score >= 5 ? 'text-warning-text' : 'text-success-text'}`}>{data.toxicity.score == null ? '—' : `${data.toxicity.score} %`}</span>
              <span className="text-text-muted">des liens actifs viennent de domaines toxiques</span>
              <span className="text-success-text">{fmtNum(data.toxicity.buckets.sain)} sains</span>
              <span className="text-warning-text">{fmtNum(data.toxicity.buckets.douteux)} douteux</span>
              <span className="text-danger-text">{fmtNum(data.toxicity.buckets.toxique)} toxiques</span>
            </div>
          </div>
          {(data.toxicity.worst || []).length === 0 ? (
            <p className="text-xs text-text-muted">Aucun domaine douteux ou toxique parmi les {fmtNum(data.toxicity.domains_evaluated)} évalués.</p>
          ) : (
            <ul className="divide-y divide-border/50">
              {data.toxicity.worst.map((t) => (
                <li key={t.domain} className="py-1.5 text-xs">
                  <button onClick={() => setOpenTox(openTox === t.domain ? null : t.domain)} className="w-full flex items-center justify-between gap-2 text-left">
                    <span className="flex items-center gap-2 min-w-0">{toxBadge(t.toxicity)}<span className="text-text-primary truncate">{t.domain}</span><span className="text-text-muted">{fmtNum(t.links)} lien{t.links > 1 ? 's' : ''}{t.opr_score != null ? ` · OPR ${t.opr_score}` : ''}</span></span>
                    {openTox === t.domain ? <FiChevronDown size={14} className="text-text-muted" /> : <FiChevronRight size={14} className="text-text-muted" />}
                  </button>
                  {openTox === t.domain && (
                    <ul className="mt-1 pl-4 list-disc text-text-secondary">{(t.toxicity_reasons || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-text-muted mt-2">{data.toxicity.method}</p>
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-border">
          <div className="flex items-center gap-1 text-xs">
            {[{ k: 'domains', l: `Domaines référents (${(data.domains || []).length})` }, { k: 'recent', l: `Gagnés / perdus ${days} j (${(data.recent || []).length})` }, { k: 'targets', l: `Pages les plus liées (${(data.targets || []).length})` }].map((o) => (
              <button key={o.k} onClick={() => setView(o.k)} className={`px-2.5 py-1 rounded-lg ${view === o.k ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>{o.l}</button>
            ))}
          </div>
          {view === 'domains' && (
            <label className="text-xs text-text-muted inline-flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={showLost} onChange={(e) => setShowLost(e.target.checked)} className="accent-current" /> afficher les perdus
            </label>
          )}
        </div>
        <div className="overflow-x-auto max-h-[30rem] overflow-y-auto">
          {view === 'domains' && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-xs text-text-muted border-b border-border">
                  <th className="text-left px-4 py-2 font-medium">Domaine source</th>
                  <th className="text-right px-2 py-2 font-medium">Liens</th>
                  <th className="text-right px-2 py-2 font-medium" title="follow / nofollow (vérifiés à la source)">F / NF</th>
                  <th className="text-right px-2 py-2 font-medium" title="Open PageRank du domaine source">Autorité</th>
                  <th className="text-left px-2 py-2 font-medium">Pays</th>
                  <th className="text-left px-2 py-2 font-medium">Ancre (dernière)</th>
                  <th className="text-right px-2 py-2 font-medium">Toxicité</th>
                  <th className="text-right px-4 py-2 font-medium">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {domains.map((x) => (
                  <tr key={x.source_domain} className={`hover:bg-surface-strong/30 ${x.lost ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2">
                      <a href={x.source_url} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-accent inline-flex items-center gap-1" title={x.source_url}>{x.source_domain} <FiExternalLink size={10} /></a>
                      <div className="text-text-muted text-xs truncate max-w-xs">→ {shortUrl(x.target_url)}</div>
                    </td>
                    <td className="px-2 py-2 text-right text-text-primary font-medium">{fmtNum(x.links)}<div className="text-text-muted text-[10px]">{fmtNum(x.targets)} page{x.targets > 1 ? 's' : ''}</div></td>
                    <td className="px-2 py-2 text-right text-xs whitespace-nowrap"><span className="text-success-text">{x.follow_links}</span> <span className="text-text-muted">/</span> <span className="text-text-secondary">{x.nofollow_links}</span></td>
                    <td className={`px-2 py-2 text-right text-xs ${oprCls(x.opr_score)}`}>{x.opr_score == null ? <span className="text-text-muted">—</span> : x.opr_score.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</td>
                    <td className="px-2 py-2 text-xs text-text-secondary">{x.country ? (COUNTRY_FR[x.country] || x.country) : <span className="text-text-muted">—</span>}</td>
                    <td className="px-2 py-2 text-text-secondary text-xs truncate max-w-[12rem]" title={x.anchor || ''}>{x.anchor || <span className="text-text-muted">—</span>}<div className="text-text-muted text-[10px]">vu le {fmtDate(x.first_seen)}</div></td>
                    <td className="px-2 py-2 text-right">{x.toxicity == null ? <span className="text-text-muted text-xs">—</span> : toxBadge(x.toxicity)}</td>
                    <td className="px-4 py-2 text-right text-xs">{x.lost ? <span className="px-1.5 py-0.5 rounded bg-danger-bg text-danger-text">perdu</span> : <span className="px-1.5 py-0.5 rounded bg-success-bg text-success-text">actif</span>}</td>
                  </tr>
                ))}
                {!domains.length && <tr><td colSpan={8} className="px-4 py-6 text-center text-text-muted text-sm">Aucun lien entrant connu de Bing pour l’instant.</td></tr>}
              </tbody>
            </table>
          )}
          {view === 'recent' && (
            <ul className="divide-y divide-border/50">
              {(data.recent || []).map((r) => (
                <li key={`${r.source_url}|${r.target_url}`} className="px-4 py-2 flex flex-wrap items-center gap-2 text-xs">
                  {r.status === 'lost' ? <FiMinusCircle size={14} className="text-danger-text flex-shrink-0" /> : <FiPlusCircle size={14} className="text-success-text flex-shrink-0" />}
                  <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-accent break-all">{r.source_domain}{shortUrl(r.source_url) !== '/' ? shortUrl(r.source_url) : ''}</a>
                  <span className="text-text-muted">→ {shortUrl(r.target_url)}</span>
                  {r.anchor && <span className="text-text-secondary">« {r.anchor} »</span>}
                  <span className="text-text-muted ml-auto">{r.status === 'lost' ? `perdu le ${fmtDate(r.lost_at)}` : `vu le ${fmtDate(r.first_seen)}`}</span>
                </li>
              ))}
              {!(data.recent || []).length && <li className="px-4 py-6 text-center text-text-muted text-sm">Aucun mouvement sur la période.</li>}
            </ul>
          )}
          {view === 'targets' && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-xs text-text-muted border-b border-border">
                  <th className="text-left px-4 py-2 font-medium">Page du site</th>
                  <th className="text-right px-2 py-2 font-medium">Domaines</th>
                  <th className="text-right px-4 py-2 font-medium">Liens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(data.targets || []).map((t) => (
                  <tr key={t.target_url} className="hover:bg-surface-strong/30">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <a href={t.target_url} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-accent truncate max-w-md inline-flex items-center gap-1" title={t.target_url}>{t.title ? decodeHtml(t.title) : shortUrl(t.target_url)} <FiExternalLink size={10} className="flex-shrink-0" /></a>
                        {t.edit_url && <a href={t.edit_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover flex-shrink-0" title="Éditer dans WordPress"><FiEdit3 size={12} /></a>}
                      </div>
                      <div className="text-text-muted text-xs truncate max-w-md">{shortUrl(t.target_url)}</div>
                    </td>
                    <td className="px-2 py-2 text-right text-text-primary font-medium">{fmtNum(t.domains)}</td>
                    <td className="px-4 py-2 text-right text-text-secondary">{fmtNum(t.links)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <p className="text-xs text-text-muted flex items-start gap-1"><FiInfo size={12} className="mt-0.5 flex-shrink-0" /> Open PageRank (0 à 10, échelle logarithmique) est un équivalent gratuit de l’Authority Score, pas la même formule : comparez-le à vos concurrents sur la même échelle, pas à un chiffre Semrush. Les liens viennent de Bing, un sous-ensemble du web, puis sont vérifiés à la source : attribut rel, type et présence sont constatés sur la page qui vous lie. Un lien « perdu » a disparu de sa page, ou la page a disparu. Le pays est celui de l’hébergement, pas de l’audience.</p>
    </div>
  );
};

export default AuthorityTab;
