// src/components/common/InteractionTimeline.jsx
//
// Timeline reutilisable des echanges (emails, appels, sms, notes, rdv) d'un contact.
// Affiche le contenu integral de chaque interaction (champ notes), le statut applique,
// le resultat et la relance. Utilisee dans la fiche prospect (ContactFollowup) et dans
// la modale d'historique du cockpit Suivi. Tokens de theme, aucune couleur en dur.
import React from 'react';
import {
  FiPhone, FiMessageSquare, FiFileText, FiMail, FiCalendar, FiTrash2, FiClock, FiCheck
} from 'react-icons/fi';
import { statusMeta, reachedMeta } from '../../utils/relationStatus';

const TYPE_META = {
  email: { icon: FiMail, label: 'Email' },
  appel: { icon: FiPhone, label: 'Appel' },
  sms: { icon: FiMessageSquare, label: 'SMS' },
  note: { icon: FiFileText, label: 'Note' },
  rdv: { icon: FiCalendar, label: 'RDV' }
};

const formatDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const followupUrgency = (dateStr) => {
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (d < today) return { cls: 'bg-danger-bg text-danger-text', label: 'En retard' };
  if (d.getTime() === today.getTime()) return { cls: 'bg-warning-bg text-warning-text', label: "Aujourd'hui" };
  return { cls: 'bg-neutral-bg text-neutral-text', label: 'Planifiée' };
};

const InteractionTimeline = ({ items = [], onDelete }) => {
  if (!items.length) {
    return <p className="text-sm text-text-muted">Aucun échange enregistré.</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((it) => {
        const meta = TYPE_META[it.type] || TYPE_META.note;
        const Icon = meta.icon;
        const rm = reachedMeta(it.reached);
        const itStatus = it.relation_status ? statusMeta(it.relation_status) : null;
        const followupDue = it.next_followup_date && !it.followup_done;
        return (
          <div key={it.id} className="bg-surface-muted/40 border border-border/70 rounded-xl p-3 flex gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface-strong text-text-secondary flex items-center justify-center flex-shrink-0">
              <Icon size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-text-primary font-medium flex items-center gap-2">
                  {meta.label}
                  {rm && <span className="text-xs text-text-muted">· {rm.label}</span>}
                </span>
                <span className="text-xs text-text-muted">{formatDate(it.date)}</span>
              </div>
              {it.notes && <p className="text-sm text-text-secondary mt-1 whitespace-pre-wrap break-words">{it.notes}</p>}
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {itStatus && <span className={`text-xs px-2 py-0.5 rounded-full ${itStatus.cls}`}>{itStatus.label}</span>}
                {it.result && <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{it.result}</span>}
                {followupDue && (
                  <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${followupUrgency(it.next_followup_date).cls}`}>
                    <FiClock size={11} /> Relance le {formatDate(it.next_followup_date)}
                  </span>
                )}
                {it.next_followup_date && it.followup_done && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-success-bg text-success-text flex items-center gap-1">
                    <FiCheck size={11} /> Relance faite
                  </span>
                )}
              </div>
            </div>
            {onDelete && (
              <button onClick={() => onDelete(it.id)} className="text-text-muted hover:text-danger-text self-start" title="Supprimer">
                <FiTrash2 size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default InteractionTimeline;
