// src/components/common/ContactFollowup.jsx
//
// Bloc "Suivi" COMPACT (fiche client ET lead) : prochaine relance mise en avant +
// dernier echange + actions (Appel / SMS / Note / Email) + historique depliable.
// Pilote par les tokens de theme (classique ET clair). L'email est auto-logge cote serveur.
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPhone, FiMessageSquare, FiFileText, FiCalendar, FiMail,
  FiPlus, FiTrash2, FiX, FiClock, FiCheck, FiChevronDown, FiChevronUp, FiBell
} from 'react-icons/fi';
import { interactionsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const TYPE_META = {
  email: { icon: FiMail, label: 'Email' },
  appel: { icon: FiPhone, label: 'Appel' },
  sms: { icon: FiMessageSquare, label: 'SMS' },
  note: { icon: FiFileText, label: 'Note' },
  rdv: { icon: FiCalendar, label: 'RDV' }
};

const SEGMENTS = [
  { key: 'appel', label: 'Appel', icon: FiPhone },
  { key: 'sms', label: 'SMS', icon: FiMessageSquare },
  { key: 'note', label: 'Note', icon: FiFileText }
];

const RESULT_PRESETS = ['Pas de réponse', 'À rappeler', 'Intéressé', 'Devis à envoyer', 'Refus', 'OK'];

const todayLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const formatDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

// Date relative courte ("aujourd'hui", "hier", "il y a 3 j", "le 12 mars")
const relativeDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const now = new Date();
  const days = Math.round((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days > 1 && days < 7) return `il y a ${days} j`;
  if (days < 0) return formatDate(s);
  return formatDate(s);
};

// Urgence de la prochaine relance -> classes semantiques (clair ET classique).
const followupUrgency = (dateStr) => {
  const d = new Date(dateStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  if (day < today) return { cls: 'bg-danger-bg text-danger-text', label: 'En retard' };
  if (day.getTime() === today.getTime()) return { cls: 'bg-warning-bg text-warning-text', label: "Aujourd'hui" };
  return { cls: 'bg-neutral-bg text-neutral-text', label: 'Planifiée' };
};

const ContactFollowup = ({ contactType, contactId, phone, onEmail }) => {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: todayLocal(), notes: '', result: '', next_followup_date: '' });

  const load = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    try {
      const data = await interactionsAPI.getByContact(contactType, contactId);
      setItems(data || []);
    } catch (error) {
      console.error('Erreur chargement suivi:', error);
    } finally {
      setLoading(false);
    }
  }, [contactType, contactId]);

  useEffect(() => { load(); }, [load]);

  const openModal = (type) => {
    setForm({ date: todayLocal(), notes: '', result: '', next_followup_date: '' });
    setModalType(type || 'appel');
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await interactionsAPI.create({
        contact_type: contactType,
        contact_id: contactId,
        type: modalType,
        date: form.date || null,
        notes: form.notes || null,
        result: form.result || null,
        next_followup_date: form.next_followup_date || null
      });
      toast.success('Échange enregistré');
      setModalType(null);
      load();
    } catch (error) {
      console.error('Erreur enregistrement suivi:', error);
      toast.error(error.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

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
  // prochaine relance = interaction non faite avec date la plus proche
  const nextFollowup = items
    .filter((i) => i.next_followup_date && !i.followup_done)
    .sort((a, b) => new Date(a.next_followup_date) - new Date(b.next_followup_date))[0] || null;

  const btn = 'px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 transition-colors bg-surface-strong hover:bg-border-strong text-text-primary';

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <FiClock /> Suivi
        </h3>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => openModal('appel')} className={btn}><FiPhone size={14} /> J'ai appelé</button>
          <button onClick={() => openModal('sms')} className={btn}><FiMessageSquare size={14} /> SMS</button>
          <button onClick={() => openModal('note')} className={btn}><FiFileText size={14} /> Note</button>
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
          {/* Resume compact : prochaine relance + dernier echange */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            <div className="bg-surface-muted/50 border border-border rounded-xl p-3">
              <div className="text-xs text-text-muted mb-1">Dernier échange</div>
              {lastExchange ? (
                <div className="flex items-center gap-2 flex-wrap">
                  {(() => { const I = (TYPE_META[lastExchange.type] || TYPE_META.note).icon; return <I size={14} className="text-text-muted" />; })()}
                  <span className="text-sm text-text-primary">{(TYPE_META[lastExchange.type] || TYPE_META.note).label}</span>
                  <span className="text-xs text-text-muted">{relativeDate(lastExchange.date)}</span>
                  {lastExchange.result && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-bg text-neutral-text">{lastExchange.result}</span>
                  )}
                </div>
              ) : (
                <div className="text-sm text-text-muted">Aucun échange</div>
              )}
            </div>
          </div>

          {/* Historique depliable */}
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
                    const followupDue = it.next_followup_date && !it.followup_done;
                    return (
                      <div key={it.id} className="bg-surface-muted/40 border border-border/70 rounded-xl p-3 flex gap-3">
                        <div className="w-9 h-9 rounded-lg bg-surface-strong text-text-secondary flex items-center justify-center flex-shrink-0">
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-text-primary font-medium">{meta.label}</span>
                            <span className="text-xs text-text-muted">{formatDate(it.date)}</span>
                          </div>
                          {it.notes && <p className="text-sm text-text-secondary mt-1 whitespace-pre-wrap">{it.notes}</p>}
                          <div className="flex items-center gap-2 flex-wrap mt-2">
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

      {/* Modale "Enregistrer un echange" */}
      <AnimatePresence>
        {modalType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setModalType(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="panel-bg border border-border rounded-2xl max-w-md w-full flex flex-col max-h-[90vh] overflow-hidden"
              style={{ maxHeight: '90dvh' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-border shrink-0">
                <h2 className="text-lg font-bold text-text-primary">Enregistrer un échange</h2>
                <button onClick={() => setModalType(null)} className="text-text-muted hover:text-text-primary">
                  <FiX size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                {/* Type segmente */}
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Type</label>
                  <div className="flex gap-1 p-1 bg-surface-muted rounded-lg border border-border">
                    {SEGMENTS.map((s) => {
                      const Icon = s.icon;
                      const active = modalType === s.key;
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setModalType(s.key)}
                          className={`flex-1 px-3 py-1.5 rounded-md text-sm flex items-center justify-center gap-1 transition-colors ${
                            active ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-strong'
                          }`}
                        >
                          <Icon size={14} /> {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {modalType === 'appel' && phone && (
                  <a href={`tel:${phone}`} className="inline-flex items-center gap-2 px-3 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg text-sm">
                    <FiPhone size={14} /> Appeler {phone}
                  </a>
                )}

                <div>
                  <label className="block text-sm text-text-secondary mb-1">Date</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-sm text-text-secondary mb-1">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    placeholder="Ce qui s'est dit..."
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-y"
                  />
                </div>

                <div>
                  <label className="block text-sm text-text-secondary mb-2">Résultat</label>
                  <div className="flex flex-wrap gap-2">
                    {RESULT_PRESETS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm({ ...form, result: form.result === r ? '' : r })}
                        className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                          form.result === r ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-text-secondary mb-1">Prochaine relance (optionnel)</label>
                  <input
                    type="date"
                    value={form.next_followup_date}
                    onChange={(e) => setForm({ ...form, next_followup_date: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 px-4 py-2.5 border-2 border-border text-text-primary hover:bg-surface-strong rounded-lg font-medium transition-all"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <FiPlus size={16} /> {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ContactFollowup;
