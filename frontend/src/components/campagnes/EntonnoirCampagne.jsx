// Entonnoir d'une campagne (lot 7) : de l'envoi au revenu signé, chaque taux avec sa définition.
import React, { useState } from 'react';
import { FiFilter, FiInfo, FiChevronDown, FiChevronUp } from 'react-icons/fi';

const euros = (n) => `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`;

export default function EntonnoirCampagne({ entonnoir }) {
  const [definitions, setDefinitions] = useState(false);
  if (!entonnoir) return null;
  if (entonnoir.test) return <p className="text-xs text-text-muted mb-3">Campagne en mode test : pas d'entonnoir.</p>;
  const e = entonnoir.etapes;
  const max = Math.max(1, ...e.map((x) => x.valeur));
  const m = entonnoir.montants || {};
  return (
    <div className="bg-surface border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h4 className="text-sm font-semibold text-text-primary flex items-center gap-2"><FiFilter size={14} /> Entonnoir de la campagne</h4>
        <button onClick={() => setDefinitions((v) => !v)} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1">
          <FiInfo size={12} /> {definitions ? 'Masquer' : 'Voir'} ce que compte chaque taux {definitions ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />}
        </button>
      </div>
      <ul className="space-y-1.5">
        {e.map((x) => (
          <li key={x.cle} title={x.definition}>
            <div className="flex items-center gap-3 text-sm">
              <span className="w-40 flex-shrink-0 text-text-secondary">{x.libelle}</span>
              <div className="flex-1 h-5 bg-surface-muted rounded overflow-hidden">
                <div className="h-full bg-accent/70" style={{ width: `${Math.max(x.valeur ? 2 : 0, Math.round((x.valeur / max) * 100))}%` }} />
              </div>
              <span className="w-12 text-right font-medium text-text-primary tabular-nums">{x.valeur}</span>
              <span className="w-32 text-right text-xs text-text-muted tabular-nums">{x.taux === null || x.taux === undefined ? '' : `${String(x.taux).replace('.', ',')} % ${x.base}`}</span>
            </div>
            {definitions && <p className="text-xs text-text-muted ml-0 sm:ml-[10.75rem] mt-0.5">{x.definition}</p>}
          </li>
        ))}
      </ul>
      <div className="mt-3 pt-3 border-t border-border text-sm flex gap-4 flex-wrap">
        <span className="text-success-text">Signé : {euros(m.ponctuel_signe)} ponctuel · {euros(m.mensuel_signe)}/mois</span>
        <span className="text-text-secondary">En jeu : {euros(m.ponctuel_en_jeu)} ponctuel · {euros(m.mensuel_en_jeu)}/mois</span>
      </div>
      {definitions && <p className="text-xs text-text-muted mt-1">{m.definition}</p>}
    </div>
  );
}
