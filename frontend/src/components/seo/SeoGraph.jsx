// src/components/seo/SeoGraph.jsx
//
// Carte de flux du "jus interne" : nœuds dimensionnés par PageRank, arêtes = liens internes.
// Interactif type SEMrush/SEMjuice :
//  - molette = zoom (centré curseur), boutons +/-/recentrer ;
//  - glisser le fond = déplacer la vue (pan) ;
//  - glisser un nœud = le repositionner (les arêtes suivent) ;
//  - survol = tooltip, clic = panneau de détails (liens entrants/sortants).
// Couleurs = tokens de thème via variables CSS (rgb(var(--…))), aucune couleur en dur.
import React, { useMemo, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiExternalLink, FiArrowRight, FiArrowLeft, FiX, FiZoomIn, FiZoomOut, FiMaximize } from 'react-icons/fi';

const HEALTH_VAR = {
  orpheline: '--danger-text', affamee: '--warning-text', reservoir: '--info-text', saine: '--success-text'
};
const HEALTH_LABEL = { orpheline: 'Orpheline', affamee: 'Affamée', reservoir: 'Réservoir', saine: 'Saine' };
const nodeColor = (h) => `rgb(var(${HEALTH_VAR[h] || '--neutral-text'}))`;
const prNum = (n) => Number(n && n.internal_pagerank) || 0;
const shortLabel = (n) => {
  const t = n.title || n.url || '';
  return t.length > 26 ? t.slice(0, 25) + '…' : t;
};

const W = 820;
const H = 520;
const CX = W / 2;
const CY = H / 2;
const Z_MIN = 0.3;
const Z_MAX = 6;

