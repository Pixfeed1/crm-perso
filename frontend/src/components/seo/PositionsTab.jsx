// src/components/seo/PositionsTab.jsx
//
// Suivi de positions (rank tracker) — 100% Google Search Console (seo_gsc_daily).
// 3 sous-vues : par mot-clé (watchlist), par article, Yoast vs réel.
// Position = SUM(impr*pos)/SUM(impr) (même formule que le cache Opportunités). Fenêtre 28j
// par défaut (= cache) ; sélecteur 7/28/90j. Courbes recharts, axe Y inversé (position 1 en haut).
// Charte : tokens de thème, react-icons, framer-motion, aucune couleur en dur.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FiSearch, FiStar, FiTrendingUp, FiTrendingDown, FiMinus, FiExternalLink, FiFileText, FiTarget
} from 'react-icons/fi';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { seoAPI } from '../../services/api';
import { decodeHtml } from '../../utils/formatters';
import { useToast } from '../../hooks/useToast';

const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
const fmtPos = (n) => (n == null ? '—' : Number(n).toFixed(1));
const fmtPct = (n) => (n == null ? '—' : `${(Number(n) * 100).toFixed(1)} %`);
const fmtDay = (s) => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); };

// Delta de position : positif = progression (on a gagné des places, la position a baissé).
const Delta = ({ value }) => {
  if (value == null) return <span className="text-text-muted">—</span>;
  const v = Number(value);
  if (Math.abs(v) < 0.1) return <span className="text-text-muted inline-flex items-center gap-1"><FiMinus size={12} /> 0</span>;
  if (v > 0) return <span className="text-success-text inline-flex items-center gap-1"><FiTrendingUp size={12} /> +{v.toFixed(1)}</span>;
  return <span className="text-danger-text inline-flex items-center gap-1"><FiTrendingDown size={12} /> {v.toFixed(1)}</span>;
};

// Domaine de l'axe Y inversé, adapté aux données (évite l'effet "plat" sur 1..100).
const invertedDomain = (series, key) => {
  const vals = series.map((p) => p[key]).filter((v) => v != null).map(Number);
  if (!vals.length) return [10, 1];
  let min = Math.min(...vals), max = Math.max(...vals);
  const margin = Math.max(1, (max - min) * 0.2);
  min = Math.max(1, Math.floor(min - margin));
  max = Math.ceil(max + margin);
  return [min, max]; // YAxis reversed -> min (meilleure position) en haut
};

const TOOLTIP_STYLE = {
  backgroundColor: 'rgb(var(--surface-strong))',
  border: '1px solid rgb(var(--border))',
  borderRadius: 8,
  color: 'rgb(var(--text-primary))',
  fontSize: 12
};

