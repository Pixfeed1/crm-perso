// src/components/seo/SeoGraph.jsx
//
// Carte de flux du "jus interne" : nœuds dimensionnés par PageRank, arêtes = liens internes.
// Layout phyllotaxique déterministe (les plus forts au centre). Couleurs = tokens de thème
// via variables CSS (rgb(var(--…))), aucune couleur en dur. framer-motion sur l'apparition.
import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

const HEALTH_VAR = {
  orpheline: '--danger-text',
  affamee: '--warning-text',
  reservoir: '--info-text',
  saine: '--success-text'
};
const nodeColor = (health) => `rgb(var(${HEALTH_VAR[health] || '--neutral-text'}))`;

const W = 820;
const H = 520;
const CX = W / 2;
const CY = H / 2;

const SeoGraph = ({ data }) => {
  const { positions, nodes, edges } = useMemo(() => {
    // PostgreSQL sérialise les NUMERIC en chaîne -> on force Number() partout.
    const pr = (n) => Number(n.internal_pagerank) || 0;
    const ns = [...(data?.nodes || [])].sort((a, b) => pr(b) - pr(a));
    const maxPr = ns.reduce((m, n) => Math.max(m, pr(n)), 0) || 1;
    const pos = new Map();
    ns.forEach((n, i) => {
      const r = 20 * Math.sqrt(i);          // rayon croissant
      const a = i * 2.399963;               // angle d'or
      pos.set(n.url, {
        x: CX + r * Math.cos(a),
        y: CY + r * Math.sin(a),
        radius: 3 + 15 * Math.sqrt(pr(n) / maxPr),
        node: n
      });
    });
    return { positions: pos, nodes: ns, edges: data?.edges || [] };
  }, [data]);

  if (!nodes.length) {
    return (
      <div className="text-center py-10 text-text-muted text-sm">
        Aucun nœud à afficher (le worker SEO n'a pas encore tourné pour ce site).
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 520 }}>
        {/* Arêtes */}
        <g stroke="rgb(var(--border-strong))" strokeOpacity="0.35">
          {edges.map((e, i) => {
            const a = positions.get(e.from_url);
            const b = positions.get(e.to_url);
            if (!a || !b) return null;
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth="0.6" />;
          })}
        </g>
        {/* Nœuds */}
        <g>
          {nodes.map((n, i) => {
            const p = positions.get(n.url);
            if (!p) return null;
            return (
              <motion.circle
                key={n.url}
                cx={p.x} cy={p.y} r={p.radius}
                fill={nodeColor(n.health)} fillOpacity="0.85"
                stroke="rgb(var(--surface))" strokeWidth="0.8"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i * 0.008, 0.6), duration: 0.3 }}
              >
                <title>{`${n.title || n.url}\nPageRank: ${(Number(n.internal_pagerank) || 0).toFixed(4)} · liens entrants: ${n.inlinks_count ?? '—'} · ${n.health || 'non calculé'}`}</title>
              </motion.circle>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

export default SeoGraph;
