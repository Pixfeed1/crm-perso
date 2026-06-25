// src/components/seo/SeoGraph.jsx
//
// Carte de flux du "jus interne" : nœuds dimensionnés par PageRank, arêtes = liens internes.
// Interactif : survol -> tooltip, clic -> panneau de détails (infos + liens entrants/sortants).
// Labels sur les gros nœuds, arêtes surlignées au survol/sélection. Couleurs = tokens de thème
// via variables CSS (rgb(var(--…))), aucune couleur en dur. framer-motion sur l'apparition.
import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FiExternalLink, FiArrowRight, FiArrowLeft, FiX } from 'react-icons/fi';

const HEALTH_VAR = {
  orpheline: '--danger-text',
  affamee: '--warning-text',
  reservoir: '--info-text',
  saine: '--success-text'
};
const HEALTH_LABEL = {
  orpheline: 'Orpheline', affamee: 'Affamée', reservoir: 'Réservoir', saine: 'Saine'
};
const nodeColor = (health) => `rgb(var(${HEALTH_VAR[health] || '--neutral-text'}))`;
const prNum = (n) => Number(n && n.internal_pagerank) || 0;
const shortLabel = (n) => {
  const t = n.title || n.url || '';
  return t.length > 26 ? t.slice(0, 25) + '…' : t;
};

const W = 820;
const H = 520;
const CX = W / 2;
const CY = H / 2;