const SeoGraph = ({ data }) => {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 }); // zoom + translation
  const [override, setOverride] = useState({});             // positions déplacées (url -> {x,y})
  const drag = useRef(null);                                // état de glisser en cours

  const { basePos, nodes, edges, byUrl, incoming, outgoing } = useMemo(() => {
    const ns = [...(data?.nodes || [])].sort((a, b) => prNum(b) - prNum(a));
    const maxPr = ns.reduce((m, n) => Math.max(m, prNum(n)), 0) || 1;
    const pos = new Map();
    const map = new Map();
    ns.forEach((n, i) => {
      const r = 20 * Math.sqrt(i);
      const a = i * 2.399963;
      pos.set(n.url, { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a), radius: 4 + 16 * Math.sqrt(prNum(n) / maxPr) });
      map.set(n.url, n);
    });
    const eds = data?.edges || [];
    const inc = new Map(); const out = new Map();
    eds.forEach((e) => {
      if (!inc.has(e.to_url)) inc.set(e.to_url, []);
      if (!out.has(e.from_url)) out.set(e.from_url, []);
      inc.get(e.to_url).push(e.from_url);
      out.get(e.from_url).push(e.to_url);
    });
    return { basePos: pos, nodes: ns, edges: eds, byUrl: map, incoming: inc, outgoing: out };
  }, [data]);

  // Position effective d'un nœud (override de drag prioritaire).
  const posOf = useCallback((url) => override[url] || basePos.get(url), [override, basePos]);

  // Conversion coordonnées écran -> coordonnées "graphe" (avant/après transform).
  const toViewBox = useCallback((clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width * W, y: (clientY - rect.top) / rect.height * H };
  }, []);
  const toGraph = useCallback((clientX, clientY) => {
    const v = toViewBox(clientX, clientY);
    return { x: (v.x - view.tx) / view.k, y: (v.y - view.ty) / view.k };
  }, [toViewBox, view]);

  if (!nodes.length) {
    return <div className="text-center py-10 text-text-muted text-sm">Aucun nœud à afficher (le worker SEO n'a pas encore tourné pour ce site).</div>;
  }

  const zoomAround = (vx, vy, factor) => {
    setView((cur) => {
      const k = Math.min(Z_MAX, Math.max(Z_MIN, cur.k * factor));
      // garder le point (vx,vy) fixe : vx = gx*k + tx
      const gx = (vx - cur.tx) / cur.k;
      const gy = (vy - cur.ty) / cur.k;
      return { k, tx: vx - gx * k, ty: vy - gy * k };
    });
  };

  const onWheel = (e) => {
    e.preventDefault();
    const v = toViewBox(e.clientX, e.clientY);
    zoomAround(v.x, v.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  };

  const onMouseDownNode = (e, n) => {
    e.stopPropagation();
    const g = toGraph(e.clientX, e.clientY);
    const p = posOf(n.url);
    drag.current = { type: 'node', url: n.url, dx: g.x - p.x, dy: g.y - p.y, moved: false };
  };
  const onMouseDownBg = (e) => {
    drag.current = { type: 'pan', startX: e.clientX, startY: e.clientY, tx0: view.tx, ty0: view.ty, moved: false };
  };
  const onMouseMove = (e) => {
    const d = drag.current;
    if (hover && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setHover((h) => h && { ...h, x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (!d) return;
    d.moved = true;
    if (d.type === 'node') {
      const g = toGraph(e.clientX, e.clientY);
      setOverride((o) => ({ ...o, [d.url]: { x: g.x - d.dx, y: g.y - d.dy, radius: posOf(d.url).radius } }));
    } else if (d.type === 'pan') {
      const rect = svgRef.current.getBoundingClientRect();
      const dxv = (e.clientX - d.startX) / rect.width * W;
      const dyv = (e.clientY - d.startY) / rect.height * H;
      setView((cur) => ({ ...cur, tx: d.tx0 + dxv, ty: d.ty0 + dyv }));
    }
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.type === 'node' && !d.moved) {
      setSelected((cur) => (cur === d.url ? null : d.url)); // clic simple = sélection
    }
  };

  const activeUrl = (hover && hover.node.url) || selected || null;
  const isEdgeActive = (e) => activeUrl && (e.from_url === activeUrl || e.to_url === activeUrl);
  const selNode = selected ? byUrl.get(selected) : null;
  const titleOf = (url) => (byUrl.get(url) && (byUrl.get(url).title || url)) || url;
  const btn = 'p-1.5 rounded-lg bg-surface-strong hover:bg-border-strong text-text-secondary';

  return (
    <div>
      <div className="relative w-full overflow-hidden" ref={wrapRef}
        onMouseMove={onMouseMove} onMouseUp={endDrag} onMouseLeave={() => { endDrag(); setHover(null); }}>
        {/* Contrôles zoom */}
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
          <button className={btn} title="Zoom +" onClick={() => zoomAround(CX, CY, 1.2)}><FiZoomIn size={15} /></button>
          <button className={btn} title="Zoom −" onClick={() => zoomAround(CX, CY, 1 / 1.2)}><FiZoomOut size={15} /></button>
          <button className={btn} title="Recentrer" onClick={() => { setView({ k: 1, tx: 0, ty: 0 }); setOverride({}); }}><FiMaximize size={15} /></button>
        </div>

        <svg
          ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full select-none"
          style={{ maxHeight: 540, cursor: drag.current && drag.current.type === 'pan' ? 'grabbing' : 'grab' }}
          onWheel={onWheel} onMouseDown={onMouseDownBg}
        >
          <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
            {/* Arêtes */}
            <g>
              {edges.map((e, i) => {
                const a = posOf(e.from_url); const b = posOf(e.to_url);
                if (!a || !b) return null;
                const active = isEdgeActive(e);
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={active ? 'rgb(var(--accent))' : 'rgb(var(--border-strong))'}
                  strokeOpacity={active ? 0.9 : 0.22} strokeWidth={(active ? 1.4 : 0.6) / view.k} />;
              })}
            </g>
            {/* Nœuds */}
            <g>
              {nodes.map((n, i) => {
                const p = posOf(n.url);
                if (!p) return null;
                const isSel = selected === n.url;
                return (
                  <motion.circle
                    key={n.url} cx={p.x} cy={p.y} r={p.radius}
                    fill={nodeColor(n.health)} fillOpacity={isSel ? 1 : 0.85}
                    stroke={isSel ? 'rgb(var(--accent))' : 'rgb(var(--surface))'} strokeWidth={(isSel ? 2 : 0.8) / view.k}
                    style={{ cursor: 'pointer' }}
                    initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: Math.min(i * 0.005, 0.4), duration: 0.25 }}
                    onMouseDown={(e) => onMouseDownNode(e, n)}
                    onMouseEnter={() => !drag.current && setHover({ node: n, x: 0, y: 0 })}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
            </g>
            {/* Labels sur les gros nœuds */}
            <g pointerEvents="none">
              {nodes.map((n) => {
                const p = posOf(n.url);
                if (!p || p.radius < 9) return null;
                return <text key={`l-${n.url}`} x={p.x} y={p.y - p.radius - 3} textAnchor="middle"
                  fontSize={9 / view.k} fill="rgb(var(--text-secondary))">{shortLabel(n)}</text>;
              })}
            </g>
          </g>
        </svg>

        {/* Tooltip */}
        {hover && !drag.current && (
          <div className="absolute z-10 pointer-events-none bg-surface-strong border border-border rounded-lg p-2 shadow-lg text-xs max-w-xs"
            style={{ left: Math.min(hover.x + 12, W - 40), top: hover.y + 12 }}>
            <div className="text-text-primary font-medium break-words">{hover.node.title || hover.node.url}</div>
            <div className="text-text-muted break-all mt-0.5">{hover.node.url}</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgb(var(--surface-muted))', color: nodeColor(hover.node.health) }}>{HEALTH_LABEL[hover.node.health] || 'Non calculé'}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-neutral-bg text-neutral-text">jus {prNum(hover.node).toFixed(4)}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{hover.node.inlinks_count ?? '—'} entrants</span>
              <span className="px-1.5 py-0.5 rounded-full bg-neutral-bg text-neutral-text">valeur {hover.node.value_score ?? '—'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-3 mt-2 text-xs text-text-muted">
        {Object.keys(HEALTH_LABEL).map((h) => (
          <span key={h} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: nodeColor(h) }} /> {HEALTH_LABEL[h]}</span>
        ))}
        <span>· molette = zoom · glisser le fond = déplacer · glisser un nœud = repositionner · clic = détails</span>
      </div>

      {/* Panneau de détails */}
      {selNode && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 bg-surface-muted/60 border border-border rounded-xl p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-text-primary font-medium break-words">{selNode.title || selNode.url}</div>
              <a href={selNode.url} target="_blank" rel="noopener noreferrer" className="text-text-muted text-xs hover:text-accent inline-flex items-center gap-1 break-all">{selNode.url} <FiExternalLink size={10} /></a>
            </div>
            <button onClick={() => setSelected(null)} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong flex-shrink-0"><FiX size={16} /></button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2 text-xs">
            <span className="px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgb(var(--surface))', color: nodeColor(selNode.health) }}>{HEALTH_LABEL[selNode.health] || 'Non calculé'}</span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">jus {prNum(selNode).toFixed(4)}</span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{selNode.inlinks_count ?? '—'} liens entrants</span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">valeur {selNode.value_score ?? '—'}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <div className="text-xs text-text-muted mb-1 flex items-center gap-1"><FiArrowLeft size={12} /> Pointent vers elle ({(incoming.get(selNode.url) || []).length})</div>
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {(incoming.get(selNode.url) || []).slice(0, 30).map((u) => <li key={`in-${u}`} className="text-xs text-text-secondary truncate">{titleOf(u)}</li>)}
                {(incoming.get(selNode.url) || []).length === 0 && <li className="text-xs text-text-muted">Aucun (parmi les nœuds affichés)</li>}
              </ul>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1 flex items-center gap-1"><FiArrowRight size={12} /> Elle pointe vers ({(outgoing.get(selNode.url) || []).length})</div>
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {(outgoing.get(selNode.url) || []).slice(0, 30).map((u) => <li key={`out-${u}`} className="text-xs text-text-secondary truncate">{titleOf(u)}</li>)}
                {(outgoing.get(selNode.url) || []).length === 0 && <li className="text-xs text-text-muted">Aucun (parmi les nœuds affichés)</li>}
              </ul>
            </div>
          </div>
          <p className="text-xs text-text-muted mt-2">Liens limités aux {nodes.length} pages affichées (top jus).</p>
        </motion.div>
      )}
    </div>
  );
};

export default SeoGraph;
