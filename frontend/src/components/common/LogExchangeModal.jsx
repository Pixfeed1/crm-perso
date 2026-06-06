// src/components/common/LogExchangeModal.jsx
//
// Modale partagee "Enregistrer un echange" (fiche + cockpit Suivi).
// Moyen (Appel/SMS/Email/Note), joint ?, date editable, notes, statut de relation, relance.
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPhone, FiMessageSquare, FiMail, FiFileText, FiX, FiPlus } from 'react-icons/fi';
import { interactionsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { RELATION_STATUSES, REACHED_OPTIONS } from '../../utils/relationStatus';

const SEGMENTS = [
  { key: 'appel', label: 'Appel', icon: FiPhone },
  { key: 'sms', label: 'SMS', icon: FiMessageSquare },
  { key: 'email', label: 'Email', icon: FiMail },
  { key: 'note', label: 'Note', icon: FiFileText }
];

const todayLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

const LogExchangeModal = ({
  isOpen, onClose, onSaved, contactType, contactId, phone, contactName,
  defaultType = 'appel', currentStatus = 'nouveau'
}) => {
  const { toast } = useToast();
  const [type, setType] = useState(defaultType);
  const [form, setForm] = useState({
    reached: '', date: todayLocal(), notes: '', result: '', relation_status: currentStatus || 'nouveau', next_followup_date: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setType(defaultType || 'appel');
      setForm({ reached: '', date: todayLocal(), notes: '', result: '', relation_status: currentStatus || 'nouveau', next_followup_date: '' });
    }
  }, [isOpen, defaultType, currentStatus]);

  const reachedRelevant = type === 'appel' || type === 'sms' || type === 'email';

  const handleSave = async () => {
    try {
      setSaving(true);
      await interactionsAPI.create({
        contact_type: contactType,
        contact_id: contactId,
        type,
        reached: reachedRelevant ? (form.reached || null) : null,
        date: form.date || null,
        notes: form.notes || null,
        result: form.result || null,
        relation_status: form.relation_status || null,
        next_followup_date: form.next_followup_date || null
      });
      toast.success('Échange enregistré');
      onClose();
      if (onSaved) onSaved();
    } catch (error) {
      console.error('Erreur enregistrement échange:', error);
      toast.error(error.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
            className="panel-bg border border-border rounded-2xl max-w-md w-full flex flex-col max-h-[90vh] overflow-hidden"
            style={{ maxHeight: '90dvh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-6 py-4 border-b border-border shrink-0">
              <h2 className="text-lg font-bold text-text-primary">
                Enregistrer un échange{contactName ? ` — ${contactName}` : ''}
              </h2>
              <button onClick={onClose} className="text-text-muted hover:text-text-primary"><FiX size={20} /></button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* Moyen */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">Moyen</label>
                <div className="grid grid-cols-4 gap-1 p-1 bg-surface-muted rounded-lg border border-border">
                  {SEGMENTS.map((s) => {
                    const Icon = s.icon;
                    const active = type === s.key;
                    return (
                      <button key={s.key} type="button" onClick={() => setType(s.key)}
                        className={`px-2 py-1.5 rounded-md text-sm flex items-center justify-center gap-1 transition-colors ${
                          active ? 'bg-accent text-white' : 'text-text-secondary hover:bg-surface-strong'
                        }`}>
                        <Icon size={14} /> <span className="hidden sm:inline">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Joint ? */}
              {reachedRelevant && (
                <div>
                  <label className="block text-sm text-text-secondary mb-2">Le contact a-t-il été joint ?</label>
                  <div className="flex flex-wrap gap-2">
                    {REACHED_OPTIONS.map((r) => (
                      <button key={r.key} type="button"
                        onClick={() => setForm({ ...form, reached: form.reached === r.key ? '' : r.key })}
                        className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                          form.reached === r.key ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'
                        }`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {type === 'appel' && phone && (
                <a href={`tel:${phone}`} className="inline-flex items-center gap-2 px-3 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg text-sm">
                  <FiPhone size={14} /> Appeler {phone}
                </a>
              )}

              {/* Date editable */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">Date de l'échange</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
                  placeholder="Ce qui s'est dit..."
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-y" />
              </div>

              {/* Statut de la relation */}
              <div>
                <label className="block text-sm text-text-secondary mb-2">Statut de la relation</label>
                <div className="flex flex-wrap gap-2">
                  {RELATION_STATUSES.map((s) => (
                    <button key={s.key} type="button"
                      onClick={() => setForm({ ...form, relation_status: s.key })}
                      className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                        form.relation_status === s.key ? 'bg-accent text-white' : 'bg-surface-strong text-text-secondary hover:bg-border-strong'
                      }`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Prochaine relance */}
              <div>
                <label className="block text-sm text-text-secondary mb-1">Prochaine relance (optionnel)</label>
                <input type="date" value={form.next_followup_date} onChange={(e) => setForm({ ...form, next_followup_date: e.target.value })}
                  className="w-full px-3 py-2 bg-surface-muted border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent" />
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2.5 border-2 border-border text-text-primary hover:bg-surface-strong rounded-lg font-medium transition-all">
                Annuler
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <FiPlus size={16} /> {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LogExchangeModal;