const PositionsTab = ({ siteId, gscConnected }) => {
  const { toast } = useToast();
  const [days, setDays] = useState(28);
  const [sub, setSub] = useState('keywords'); // 'keywords' | 'page' | 'yoast'

  const [summary, setSummary] = useState(null);
  const [keywords, setKeywords] = useState([]);
  const [tracked, setTracked] = useState([]); // [{id, keyword}]
  const [search, setSearch] = useState('');
  const [trackedOnly, setTrackedOnly] = useState(false);
  const [selKeyword, setSelKeyword] = useState(null);
  const [kwSeries, setKwSeries] = useState([]);

  const [pages, setPages] = useState([]);
  const [selPage, setSelPage] = useState('');
  const [pageData, setPageData] = useState(null);

  const [yoast, setYoast] = useState([]);
  const [loading, setLoading] = useState(false);

  const trackedSet = new Map(tracked.map((t) => [t.keyword, t.id]));

  // Tri du tableau « Par mot-clé » (clic sur l'entête). Défaut : impressions décroissantes.
  const [kwSort, setKwSort] = useState({ field: 'impressions', dir: 'desc' });
  const sortKw = (field) => setKwSort((s) => s.field === field
    ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' }
    : { field, dir: field === 'query' ? 'asc' : 'desc' });
  const sortedKeywords = useMemo(() => {
    const arr = [...keywords];
    const { field, dir } = kwSort;
    const mul = dir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (field === 'query') return mul * String(a.query || '').localeCompare(String(b.query || ''), 'fr');
      const av = a[field], bv = b[field];
      const an = (av === null || av === undefined) ? (dir === 'asc' ? Infinity : -Infinity) : av;
      const bn = (bv === null || bv === undefined) ? (dir === 'asc' ? Infinity : -Infinity) : bv;
      return mul * (an - bn);
    });
    return arr;
  }, [keywords, kwSort]);

  // Synthèse + watchlist : toujours chargées (cartes en tête).
  useEffect(() => {
    if (!siteId) return;
    seoAPI.getPositionsSummary(siteId, days).then(setSummary).catch(() => setSummary(null));
    seoAPI.getTrackedKeywords(siteId).then((t) => setTracked(t || [])).catch(() => {});
  }, [siteId, days]);

  // Liste de mots-clés (vue 1).
  const loadKeywords = useCallback(() => {
    if (!siteId) return;
    setLoading(true);
    seoAPI.getPositionsKeywords(siteId, { days, search, tracked: trackedOnly ? 1 : 0 })
      .then((k) => setKeywords(k || []))
      .catch(() => setKeywords([]))
      .finally(() => setLoading(false));
  }, [siteId, days, search, trackedOnly]);
  useEffect(() => { if (sub === 'keywords') loadKeywords(); }, [sub, loadKeywords]);

  // Pages (vue 2) + Yoast (vue 3).
  useEffect(() => {
    if (!siteId) return;
    if (sub === 'page' && pages.length === 0) seoAPI.getPositionsPages(siteId, days).then((p) => setPages(p || [])).catch(() => {});
    if (sub === 'yoast') seoAPI.getPositionsYoast(siteId, days).then((y) => setYoast(y || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, siteId, days]);

  const openKeyword = (kw) => {
    setSelKeyword(kw);
    setKwSeries([]);
    seoAPI.getPositionKeywordSeries(siteId, kw, days).then((s) => setKwSeries(s || [])).catch(() => {});
  };

  const openPage = (url) => {
    setSelPage(url);
    setPageData(null);
    if (url) seoAPI.getPositionsPage(siteId, url, days).then(setPageData).catch(() => setPageData(null));
  };

  const toggleTrack = async (kw) => {
    const id = trackedSet.get(kw);
    try {
      if (id) { await seoAPI.deleteTrackedKeyword(id); setTracked((t) => t.filter((x) => x.id !== id)); }
      else { const r = await seoAPI.addTrackedKeyword(siteId, kw); if (r) setTracked((t) => [...t, r]); }
    } catch (e) { toast.error('Erreur watchlist'); }
  };

  if (!gscConnected) {
    return (
      <div className="text-center py-12 bg-surface/30 rounded-xl border border-border">
        <FiTarget className="w-10 h-10 mx-auto text-text-muted mb-3" />
        <p className="text-text-muted text-sm">Connectez Search Console et lancez une synchro pour suivre vos positions.</p>
      </div>
    );
  }

  const cards = summary ? [
    { label: 'Mots-clés', value: fmtNum(summary.total_keywords) },
    { label: 'Top 3', value: fmtNum(summary.top3), cls: 'text-success-text' },
    { label: 'Top 10', value: fmtNum(summary.top10), cls: 'text-info-text' },
    { label: 'Top 20', value: fmtNum(summary.top20) },
    { label: 'Top 100', value: fmtNum(summary.top100) },
    { label: 'Position moy.', value: fmtPos(summary.avg_position) },
    { label: 'Impressions', value: fmtNum(summary.impressions) },
    { label: 'Clics', value: fmtNum(summary.clicks) },
    { label: 'CTR moyen', value: fmtPct(summary.ctr) }
  ] : [];

  return (
    <div className="space-y-4">
      {/* Cartes de synthèse + sélecteur de période */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2"><FiTarget size={15} /> Suivi de positions</h3>
        <div className="flex items-center gap-2">
          <span className="text-text-muted text-xs">Période</span>
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="px-2 py-1 bg-surface-muted border border-border rounded-lg text-text-primary text-xs focus:outline-none focus:border-accent">
            {[7, 28, 90].map((d) => <option key={d} value={d}>{d} jours</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="bg-surface border border-border rounded-xl p-3">
            <div className="text-text-muted text-xs mb-1">{c.label}</div>
            <div className={`text-lg font-bold ${c.cls || 'text-text-primary'}`}>{c.value ?? '—'}</div>
          </div>
        ))}
      </div>

      {/* Distribution des positions */}
      {summary && summary.distribution && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs text-text-muted mb-2">Distribution des positions</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={summary.distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgb(var(--surface-strong))', opacity: 0.4 }} />
              <Bar dataKey="count" name="Mots-clés" fill="rgb(var(--accent))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Sous-onglets */}
      <div className="flex gap-2 flex-wrap">
        {[{ k: 'keywords', l: 'Par mot-clé' }, { k: 'page', l: 'Par article' }, { k: 'yoast', l: 'Yoast vs réel' }].map((t) => (
          <button key={t.k} onClick={() => setSub(t.k)}
            className={`px-3 py-1.5 rounded-lg text-sm ${sub === t.k ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {/* VUE 1 — PAR MOT-CLÉ */}
      {sub === 'keywords' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <FiSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un mot-clé…"
                className="w-full pl-9 pr-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent" />
            </div>
            <button onClick={() => setTrackedOnly((v) => !v)}
              className={`px-3 py-2 rounded-lg text-sm inline-flex items-center gap-1.5 ${trackedOnly ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>
              <FiStar size={14} /> Suivis
            </button>
          </div>

          {selKeyword && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-text-primary font-medium">Évolution : {selKeyword}</div>
                <button onClick={() => setSelKeyword(null)} className="text-text-muted hover:text-text-primary text-xs">Fermer</button>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={kwSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }} />
                  <YAxis reversed domain={invertedDomain(kwSeries, 'position')} allowDecimals={false}
                    tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }} width={32} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={fmtDay}
                    formatter={(v, n) => [n === 'position' ? fmtPos(v) : fmtNum(v), n === 'position' ? 'Position' : 'Impressions']} />
                  <Line type="monotone" dataKey="position" stroke="rgb(var(--accent))" strokeWidth={2} dot={false} name="position" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-surface border border-border rounded-xl p-4 overflow-x-auto">
            {loading ? <p className="text-text-muted text-sm py-6 text-center">Chargement…</p> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-muted text-xs text-left border-b border-border">
                    {(() => {
                      const arrow = (f) => kwSort.field === f ? (kwSort.dir === 'asc' ? ' ↑' : ' ↓') : '';
                      const Th = ({ f, label, right }) => (
                        <th onClick={() => sortKw(f)}
                          className={`py-2 px-2 cursor-pointer select-none hover:text-text-primary ${right ? 'text-right' : ''}`}>
                          {label}{arrow(f)}
                        </th>
                      );
                      return (<>
                        <th className="py-2 pr-2"></th>
                        <Th f="query" label="Mot-clé" />
                        <Th f="position" label="Position" right />
                        <Th f="delta" label="Évolution" right />
                        <Th f="impressions" label="Impr." right />
                        <Th f="clicks" label="Clics" right />
                        <Th f="ctr" label="CTR" right />
                        <th className="py-2 pl-2">Page</th>
                      </>);
                    })()}
                  </tr>
                </thead>
                <tbody>
                  {sortedKeywords.map((k) => (
                    <tr key={k.query} className="border-b border-border/50 hover:bg-surface-strong/30">
                      <td className="py-2 pr-2">
                        <button onClick={() => toggleTrack(k.query)} title={trackedSet.has(k.query) ? 'Retirer du suivi' : 'Suivre'}
                          className={trackedSet.has(k.query) ? 'text-warning-text' : 'text-text-muted hover:text-text-primary'}>
                          <FiStar size={14} fill={trackedSet.has(k.query) ? 'currentColor' : 'none'} />
                        </button>
                      </td>
                      <td className="py-2 pr-2">
                        <button onClick={() => openKeyword(k.query)} className="text-text-primary hover:text-accent text-left">{k.query}</button>
                      </td>
                      <td className="py-2 px-2 text-right text-text-secondary">{fmtPos(k.position)}</td>
                      <td className="py-2 px-2 text-right"><Delta value={k.delta} /></td>
                      <td className="py-2 px-2 text-right text-text-secondary">{fmtNum(k.impressions)}</td>
                      <td className="py-2 px-2 text-right text-text-secondary">{fmtNum(k.clicks)}</td>
                      <td className="py-2 px-2 text-right text-text-secondary">{fmtPct(k.ctr)}</td>
                      <td className="py-2 pl-2 min-w-0">
                        {k.page_url && <a href={k.page_url} target="_blank" rel="noopener noreferrer" className="text-text-muted text-xs hover:text-accent truncate inline-flex items-center gap-1 max-w-xs">{k.page_url} <FiExternalLink size={10} /></a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!loading && keywords.length === 0 && <p className="text-text-muted text-sm py-6 text-center">Aucun mot-clé sur cette période.</p>}
          </div>
        </div>
      )}

      {/* VUE 2 — PAR ARTICLE */}
      {sub === 'page' && (
        <div className="space-y-3">
          {/* Liste d'articles cliquables : on voit d'un coup d'œil combien de mots-clés porte
              chaque page + sa position moyenne, et on clique pour dérouler ses mots-clés. */}
          <div className="bg-surface border border-border rounded-xl divide-y divide-border/50 max-h-80 overflow-y-auto">
            {pages.length === 0 ? (
              <p className="text-text-muted text-sm py-6 text-center">Aucun article positionné sur cette période.</p>
            ) : pages.map((p) => (
              <button key={p.page_url} onClick={() => openPage(p.page_url)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${selPage === p.page_url ? 'bg-accent/10' : 'hover:bg-surface-strong/40'}`}>
                <div className="min-w-0">
                  <div className="text-sm text-text-primary truncate">{decodeHtml(p.title) || p.page_url}</div>
                  <div className="text-text-muted text-xs truncate">{p.page_url}</div>
                </div>
                <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
                  <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium">{p.keywords} mots-clés</span>
                  <span className="px-2 py-0.5 rounded-full bg-info-bg text-info-text">pos. {fmtPos(p.position)}</span>
                  <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text hidden sm:inline">{fmtNum(p.impressions)} impr.</span>
                </div>
              </button>
            ))}
          </div>

          {pageData && (
            <>
              <div className="bg-surface border border-border rounded-xl p-4">
                <div className="text-xs text-text-muted mb-2">Position moyenne de la page</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={pageData.series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                    <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }} />
                    <YAxis reversed domain={invertedDomain(pageData.series, 'position')} allowDecimals={false}
                      tick={{ fontSize: 11, fill: 'rgb(var(--text-muted))' }} width={32} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={fmtDay} formatter={(v) => [fmtPos(v), 'Position']} />
                    <Line type="monotone" dataKey="position" stroke="rgb(var(--accent))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-surface border border-border rounded-xl p-4 overflow-x-auto">
                <div className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2"><FiFileText size={14} /> Mots-clés de cette page ({pageData.keywords.length})</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-text-muted text-xs text-left border-b border-border">
                      <th className="py-2 pr-2">Mot-clé</th>
                      <th className="py-2 px-2 text-right">Position</th>
                      <th className="py-2 px-2 text-right">Évolution</th>
                      <th className="py-2 px-2 text-right">Impr.</th>
                      <th className="py-2 px-2 text-right">Clics</th>
                      <th className="py-2 px-2 text-right">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.keywords.map((k) => (
                      <tr key={k.query} className="border-b border-border/50">
                        <td className="py-2 pr-2 text-text-primary">{k.query}</td>
                        <td className="py-2 px-2 text-right text-text-secondary">{fmtPos(k.position)}</td>
                        <td className="py-2 px-2 text-right"><Delta value={k.delta} /></td>
                        <td className="py-2 px-2 text-right text-text-secondary">{fmtNum(k.impressions)}</td>
                        <td className="py-2 px-2 text-right text-text-secondary">{fmtNum(k.clicks)}</td>
                        <td className="py-2 px-2 text-right text-text-secondary">{fmtPct(k.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* VUE 3 — YOAST vs RÉEL */}
      {sub === 'yoast' && (
        <div className="bg-surface border border-border rounded-xl p-4 overflow-x-auto">
          {yoast.length === 0 ? (
            <p className="text-text-muted text-sm py-6 text-center">
              Aucun focus keyword Yoast récupéré. Posez le snippet <code className="text-text-primary">register_rest_field</code> dans functions.php puis relancez un crawl.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted text-xs text-left border-b border-border">
                  <th className="py-2 pr-2">Article</th>
                  <th className="py-2 px-2">Mot-clé visé (Yoast)</th>
                  <th className="py-2 px-2 text-right">Position visée</th>
                  <th className="py-2 px-2">Requête réelle n°1</th>
                  <th className="py-2 px-2 text-right">Position réelle</th>
                </tr>
              </thead>
              <tbody>
                {yoast.map((p) => {
                  const mismatch = !p.focus_position || (p.top_query && p.top_query.toLowerCase() !== (p.focus_keyword || '').toLowerCase());
                  return (
                    <tr key={p.url} className={`border-b border-border/50 ${mismatch ? 'bg-warning-bg/30' : ''}`}>
                      <td className="py-2 pr-2 min-w-0">
                        <div className="text-text-primary truncate max-w-xs">{decodeHtml(p.title) || p.url}</div>
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-text-muted text-xs hover:text-accent truncate inline-flex items-center gap-1 max-w-xs">{p.url} <FiExternalLink size={10} /></a>
                      </td>
                      <td className="py-2 px-2 text-text-secondary">{p.focus_keyword}</td>
                      <td className="py-2 px-2 text-right text-text-secondary">{p.focus_position ? fmtPos(p.focus_position) : <span className="text-danger-text">non classé</span>}</td>
                      <td className="py-2 px-2 text-text-secondary">{p.top_query || '—'}</td>
                      <td className="py-2 px-2 text-right text-text-secondary">{fmtPos(p.top_position)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default PositionsTab;
