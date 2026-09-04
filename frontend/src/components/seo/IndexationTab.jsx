// src/components/seo/IndexationTab.jsx
//
// Onglet « Indexation » : ce que Google sait du site, rendu ACTIONNABLE.
// Regroupe les rapports jusqu'ici accessibles uniquement via le connecteur MCP :
// 404 vues par Google (avec la page qui contient le lien cassé), redirections vers
// l'accueil, canoniques divergentes, pages délaissées par Google, bascules d'indexation,
// écarts sitemap, doublons de focus keyword. Chaque ligne porte le lien d'édition
// WordPress de la page à corriger : on passe du constat à l'action en un clic.
// Charte : tokens de thème, react-icons, framer-motion, aucune couleur en dur.
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FiExternalLink, FiEdit3, FiChevronDown, FiChevronRight, FiAlertOctagon, FiAlertTriangle,
  FiInfo, FiCheckCircle, FiSearch, FiCornerDownRight, FiRefreshCw, FiMap
} from 'react-icons/fi';
import { seoAPI } from '../../services/api';
import { decodeHtml } from '../../utils/formatters';

const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('fr-FR'));
const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};
const shortUrl = (u) => {
  try { const x = new URL(u); return x.pathname + x.search || '/'; } catch { return u; }
};

const SEVERITY = {
  critical: { cls: 'bg-danger-bg text-danger-text', Icon: FiAlertOctagon, label: 'Critique' },
  warning: { cls: 'bg-warning-bg text-warning-text', Icon: FiAlertTriangle, label: 'Avertissement' },
  notice: { cls: 'bg-neutral-bg text-neutral-text', Icon: FiInfo, label: 'Notice' }
};
const verdictBadge = (v) => {
  if (v === 'PASS') return 'bg-success-bg text-success-text';
  if (v === 'FAIL') return 'bg-danger-bg text-danger-text';
  return 'bg-neutral-bg text-neutral-text';
};

// Lien public + lien d'édition WordPress (l'action). Sans wp_id (page hors WP), pas d'édition.
const PageLinks = ({ url, editUrl, title }) => (
  <span className="inline-flex items-center gap-2 min-w-0">
    <a href={url} target="_blank" rel="noopener noreferrer" title={url}
      className="text-text-secondary text-xs hover:text-accent inline-flex items-center gap-1 truncate max-w-xs sm:max-w-md">
      {title ? decodeHtml(title) : shortUrl(url)} <FiExternalLink size={10} className="flex-shrink-0" />
    </a>
    {editUrl && (
      <a href={editUrl} target="_blank" rel="noopener noreferrer" title="Corriger dans WordPress"
        className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent hover:bg-accent/20 inline-flex items-center gap-1 flex-shrink-0">
        <FiEdit3 size={10} /> Corriger
      </a>
    )}
  </span>
);

