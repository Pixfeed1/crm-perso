// src/components/seo/PositionsTab.jsx
//
// Suivi de positions (rank tracker) — 100% Google Search Console (seo_gsc_daily).
// 3 sous-vues : par mot-clé (watchlist), par article, Yoast vs réel.
// Position = SUM(impr*pos)/SUM(impr) (même formule que le cache Opportunités). Fenêtre 28j
// par défaut (= cache) ; sélecteur 7/28/90j. Courbes recharts, axe Y inversé (position 1 en haut).
// Charte : tokens de thème, react-icons, framer-motion, aucune couleur en dur.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FiSearch, FiStar, FiTrendingUp, FiTrendingDown, FiMinus, FiExternalLink, FiFileText, FiTarget, FiAlertCircle
} from 'react-icons/fi';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { seoAPI } from '../../services/api';
import { decodeHtml } from '../../utils/formatters';
import { useToast } from '../../hooks/useToast';
import Pager, { usePager } from '../common/Pager';

const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
const fmtPos = (n) => (n == null ? '—' : Number(n).toFixed(1));
const fmtPct = (n) => (n == null ? '—' : `${(Number(n) * 100).toFixed(1)} %`);
const fmtDay = (s) => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); };
const fmtSd = (n) => (n == null ? '—' : Number(n).toFixed(1));

// Types de recherche Search Analytics : une requete ne porte que sur UN type. Par defaut
// on n'affiche que la recherche web ; images et Discover sont des filtres explicites.
const SEARCH_TYPES = [{ k: 'web', l: 'Web' }, { k: 'image', l: 'Images' }, { k: 'discover', l: 'Discover' }];
const TYPE_LABEL = { web: 'Web', image: 'Images', video: 'Vidéo', news: 'Actualités', discover: 'Discover' };
const DEVICE_FR = { MOBILE: 'Mobile', DESKTOP: 'Ordinateur', TABLET: 'Tablette' };
const COUNTRY_FR3 = { fra: 'France', usa: 'États-Unis', bel: 'Belgique', che: 'Suisse', can: 'Canada', deu: 'Allemagne', gbr: 'Royaume-Uni', esp: 'Espagne', ita: 'Italie', mar: 'Maroc', dza: 'Algérie', tun: 'Tunisie', col: 'Colombie', ind: 'Inde' };
const APPEARANCE_FR = {
  AMP_BLUE_LINK: 'AMP (lien bleu)', AMP_TOP_STORIES: 'AMP À la une', AMP_IMAGE_RESULT: 'AMP image', RICHCARD: 'Résultat enrichi', RICH_SNIPPET: 'Extrait enrichi',
  VIDEO: 'Vidéo', PAGE_EXPERIENCE: 'Expérience sur la page', REVIEW_SNIPPET: 'Avis', PRODUCT_SNIPPETS: 'Produit', MERCHANT_LISTINGS: 'Fiche marchand',
  ORGANIC_SHOPPING: 'Shopping', TPF_FAQ: 'FAQ', TPF_HOWTO: 'Tutoriel', TPF_QA: 'Questions/réponses', WEBLITE: 'Version allégée', SEARCH_APPEARANCE_ANDROID_APP: 'Appli Android',
  TRANSLATED_RESULT: 'Résultat traduit', EVENT: 'Événement', JOB_DETAILS: 'Offre d’emploi', JOB_LISTING: 'Liste d’emplois', RECIPE_FEATURE: 'Recette', RECIPE_RICH_SNIPPET: 'Recette enrichie',
  SPECIAL_ANNOUNCEMENT: 'Annonce spéciale', SUBSCRIBED_CONTENT: 'Contenu abonnés', PRACTICE_PROBLEMS: 'Exercices', MATH_SOLVERS: 'Maths', LEARNING_VIDEOS: 'Vidéos éducatives',
  DATASET: 'Jeu de données', EDU_Q_AND_A: 'Q/R éducatives', BOOK_ACTIONS: 'Livre', ORGANIC_IMAGE: 'Image organique', VIDEO_RICH_SNIPPET: 'Vidéo enrichie'
};
const NONREP_TIP = 'Position non représentative : écart-type nul et moins de 100 impressions sur la période. Rang mesuré dans un bloc (carrousel, grille d’images, encart), pas dans la page de résultats.';

