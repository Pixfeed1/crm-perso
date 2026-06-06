// src/components/common/ContactFollowup.jsx
//
// Bloc "Suivi" COMPACT (fiche client ET lead) : statut de relation + dernier contact
// (joint ? + date) + prochaine relance + historique depliable. Tokens de theme.
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPhone, FiMessageSquare, FiFileText, FiMail, FiCalendar,
  FiTrash2, FiClock, FiCheck, FiChevronDown, FiChevronUp, FiBell
} from 'react-icons/fi';
import { interactionsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import LogExchangeModal from './LogExchangeModal';
import { statusMeta, reachedMeta } from '../../utils/relationStatus';

const TYPE_META = {
  email: { icon: FiMail, label: 'Email' },
  appel: { icon: FiPhone, label: 'Appel' },
  sms: { icon: FiMessageSquare, label: 'SMS' },
  note: { icon: FiFileText, label: 'Note' },
  rdv: { icon: FiCalendar, label: 'RDV' }
};

const formatDM = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
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

// Libelle "dernier contact" selon le moyen + joint ?
const lastContactLabel = (it) => {
  if (!it) return null;
  const rm = reachedMeta(it.reached);
  if (rm) return `${rm.verb} le ${formatDM(it.date)}`;
  return `${(TYPE_META[it.type] || TYPE_META.note).label} le ${formatDM(it.date)}`;
};

const ContactFollowup = ({ contactType, contactId, phone, onEmail }) => {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [relationStatus, setRelationStatus] = useState('nouveau');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [logType, setLogType] = useState(null); // type par defaut a l'ouverture de la modale

  const load = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    try {
      const data = await interactionsAPI.getByContact(contactType, contactId);
      // Nouvelle forme { relation_status, items } (avec repli si ancien format tableau)
      if (Array.isArray(data)) {
        setItems(data);
      } else {
        setItems(data.items || []);
        setRelationStatus(data.relation_status || 'nouveau');
      }
    } catch (error) {
      console.error('Erreur chargement suivi:', error);
    } finally {
      setLoading(false);
    }
  }, [contactType, contactId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    try {
      await interactionsAPI.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (error) {
      toast.error('Erreur lors de la suppression');
    }
  };

  const markDone = async (id) => {
    try {
      await interactionsAPI.markFollowupDone(id, true);
      load();
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const lastExchange = items[0] || null;
  const nextFollowup = items
    .filter((i) => i.next_followup_date && !i.followup_done)
    .sort((a, b) => new Date(a.next_followup_date) - new Date(b.next_followup_date))[0] || null;

  const sMeta = statusMeta(relationStatus);
  const btn = 'px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 transition-colors bg-surface-strong hover:bg-border-strong text-text-primary';

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <FiClock /> Suivi
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sMeta.cls}`}>{sMeta.label}</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setLogType('appel')} className={btn}><FiPhone size={14} /> J'ai appelé</button>
          <button onClick={() => setLogType('sms')} className={btn}><FiMessageSquare size={14} /> SMS</button>
          <button onClick={() => setLogType('note')} className={btn}><FiFileText size={14} /> Note</button>
          {onEmail && (
            <button onClick={onEmail} className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 bg-accent hover:bg-accent-hover text-white transition-colors">
              <FiMail size={14} /> Email
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-text-muted text-sm">Chargement...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-surface-muted/50 border border-border rounded-xl p-3">
              <div className="text-xs text-text-muted mb-1">Dernier contact</div>
              {lastExchange ? (
                <div className="flex items-center gap-2 flex-wrap">
                  {(() => { const I = (TYPE_META[lastExchange.type] || TYPE_META.note).icon; return <I size={14} className="text-text-muted" />; })()}
                  <span className="text-sm text-text-primary">{lastContactLabel(lastExchange)}</span>
                  {lastExchange.result && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{lastExchange.result}</span>
                  )}
                </div>
              ) : (
                <div className="text-sm text-text-muted">Aucun échange</div>
              )}
            </div>

            <div className="bg-surface-muted/50 border border-border rounded-xl p-3">
              <div className="text-xs text-text-muted mb-1 flex items-center gap-1"><FiBell size={12} /> Prochaine relance</div>
              {nextFollowup ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${followupUrgency(nextFollowup.next_followup_date).cls}`}>
                    {followupUrgency(nextFollowup.next_followup_date).label}
                  </span>
                  <span className="text-sm text-text-primary">{formatDate(nextFollowup.next_followup_date)}</span>
                  <button onClick={() => markDone(nextFollowup.id)} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1" title="Marquer comme faite">
                    <FiCheck size={12} /> faite
                  </button>
                </div>
              ) : (
                <div className="text-sm text-text-muted">Aucune relance</div>
              )}
            </div>
          </div>

          {items.length > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 text-sm text-accent hover:underline flex items-center gap-1"
            >
              {expanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
              {expanded ? 'Masquer l\'historique' : `Voir tout l'historique (${items.length})`}
            </button>
          )}

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 mt-3">
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
                          {it.notes && <p className="text-sm text-text-secondary mt-1 whitespace-pre-wrap">{it.notes}</p>}
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
                        <button onClick={() => handleDelete(it.id)} className="text-text-muted hover:text-danger-text self-start" title="Supprimer">
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <LogExchangeModal
        isOpen={!!logType}
        onClose={() => setLogType(null)}
        onSaved={load}
        contactType={contactType}
        contactId={contactId}
        phone={phone}
        defaultType={logType || 'appel'}
        currentStatus={relationStatus}
      />
    </div>
  );
};

export default ContactFollowup;
