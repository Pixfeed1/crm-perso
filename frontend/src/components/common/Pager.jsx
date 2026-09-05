// src/components/common/Pager.jsx
//
// Pagination cote client, reutilisable : un hook qui decoupe une liste deja chargee, et un
// composant de commandes. Les listes SEO (mots-cles, domaines referents, pages) peuvent
// depasser 500 lignes : les afficher d'un bloc oblige a faire defiler sans repere.
//
//   const pager = usePager(items, 25, resetKey);   // resetKey : revient page 1 quand il change
//   pager.slice.map(...)                          // les lignes de la page courante
//   <Pager pager={pager} />                       // « 1–25 sur 512 », precedent / suivant, taille
//
// Le composant ne rend rien quand tout tient sur une page. Charte : tokens de theme.
import React, { useEffect, useMemo, useState } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

export const PAGE_SIZES = [25, 50, 100];

export function usePager(items, defaultSize = 25, resetKey) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(defaultSize);
  const total = (items || []).length;
  const pages = Math.max(1, Math.ceil(total / size));
  // Nouveau jeu de donnees ou filtre change -> page 1 ; page hors bornes -> derniere page.
  useEffect(() => { setPage(1); }, [resetKey, total]);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const slice = useMemo(() => (items || []).slice((page - 1) * size, page * size), [items, page, size]);
  return { page, setPage, size, setSize: (n) => { setSize(n); setPage(1); }, slice, total, pages };
}

const Pager = ({ pager, className = '' }) => {
  const { page, setPage, size, setSize, total, pages } = pager;
  if (total <= PAGE_SIZES[0]) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-1 py-2 text-xs text-text-muted ${className}`}>
      <span>{from.toLocaleString('fr-FR')}–{to.toLocaleString('fr-FR')} sur {total.toLocaleString('fr-FR')}</span>
      <div className="flex items-center gap-1">
        <select value={size} onChange={(e) => setSize(parseInt(e.target.value, 10))}
          className="px-2 py-1 bg-surface-muted border border-border rounded-lg text-text-primary text-xs focus:outline-none focus:border-accent" title="Lignes par page">
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
        </select>
        <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
          className="p-1.5 rounded-lg hover:bg-surface-strong hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed" title="Page précédente"><FiChevronLeft size={14} /></button>
        <span className="text-text-primary font-medium tabular-nums">{page} / {pages}</span>
        <button onClick={() => setPage(Math.min(pages, page + 1))} disabled={page >= pages}
          className="p-1.5 rounded-lg hover:bg-surface-strong hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed" title="Page suivante"><FiChevronRight size={14} /></button>
      </div>
    </div>
  );
};

export default Pager;