// Position affichee avec son contexte : grisee + marqueur quand non representative.
const Pos = ({ k }) => {
  if (k.position == null) return <span className="text-text-muted">—</span>;
  if (k.representative === false) {
    return (
      <span className="inline-flex items-center gap-1 text-text-muted" title={NONREP_TIP}>
        <FiAlertCircle size={11} className="text-warning-text" />{fmtPos(k.position)}
      </span>
    );
  }
  return <span className="text-text-secondary">{fmtPos(k.position)}</span>;
};

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
  const [type, setType] = useState('web'); // type de recherche affiche
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
  // Pagination cote client : jusqu'a 500 lignes par vue, illisibles d'un bloc.
  const kwPager = usePager(sortedKeywords, 25, `${type}|${days}|${search}|${trackedOnly}`);
  const pagesPager = usePager(pages, 25, `${type}|${days}`);
  const pkwPager = usePager((pageData && pageData.keywords) || [], 25, selPage);
  const yoastPager = usePager(yoast, 25, days);

  // Synthèse + watchlist : toujours chargées (cartes en tête).
  useEffect(() => {
    if (!siteId) return;
    seoAPI.getPositionsSummary(siteId, days, type).then(setSummary).catch(() => setSummary(null));
    seoAPI.getTrackedKeywords(siteId).then((t) => setTracked(t || [])).catch(() => {});
  }, [siteId, days, type]);

  // Liste de mots-clés (vue 1).
  const loadKeywords = useCallback(() => {
    if (!siteId) return;
    setLoading(true);
    seoAPI.getPositionsKeywords(siteId, { days, search, tracked: trackedOnly ? 1 : 0, type })
      .then((k) => setKeywords(k || []))
      .catch(() => setKeywords([]))
      .finally(() => setLoading(false));
  }, [siteId, days, search, trackedOnly, type]);
  useEffect(() => { if (sub === 'keywords') loadKeywords(); }, [sub, loadKeywords]);

  // Pages (vue 2) + Yoast (vue 3).
  useEffect(() => {
    if (!siteId) return;
    if (sub === 'page') seoAPI.getPositionsPages(siteId, days, type).then((p) => setPages(p || [])).catch(() => {});
    if (sub === 'yoast') seoAPI.getPositionsYoast(siteId, days).then((y) => setYoast(y || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, siteId, days, type]);

  const openKeyword = (kw) => {
    setSelKeyword(kw);
    setKwSeries([]);
    seoAPI.getPositionKeywordSeries(siteId, kw, days, type).then((s) => setKwSeries(s || [])).catch(() => {});
  };

  const openPage = (url) => {
    setSelPage(url);
    setPageData(null);
    if (url) seoAPI.getPositionsPage(siteId, url, days, type).then(setPageData).catch(() => setPageData(null));
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
    { label: 'CTR moyen', value: fmtPct(summary.ctr) },
    { label: 'Non représentatives', value: fmtNum(summary.non_representative), cls: summary.non_representative ? 'text-warning-text' : '', tip: NONREP_TIP }
  ] : [];

  return (
    <div className="space-y-4">
      {/* Cartes de synthèse + sélecteur de période */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2"><FiTarget size={15} /> Suivi de positions</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-text-muted text-xs">Type</span>
          {SEARCH_TYPES.map((t) => (
            <button key={t.k} onClick={() => { setType(t.k); setSelKeyword(null); setPageData(null); setSelPage(''); }}
              className={`px-2.5 py-1 rounded-lg text-xs ${type === t.k ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>{t.l}</button>
          ))}
          <span className="text-text-muted text-xs ml-2">Période</span>
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="px-2 py-1 bg-surface-muted border border-border rounded-lg text-text-primary text-xs focus:outline-none focus:border-accent">
            {[7, 28, 90].map((d) => <option key={d} value={d}>{d} jours</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="bg-surface border border-border rounded-xl p-3" title={c.tip || ''}>
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
                        <Th f="pos_stddev" label="σ" right />
                        <Th f="days_impr" label="Jours" right />
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
                  {kwPager.slice.map((k) => (
                    <tr key={k.query} className="border-b border-border/50 hover:bg-surface-strong/30">
                      <td className="py-2 pr-2">
                        <button onClick={() => toggleTrack(k.query)} title={trackedSet.has(k.query) ? 'Retirer du suivi' : 'Suivre'}
                          className={trackedSet.has(k.query) ? 'text-warning-text' : 'text-text-muted hover:text-text-primary'}>
                          <FiStar size={14} fill={trackedSet.has(k.query) ? 'currentColor' : 'none'} />
                        </button>
                      </td>
                      <td className="py-2 pr-2">
                        <button onClick={() => openKeyword(k.query)} className={`text-left hover:text-accent ${k.representative === false ? 'text-text-muted' : 'text-text-primary'}`}>{k.query}</button>
                        {k.types && k.types.length > 1 && (
                          <span className="ml-1 text-[10px] text-text-muted" title="Ce mot-clé a aussi des impressions dans d’autres types de recherche">{k.types.filter((t) => t !== type).map((t) => TYPE_LABEL[t] || t).join(', ')}</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right"><Pos k={k} /></td>
                      <td className="py-2 px-2 text-right text-text-muted text-xs" title={k.pos_min != null ? `min ${fmtPos(k.pos_min)} · max ${fmtPos(k.pos_max)}` : ''}>{fmtSd(k.pos_stddev)}</td>
                      <td className="py-2 px-2 text-right text-text-muted text-xs">{k.days_impr ?? '—'}</td>
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
            {!loading && <Pager pager={kwPager} />}
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
            ) : pagesPager.slice.map((p) => (
              <button key={p.page_url} onClick={() => openPage(p.page_url)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${selPage === p.page_url ? 'bg-accent/10' : 'hover:bg-surface-strong/40'}`}>
                <div className="min-w-0">
                  <div className="text-sm text-text-primary truncate">{decodeHtml(p.title) || p.page_url}</div>
                  <div className="text-text-muted text-xs truncate">{p.page_url}</div>
                </div>
                <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
                  <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent font-medium">{p.keywords} mots-clés</span>
                  <span className={`px-2 py-0.5 rounded-full ${p.representative === false ? 'bg-warning-bg text-warning-text' : 'bg-info-bg text-info-text'}`} title={p.representative === false ? NONREP_TIP : `écart-type ${fmtSd(p.pos_stddev)} sur ${p.days_impr} jours`}>pos. {fmtPos(p.position)}{p.representative === false ? ' ?' : ''}</span>
                  <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text hidden sm:inline">{fmtNum(p.impressions)} impr.</span>
                </div>
              </button>
            ))}
          </div>
          <Pager pager={pagesPager} />

          {pageData && (
            <>
              {/* Contexte : d'où viennent les impressions ? Type de recherche, pays, appareil, apparence. */}
              <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
                <div className="text-sm font-semibold text-text-primary">D’où viennent ces positions ?</div>
                <div className="flex flex-wrap gap-4 text-xs">
                  <div>
                    <div className="text-text-muted mb-1">Type de recherche</div>
                    <div className="flex flex-wrap gap-1">
                      {(pageData.search_types || []).map((t) => (
                        <span key={t.search_type} className={`px-2 py-0.5 rounded-full ${t.search_type === type ? 'bg-accent/15 text-accent' : 'bg-neutral-bg text-neutral-text'}`}>
                          {TYPE_LABEL[t.search_type] || t.search_type} · {fmtNum(t.impressions)} impr. · pos. {fmtPos(t.position)}
                        </span>
                      ))}
                      {!(pageData.search_types || []).length && <span className="text-text-muted">—</span>}
                    </div>
                  </div>
                  {[['device', 'Appareil', (v) => DEVICE_FR[v] || v], ['country', 'Pays', (v) => COUNTRY_FR3[v] || v.toUpperCase()], ['appearance', 'Apparence', (v) => APPEARANCE_FR[v] || v]].map(([dim, label, fmt]) => (
                    <div key={dim}>
                      <div className="text-text-muted mb-1">{label}</div>
                      <div className="flex flex-wrap gap-1">
                        {((pageData.breakdown || {})[dim] || []).slice(0, 6).map((b) => (
                          <span key={b.value} className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text" title={`${fmtNum(b.clicks)} clics`}>
                            {fmt(b.value)} · {fmtNum(b.impressions)} impr. · pos. {fmtPos(b.position)}
                          </span>
                        ))}
                        {!((pageData.breakdown || {})[dim] || []).length && <span className="text-text-muted">pas encore ventilé (prochaine synchro)</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

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
                      <th className="py-2 px-2 text-right" title="Écart-type de la position sur la période">σ</th>
                      <th className="py-2 px-2 text-right" title="Jours avec impressions">Jours</th>
                      <th className="py-2 px-2 text-right">Évolution</th>
                      <th className="py-2 px-2 text-right">Impr.</th>
                      <th className="py-2 px-2 text-right">Clics</th>
                      <th className="py-2 px-2 text-right">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pkwPager.slice.map((k) => (
                      <tr key={k.query} className="border-b border-border/50">
                        <td className={`py-2 pr-2 ${k.representative === false ? 'text-text-muted' : 'text-text-primary'}`}>{k.query}</td>
                        <td className="py-2 px-2 text-right"><Pos k={k} /></td>
                        <td className="py-2 px-2 text-right text-text-muted text-xs" title={k.pos_min != null ? `min ${fmtPos(k.pos_min)} · max ${fmtPos(k.pos_max)}` : ''}>{fmtSd(k.pos_stddev)}</td>
                        <td className="py-2 px-2 text-right text-text-muted text-xs">{k.days_impr ?? '—'}</td>
                        <td className="py-2 px-2 text-right"><Delta value={k.delta} /></td>
                        <td className="py-2 px-2 text-right text-text-secondary">{fmtNum(k.impressions)}</td>
                        <td className="py-2 px-2 text-right text-text-secondary">{fmtNum(k.clicks)}</td>
                        <td className="py-2 px-2 text-right text-text-secondary">{fmtPct(k.ctr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pager pager={pkwPager} />
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
                {yoastPager.slice.map((p) => {
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
          <Pager pager={yoastPager} />
        </div>
      )}
    </div>
  );
};

export default PositionsTab;
