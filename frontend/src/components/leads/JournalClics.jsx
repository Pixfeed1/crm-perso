// Journal des clics d'une fiche (lot 6) : chaque lien cliqué dans vos emails, sa catégorie, et si le clic
// est humain ou probablement automatique (robot de messagerie qui vérifie les liens).
import React, { useEffect, useState } from 'react';
import { FiMousePointer } from 'react-icons/fi';
import { leadsAPI } from '../../services/api';

const fmt = (d) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function JournalClics({ leadId }) {
  const [clics, setClics] = useState([]);
  useEffect(() => { leadsAPI.getClics(leadId).then((r) => setClics(Array.isArray(r) ? r : [])).catch(() => setClics([])); }, [leadId]);
  if (!clics.length) return null;
  return (
    <div className="mt-3">
      <h4 className="text-sm font-medium text-text-primary mb-1.5 flex items-center gap-1.5"><FiMousePointer size={13} /> Journal des clics</h4>
      <ul className="space-y-1">
        {clics.map((c) => (
          <li key={c.id} className={`text-xs flex items-center gap-2 flex-wrap ${c.automatique ? 'text-text-muted' : 'text-text-secondary'}`}>
            <span className="tabular-nums">{fmt(c.clique_le)}</span>
            <span className={c.automatique ? 'line-through' : 'text-text-primary'}>{c.libelle}</span>
            {c.automatique
              ? <span className="px-1.5 py-0.5 rounded bg-neutral-bg text-neutral-text" title={c.raison || ''}>automatique : {c.raison}</span>
              : <span className="px-1.5 py-0.5 rounded bg-success-bg text-success-text">humain</span>}
            {c.subject && <span className="text-text-muted truncate">« {c.subject} »</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