// Section dépliable, même gabarit que l'audit technique (gravité, libellé, compteur).
const Section = ({ id, severity, label, count, open, onToggle, children, hint }) => {
  const meta = SEVERITY[severity] || SEVERITY.notice;
  const Icon = meta.Icon;
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <button onClick={() => onToggle(open ? null : id)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-strong/40 transition-colors text-left">
        <span className="flex items-center gap-2 min-w-0">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 flex-shrink-0 ${count ? meta.cls : 'bg-success-bg text-success-text'}`}>
            {count ? <Icon size={12} /> : <FiCheckCircle size={12} />} {count ? meta.label : 'RAS'}
          </span>
          <span className="text-text-primary text-sm font-medium truncate">{label}</span>
          {hint && <span className="text-text-muted text-xs hidden md:inline truncate">— {hint}</span>}
        </span>
        <span className="flex items-center gap-2 flex-shrink-0">
          <span className="text-text-primary font-bold text-sm">{fmtNum(count)}</span>
          {open ? <FiChevronDown size={16} className="text-text-muted" /> : <FiChevronRight size={16} className="text-text-muted" />}
        </span>
      </button>
      {open && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-t border-border">
          {count ? children : <p className="px-4 py-3 text-xs text-text-muted">Rien à signaler.</p>}
        </motion.div>
      )}
    </div>
  );
};

const IndexationTab = ({ siteId, gscConnected }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState('404');
  const [staleDays, setStaleDays] = useState(90);
  const [changesDays, setChangesDays] = useState(30);
  const [checkUrl, setCheckUrl] = useState('');
  const [checkRes, setCheckRes] = useState(null);

  const load = useCallback(() => {
    if (!siteId) return;
    setLoading(true); setError(null);
    seoAPI.getIndexation(siteId, { stale_days: staleDays, changes_days: changesDays })
      .then(setData)
      .catch((e) => { setData(null); setError(e.message || 'Erreur'); })
      .finally(() => setLoading(false));
  }, [siteId, staleDays, changesDays]);
  useEffect(() => { load(); }, [load]);

  const runCheck = async () => {
    const u = checkUrl.trim();
    if (!u) return;
    try { setCheckRes(await seoAPI.checkSitemap(siteId, u)); } catch (e) { setCheckRes({ error: e.message }); }
  };

  if (loading && !data) return <p className="text-text-muted text-sm py-10 text-center">Chargement…</p>;
  if (error) return <p className="text-danger-text text-sm py-10 text-center">{error}</p>;
  if (!data) return null;

  const s = data.summary || {};
  const g404 = data.google_404s || { pages: [] };
  const red = data.redirects || { redirections: [] };
  const redHome = red.redirections.filter((r) => r.to_home);
  const redChains = red.redirections.filter((r) => !r.to_home && (r.hops || 0) > 1);
  const redLinked = red.redirections.filter((r) => !r.to_home && (r.hops || 0) <= 1 && r.linked_from_count > 0);
  const canon = data.canonical || { pages: [] };
  const stale = data.stale || { pages: [] };
  const changes = data.changes || { changements: [] };
  const sitemap = data.sitemap || { absentes: [], fantomes: [] };
  const focus = data.focus_conflicts || { details: [] };
  const neverInspected = s.inspectees === 0 || s.inspectees == null;

  const cards = [
    { label: 'Inspectées', value: fmtNum(s.inspectees) },
    { label: 'Indexées', value: fmtNum(s.indexees), cls: 'text-success-text' },
    { label: 'En échec', value: fmtNum(s.en_echec), cls: s.en_echec ? 'text-danger-text' : '' },
    { label: 'Neutres', value: fmtNum(s.neutres), cls: 'text-warning-text' },
    { label: 'Jamais inspectées', value: fmtNum(s.jamais_inspectees) },
    { label: 'Dernière inspection', value: fmtDate(s.plus_recente) }
  ];

  const RedirectRow = ({ r }) => (
    <li className="px-4 py-2 space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <a href={r.from_url} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-accent break-all">{shortUrl(r.from_url)}</a>
        <FiCornerDownRight size={12} className="text-text-muted" />
        <span className="text-text-secondary break-all">{r.final_url ? shortUrl(r.final_url) : '—'}</span>
        <span className="px-1.5 py-0.5 rounded bg-neutral-bg text-neutral-text">{r.final_status || '?'}{r.hops > 1 ? ` · ${r.hops} sauts` : ''}</span>
        {r.to_home && <span className="px-1.5 py-0.5 rounded bg-danger-bg text-danger-text">vers l'accueil (soft 404)</span>}
      </div>
      {r.linked_from_count > 0 && (
        <div className="pl-4 text-xs text-text-muted">
          {r.linked_from_count} lien{r.linked_from_count > 1 ? 's' : ''} interne{r.linked_from_count > 1 ? 's' : ''} pointe{r.linked_from_count > 1 ? 'nt' : ''} encore vers cette URL :
          <ul className="mt-1 space-y-0.5">
            {r.linked_from.map((p) => <li key={p.url}><PageLinks url={p.url} editUrl={p.edit_url} title={p.title} /></li>)}
            {r.linked_from_count > r.linked_from.length && <li>… et {r.linked_from_count - r.linked_from.length} autres</li>}
          </ul>
        </div>
      )}
    </li>
  );

  return (
    <div className="space-y-4">
      {/* Synthèse */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="bg-surface border border-border rounded-xl p-3">
            <div className="text-text-muted text-xs mb-1">{c.label}</div>
            <div className={`text-xl font-bold ${c.cls || 'text-text-primary'}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {neverInspected && (
        <div className="flex items-start gap-2 text-sm bg-warning-bg text-warning-text border border-warning-text/30 rounded-lg px-3 py-2">
          <FiInfo size={15} className="mt-0.5 flex-shrink-0" />
          <span>
            Aucune inspection Google enregistrée pour ce site.
            {gscConnected ? ' Lancez une synchronisation Search Console : l’inspection page par page se fait à la fin (2 000 URL/jour maximum, le reste au run suivant).' : ' Connectez Search Console (gsc_auth.py) puis lancez une synchronisation.'}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        <span>{data.summary && data.summary.note}</span>
        <button onClick={load} className="p-1.5 rounded-lg hover:bg-surface-strong hover:text-text-primary" title="Rafraîchir"><FiRefreshCw size={14} /></button>
      </div>

      {/* 404 vues par Google */}
      <Section id="404" severity="critical" open={open === '404'} onToggle={setOpen}
        label="404 vues par Google" count={g404.total}
        hint={g404.a_corriger_en_priorite ? `${g404.a_corriger_en_priorite} encore liée(s) depuis le site : le lien cassé est chez toi` : 'anciennes URL mémorisées par Google'}>
        <ul className="divide-y divide-border/50 max-h-[32rem] overflow-y-auto">
          {g404.pages.map((p) => (
            <li key={p.url} className="px-4 py-2 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-text-primary hover:text-accent break-all">{shortUrl(p.url)}</a>
                <span className="px-1.5 py-0.5 rounded bg-neutral-bg text-neutral-text">{p.coverage_state || p.page_fetch_state}</span>
                {p.encore_au_crawl && <span className="px-1.5 py-0.5 rounded bg-warning-bg text-warning-text" title="Notre crawl voit encore cette page : vérifier qu'elle répond bien">encore au crawl</span>}
                <span className="text-text-muted">vue {fmtDate(p.last_crawl_time || p.checked_at)}</span>
              </div>
              {p.referring && p.referring.length > 0 ? (
                <div className="pl-4 text-xs text-text-muted">
                  Lien cassé dans :
                  <ul className="mt-1 space-y-0.5">
                    {p.referring.map((r) => <li key={r.url}><PageLinks url={r.url} editUrl={r.edit_url} title={r.title} /></li>)}
                  </ul>
                </div>
              ) : (
                <div className="pl-4 text-xs text-text-muted">Aucune page du site ne la référence : Google la garde en mémoire, elle s’oubliera ou peut être redirigée (301) vers le contenu remplaçant.</div>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {/* Redirections */}
      <Section id="redhome" severity="critical" open={open === 'redhome'} onToggle={setOpen}
        label="Redirections vers l'accueil" count={redHome.length}
        hint="Google les traite comme des soft 404 : rediriger vers le contenu équivalent, ou laisser en 410">
        <ul className="divide-y divide-border/50 max-h-96 overflow-y-auto">{redHome.map((r) => <RedirectRow key={r.from_url} r={r} />)}</ul>
      </Section>
      <Section id="redchain" severity="warning" open={open === 'redchain'} onToggle={setOpen}
        label="Redirections en chaîne" count={redChains.length}
        hint="plusieurs sauts : viser la destination finale directement">
        <ul className="divide-y divide-border/50 max-h-96 overflow-y-auto">{redChains.map((r) => <RedirectRow key={r.from_url} r={r} />)}</ul>
      </Section>
      <Section id="redlinked" severity="notice" open={open === 'redlinked'} onToggle={setOpen}
        label="Liens internes vers des redirections" count={redLinked.length}
        hint="mettre à jour le lien pour éviter le saut">
        <ul className="divide-y divide-border/50 max-h-96 overflow-y-auto">{redLinked.map((r) => <RedirectRow key={r.from_url} r={r} />)}</ul>
      </Section>

      {/* Canoniques */}
      <Section id="canon" severity="warning" open={open === 'canon'} onToggle={setOpen}
        label="Canoniques divergentes" count={canon.total}
        hint="Google a choisi une autre URL que celle déclarée : contenu jugé dupliqué">
        <ul className="divide-y divide-border/50 max-h-96 overflow-y-auto">
          {canon.pages.map((p) => (
            <li key={p.url} className="px-4 py-2 text-xs space-y-0.5">
              <div className="flex flex-wrap items-center gap-2"><PageLinks url={p.url} editUrl={p.edit_url} /> <span className={`px-1.5 py-0.5 rounded ${verdictBadge(p.verdict)}`}>{p.verdict}</span></div>
              <div className="text-text-muted pl-4">déclarée : <span className="text-text-secondary break-all">{p.user_canonical}</span></div>
              <div className="text-text-muted pl-4">choisie par Google : <span className="text-text-secondary break-all">{p.google_canonical}</span></div>
            </li>
          ))}
        </ul>
      </Section>

      {/* Pages délaissées */}
      <Section id="stale" severity="warning" open={open === 'stale'} onToggle={setOpen}
        label={`Pages délaissées par Google (pas explorées depuis ${staleDays} j)`} count={stale.total}
        hint="Google s'en désintéresse : rafraîchir le contenu, renforcer le maillage">
        <div className="px-4 py-2 flex items-center gap-2 text-xs text-text-muted border-b border-border/50">
          Seuil :
          {[30, 60, 90, 180].map((d) => (
            <button key={d} onClick={() => setStaleDays(d)}
              className={`px-2 py-0.5 rounded ${staleDays === d ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>{d} j</button>
          ))}
        </div>
        <ul className="divide-y divide-border/50 max-h-96 overflow-y-auto">
          {stale.pages.map((p) => (
            <li key={p.url} className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <PageLinks url={p.url} editUrl={p.edit_url} title={p.title} />
              <span className="text-text-muted flex-shrink-0">
                {p.jours_sans_crawl} j sans crawl · <span className={`px-1.5 py-0.5 rounded ${verdictBadge(p.verdict)}`}>{p.verdict || '?'}</span>
                {p.value_score != null && <> · valeur {Math.round(p.value_score)}</>}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Bascules d'indexation */}
      <Section id="changes" severity={changes.indexations_perdues ? 'warning' : 'notice'} open={open === 'changes'} onToggle={setOpen}
        label={`Bascules d'indexation (${changesDays} j)`} count={(changes.changements || []).length}
        hint={`${changes.indexations_gagnees || 0} gagnée(s), ${changes.indexations_perdues || 0} perdue(s)`}>
        <div className="px-4 py-2 flex items-center gap-2 text-xs text-text-muted border-b border-border/50">
          Fenêtre :
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setChangesDays(d)}
              className={`px-2 py-0.5 rounded ${changesDays === d ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'}`}>{d} j</button>
          ))}
        </div>
        <ul className="divide-y divide-border/50 max-h-96 overflow-y-auto">
          {(changes.changements || []).map((c, i) => (
            <li key={`${c.url}-${i}`} className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <PageLinks url={c.url} editUrl={c.edit_url} title={c.title} />
              <span className="flex items-center gap-1 flex-shrink-0">
                <span className={`px-1.5 py-0.5 rounded ${verdictBadge(c.old_verdict)}`}>{c.old_verdict || '?'}</span>
                <FiCornerDownRight size={11} className="text-text-muted" />
                <span className={`px-1.5 py-0.5 rounded ${verdictBadge(c.new_verdict)}`}>{c.new_verdict || '?'}</span>
                <span className="text-text-muted ml-1">{fmtDate(c.changed_at)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Sitemap */}
      <Section id="smabs" severity="warning" open={open === 'smabs'} onToggle={setOpen}
        label="Publiées mais absentes du sitemap" count={sitemap.publiees_absentes_du_sitemap}
        hint={`${fmtNum(sitemap.urls_au_sitemap)} URL au sitemap · Google peut manquer ces pages`}>
        <ul className="divide-y divide-border/50 max-h-96 overflow-y-auto">
          {sitemap.absentes.map((p) => (
            <li key={p.url} className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <PageLinks url={p.url} editUrl={p.edit_url} title={p.title} />
              <span className="text-text-muted">{p.type}{p.value_score != null && ` · valeur ${Math.round(p.value_score)}`}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section id="smghost" severity="notice" open={open === 'smghost'} onToggle={setOpen}
        label="Au sitemap mais jamais vues au crawl" count={sitemap.au_sitemap_jamais_crawlees}
        hint="URL fantôme ou page inaccessible depuis le maillage">
        <ul className="divide-y divide-border/50 max-h-96 overflow-y-auto">
          {sitemap.fantomes.map((p) => (
            <li key={p.url} className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-text-secondary hover:text-accent break-all inline-flex items-center gap-1">{shortUrl(p.url)} <FiExternalLink size={10} /></a>
              <span className="text-text-muted">{p.sitemap_file ? shortUrl(p.sitemap_file) : ''}{p.lastmod ? ` · ${p.lastmod.slice(0, 10)}` : ''}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Focus keywords */}
      <Section id="focus" severity="warning" open={open === 'focus'} onToggle={setOpen}
        label="Doublons de focus keyword (Yoast)" count={focus.conflits}
        hint="deux contenus visent la même expression : choisir une cible, réorienter l'autre">
        <ul className="divide-y divide-border/50 max-h-96 overflow-y-auto">
          {focus.details.map((c) => (
            <li key={c.kw} className="px-4 py-2 text-xs">
              <div className="text-text-primary font-medium mb-1">« {c.kw} » <span className="text-text-muted font-normal">· {c.pages_count} pages</span></div>
              <ul className="pl-4 space-y-0.5">
                {(c.pages || []).map((p) => (
                  <li key={p.url} className="flex flex-wrap items-center gap-2">
                    <PageLinks url={p.url} editUrl={p.edit_url} title={p.title} />
                    <span className="text-text-muted">{p.type}{p.value_score != null && ` · valeur ${Math.round(p.value_score)}`}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Section>

      {/* Vérification sitemap ponctuelle */}
      <div className="bg-surface border border-border rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2 text-sm font-medium text-text-primary"><FiMap size={14} className="text-text-muted" /> Cette URL est-elle au sitemap ?</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="text" value={checkUrl} onChange={(e) => setCheckUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runCheck(); }}
            placeholder={`https://${data.site.domain}/ma-page/`}
            className="flex-1 min-w-0 px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-accent" />
          <button onClick={runCheck} disabled={!checkUrl.trim()}
            className="px-4 py-2 rounded-lg bg-surface-strong hover:bg-border-strong text-text-primary text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50">
            <FiSearch size={14} /> Vérifier
          </button>
        </div>
        {checkRes && (
          <p className="text-xs mt-2">
            {checkRes.error ? <span className="text-danger-text">{checkRes.error}</span>
              : checkRes.in_sitemap ? <span className="text-success-text">Présente au sitemap{checkRes.sitemap_file ? ` (${shortUrl(checkRes.sitemap_file)})` : ''}{checkRes.lastmod ? ` · lastmod ${checkRes.lastmod.slice(0, 10)}` : ''}</span>
                : <span className="text-warning-text">Absente du sitemap.{checkRes.note ? ` ${checkRes.note}` : ''}</span>}
          </p>
        )}
      </div>
    </div>
  );
};

export default IndexationTab;