const SeoGraph = ({ data }) => {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null);     // { node, x, y } (x,y en px conteneur)
  const [selected, setSelected] = useState(null); // url du nœud sélectionné

  const { positions, nodes, edges, byUrl, incoming, outgoing } = useMemo(() => {
    const ns = [...(data?.nodes || [])].sort((a, b) => prNum(b) - prNum(a));
    const maxPr = ns.reduce((m, n) => Math.max(m, prNum(n)), 0) || 1;
    const pos = new Map();
    const map = new Map();
    ns.forEach((n, i) => {
      const r = 20 * Math.sqrt(i);
      const a = i * 2.399963;
      pos.set(n.url, {
        x: CX + r * Math.cos(a),
        y: CY + r * Math.sin(a),
        radius: 4 + 16 * Math.sqrt(prNum(n) / maxPr)
      });
      map.set(n.url, n);
    });
    const eds = data?.edges || [];
    const inc = new Map();
    const out = new Map();
    eds.forEach((e) => {
      if (!inc.has(e.to_url)) inc.set(e.to_url, []);
      if (!out.has(e.from_url)) out.set(e.from_url, []);
      inc.get(e.to_url).push(e.from_url);
      out.get(e.from_url).push(e.to_url);
    });
    return { positions: pos, nodes: ns, edges: eds, byUrl: map, incoming: inc, outgoing: out };
  }, [data]);

  if (!nodes.length) {
    return (
      <div className="text-center py-10 text-text-muted text-sm">
        Aucun nœud à afficher (le worker SEO n'a pas encore tourné pour ce site).
      </div>
    );
  }

  // Nœud "actif" (survol prioritaire, sinon sélection) -> surbrillance des arêtes.
  const activeUrl = (hover && hover.node.url) || selected || null;
  const isEdgeActive = (e) => activeUrl && (e.from_url === activeUrl || e.to_url === activeUrl);

  const moveTooltip = (e) => {
    if (!hover || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setHover((h) => h && { ...h, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const selNode = selected ? byUrl.get(selected) : null;
  const titleOf = (url) => (byUrl.get(url) && (byUrl.get(url).title || url)) || url;

  return (
    <div>
      <div className="relative w-full overflow-hidden" ref={wrapRef} onMouseMove={moveTooltip}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 540 }}>
          {/* Arêtes */}
          <g>
            {edges.map((e, i) => {
              const a = positions.get(e.from_url);
              const b = positions.get(e.to_url);
              if (!a || !b) return null;
              const active = isEdgeActive(e);
              return (
                <line
                  key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={active ? 'rgb(var(--accent))' : 'rgb(var(--border-strong))'}
                  strokeOpacity={active ? 0.9 : 0.25}
                  strokeWidth={active ? 1.4 : 0.6}
                />
              );
            })}
          </g>
          {/* Nœuds */}
          <g>
            {nodes.map((n, i) => {
              const p = positions.get(n.url);
              if (!p) return null;
              const isSel = selected === n.url;
              return (
                <motion.circle
                  key={n.url}
                  cx={p.x} cy={p.y} r={p.radius}
                  fill={nodeColor(n.health)} fillOpacity={isSel ? 1 : 0.85}
                  stroke={isSel ? 'rgb(var(--accent))' : 'rgb(var(--surface))'}
                  strokeWidth={isSel ? 2 : 0.8}
                  style={{ cursor: 'pointer' }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.006, 0.5), duration: 0.3 }}
                  onMouseEnter={() => setHover({ node: n, x: 0, y: 0 })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => setSelected((cur) => (cur === n.url ? null : n.url))}
                />
              );
            })}
          </g>
          {/* Labels sur les gros nœuds (lisibilité) */}
          <g pointerEvents="none">
            {nodes.map((n) => {
              const p = positions.get(n.url);
              if (!p || p.radius < 9) return null; // seuls les nœuds importants
              return (
                <text
                  key={`l-${n.url}`}
                  x={p.x} y={p.y - p.radius - 3}
                  textAnchor="middle"
                  fontSize="9"
                  fill="rgb(var(--text-secondary))"
                >
                  {shortLabel(n)}
                </text>
              );
            })}
          </g>
        </svg>

        {/* Tooltip HTML au survol */}
        {hover && (
          <div
            className="absolute z-10 pointer-events-none bg-surface-strong border border-border rounded-lg p-2 shadow-lg text-xs max-w-xs"
            style={{ left: Math.min(hover.x + 12, W - 40), top: hover.y + 12 }}
          >
            <div className="text-text-primary font-medium break-words">{hover.node.title || hover.node.url}</div>
            <div className="text-text-muted break-all mt-0.5">{hover.node.url}</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgb(var(--surface-muted))', color: nodeColor(hover.node.health) }}>
                {HEALTH_LABEL[hover.node.health] || 'Non calculé'}
              </span>
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
          <span key={h} className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: nodeColor(h) }} /> {HEALTH_LABEL[h]}
          </span>
        ))}
        <span className="text-text-muted">· taille = jus · clic = détails</span>
      </div>

      {/* Panneau de détails du nœud sélectionné */}
      {selNode && (
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="mt-3 bg-surface-muted/60 border border-border rounded-xl p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-text-primary font-medium break-words">{selNode.title || selNode.url}</div>
              <a href={selNode.url} target="_blank" rel="noopener noreferrer" className="text-text-muted text-xs hover:text-accent inline-flex items-center gap-1 break-all">
                {selNode.url} <FiExternalLink size={10} />
              </a>
            </div>
            <button onClick={() => setSelected(null)} className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong flex-shrink-0"><FiX size={16} /></button>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2 text-xs">
            <span className="px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: 'rgb(var(--surface))', color: nodeColor(selNode.health) }}>
              {HEALTH_LABEL[selNode.health] || 'Non calculé'}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">jus {prNum(selNode).toFixed(4)}</span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{selNode.inlinks_count ?? '—'} liens entrants</span>
            <span className="px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">valeur {selNode.value_score ?? '—'}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <div className="text-xs text-text-muted mb-1 flex items-center gap-1"><FiArrowLeft size={12} /> Pointent vers elle ({(incoming.get(selNode.url) || []).length})</div>
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {(incoming.get(selNode.url) || []).slice(0, 30).map((u) => (
                  <li key={`in-${u}`} className="text-xs text-text-secondary truncate">{titleOf(u)}</li>
                ))}
                {(incoming.get(selNode.url) || []).length === 0 && <li className="text-xs text-text-muted">Aucun (parmi les nœuds affichés)</li>}
              </ul>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1 flex items-center gap-1"><FiArrowRight size={12} /> Elle pointe vers ({(outgoing.get(selNode.url) || []).length})</div>
              <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                {(outgoing.get(selNode.url) || []).slice(0, 30).map((u) => (
                  <li key={`out-${u}`} className="text-xs text-text-secondary truncate">{titleOf(u)}</li>
                ))}
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
