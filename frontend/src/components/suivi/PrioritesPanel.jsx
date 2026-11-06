// « À traiter en priorité » (lot 6) : prospects avec un signal d'intérêt réel sur les 30 derniers jours,
// classés par force (réponse, clic sur vos prestations, clics sur plusieurs jours, autre clic), avec la
// raison écrite en clair. Les clics automatiques (robots de messagerie) ne comptent pas. Un prospect
// sort de la liste dès qu'un échange réel est noté après son dernier signal.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiZap, FiPhone, FiExternalLink, FiCalendar } from 'react-icons/fi';
import { leadsAPI } from '../../services/api';
import { statusMeta } from '../../utils/relationStatus';

const FORCE = {
  1: { label: 'Réponse', cls: 'bg-success-bg text-success-text' },
  2: { label: 'Prestations', cls: 'bg-warning-bg text-warning-text' },
  3: { label: 'Plusieurs jours', cls: 'bg-info-bg text-info-text' },
  4: { label: 'Clic', cls: 'bg-neutral-bg text-neutral-text' }
};
const fmt = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');

export default function PrioritesPanel({ onCount, onLog }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const charger = useCallback(async () => {
    try { const r = await leadsAPI.getPriorites(); setData(r); if (onCount) onCount(r.items.length); } catch { setData({ items: [] }); }
  }, [onCount]);
  useEffect(() => { charger(); }, [charger]);

  if (!data) return <p className="text-sm text-text-muted">Chargement…</p>;
  if (!data.items.length) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 text-center text-sm text-text-muted">
        Personne à traiter en priorité : aucun prospect n'a répondu ni cliqué (clic humain) ces {data.jours || 30} derniers jours sans échange depuis.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">
        {data.items.length} prospect{data.items.length > 1 ? 's' : ''} avec un signal d'intérêt ces {data.jours} derniers jours, du plus fort au plus faible.
        Les clics automatiques des messageries ne comptent pas. Un prospect sort de la liste dès qu'un échange est noté après son dernier signal.
      </p>
      {data.items.map((x) => {
        const f = FORCE[x.force] || FORCE[4];
        const sm = statusMeta(x.relation_status);
        return (
          <div key={x.lead_id} className="bg-surface border border-border rounded-xl p-3 flex items-start gap-3">
            <FiZap className="text-warning-text mt-1 flex-shrink-0" size={16} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-text-primary">{x.nom || `Fiche #${x.lead_id}`}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${f.cls}`}>{f.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${sm.cls}`}>{sm.label}</span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {x.raisons.map((r, i) => <li key={i} className={`text-sm ${i === 0 ? 'text-text-primary' : 'text-text-secondary'}`}>{i === 0 ? '' : '· '}{r.charAt(0).toUpperCase() + r.slice(1)}</li>)}
              </ul>
              <div className="text-xs text-text-muted mt-1 flex gap-3 flex-wrap">
                {x.prochaine_relance && <span className="flex items-center gap-1"><FiCalendar size={11} /> relance prévue le {fmt(x.prochaine_relance)}</span>}
                {x.dernier_echange && <span>dernier échange le {fmt(x.dernier_echange)}</span>}
                {x.telephone && <span>{x.telephone}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {onLog && <button onClick={() => onLog({ contact_type: 'lead', contact_id: x.lead_id, contact_name: x.nom, contact_phone: x.telephone, relation_status: x.relation_status })} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Noter un appel ou un échange (le prospect sort de la liste)"><FiPhone size={15} /></button>}
              <button onClick={() => navigate(`/leads?lead=${x.lead_id}`)} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong" title="Ouvrir la fiche"><FiExternalLink size={15} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
