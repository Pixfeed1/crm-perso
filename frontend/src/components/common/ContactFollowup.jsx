// src/components/common/ContactFollowup.jsx
//
// Section "Suivi" partagée (fiche client ET fiche lead) : timeline des interactions
// + log manuel (appel / SMS / note / RDV). L'email est enregistré automatiquement côté serveur.
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPhone, FiMessageSquare, FiFileText, FiCalendar, FiMail,
  FiPlus, FiTrash2, FiX, FiClock, FiCheck
} from 'react-icons/fi';
import { interactionsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const TYPE_META = {
  email: { icon: FiMail, label: 'Email', color: 'text-blue-300', bg: 'bg-blue-500/20' },
  appel: { icon: FiPhone, label: 'Appel', color: 'text-green-300', bg: 'bg-green-500/20' },
  sms: { icon: FiMessageSquare, label: 'SMS', color: 'text-cyan-300', bg: 'bg-cyan-500/20' },
  note: { icon: FiFileText, label: 'Note', color: 'text-amber-300', bg: 'bg-amber-500/20' },
  rdv: { icon: FiCalendar, label: 'RDV', color: 'text-purple-300', bg: 'bg-purple-500/20' }
};

const RESULT_PRESETS = ['Pas de réponse', 'À rappeler', 'Intéressé', 'Devis à envoyer', 'Refus', 'OK'];

const nowLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const formatDateTime = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const ContactFollowup = ({ contactType, contactId, phone }) => {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalType, setModalType] = useState(null); // 'appel' | 'sms' | 'note' | 'rdv'
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: nowLocal(), notes: '', result: '', next_followup_date: '' });

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
    setForm({ date: nowLocal(), notes: '', result: '', next_followup_date: '' });
    setModalType(type);
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
      toast.success('Suivi enregistré');
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

  return (
    <div className="mt-6 pt-6 border-t border-gray-700">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <FiClock /> Suivi
        </h3>
        <div className="flex flex-wrap gap-2">
          {phone && (
            <a
              href={`tel:${phone}`}
              className="px-3 py-1.5 bg-green-600/30 hover:bg-green-600/50 text-green-300 rounded-lg text-sm flex items-center gap-1"
              title="Appeler"
            >
              <FiPhone size={14} /> Appeler
            </a>
          )}
          <button onClick={() => openModal('appel')} className="px-3 py-1.5 bg-green-600/30 hover:bg-green-600/50 text-green-300 rounded-lg text-sm flex items-center gap-1">
            <FiPhone size={14} /> J'ai appelé
          </button>
          <button onClick={() => openModal('sms')} className="px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 rounded-lg text-sm flex items-center gap-1">
            <FiMessageSquare size={14} /> SMS
          </button>
          <button onClick={() => openModal('note')} className="px-3 py-1.5 bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 rounded-lg text-sm flex items-center gap-1">
            <FiFileText size={14} /> Note
          </button>
          <button onClick={() => openModal('rdv')} className="px-3 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded-lg text-sm flex items-center gap-1">
            <FiCalendar size={14} /> RDV
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Chargement...</p>
      ) : items.length === 0 ? (
        <p className="text-gray-500 text-sm">Aucune prise de contact enregistrée pour l'instant.</p>
      ) : (
        <div className="space-y-3">
          {items.map((it) => {
            const meta = TYPE_META[it.type] || TYPE_META.note;
            const Icon = meta.icon;
            const followupDue = it.next_followup_date && !it.followup_done;
            return (
              <motion.div
                key={it.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-900/40 border border-gray-700/50 rounded-xl p-3 flex gap-3"
              >
                <div className={`w-9 h-9 rounded-lg ${meta.bg} ${meta.color} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-white font-medium">{meta.label}</span>
                    <span className="text-xs text-gray-500">{formatDateTime(it.date)}</span>
                  </div>
                  {it.notes && <p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">{it.notes}</p>}
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    {it.result && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">{it.result}</span>
                    )}
                    {followupDue && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 flex items-center gap-1">
                        <FiClock size={11} /> Relance prévue le {formatDate(it.next_followup_date)}
                      </span>
                    )}
                    {it.next_followup_date && it.followup_done && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 flex items-center gap-1">
                        <FiCheck size={11} /> Relance faite
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => handleDelete(it.id)} className="text-gray-500 hover:text-red-400 self-start" title="Supprimer">
                  <FiTrash2 size={14} />
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modale de log manuel */}
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
              className="bg-gray-900 border border-gray-700 rounded-2xl max-w-md w-full flex flex-col max-h-[90vh] overflow-hidden"
              style={{ maxHeight: '90dvh' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-700 shrink-0">
                <h2 className="text-lg font-bold text-white">
                  {(TYPE_META[modalType] || {}).label || 'Suivi'}
                </h2>
                <button onClick={() => setModalType(null)} className="text-gray-400 hover:text-white">
                  <FiX size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                {modalType === 'appel' && phone && (
                  <a href={`tel:${phone}`} className="inline-flex items-center gap-2 px-3 py-2 bg-green-600/30 hover:bg-green-600/50 text-green-300 rounded-lg text-sm">
                    <FiPhone size={14} /> Appeler {phone}
                  </a>
                )}

                <div>
                  <label className="block text-sm text-gray-300 mb-1">Date</label>
                  <input
                    type="datetime-local"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1">Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    placeholder="Ce qui s'est dit..."
                    className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-y"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1">Résultat</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {RESULT_PRESETS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm({ ...form, result: r })}
                        className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                          form.result === r ? 'bg-indigo-600 text-white' : 'bg-gray-700/60 text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={form.result}
                    onChange={(e) => setForm({ ...form, result: e.target.value })}
                    placeholder="Ou saisie libre..."
                    className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-300 mb-1">Prochaine relance (optionnel)</label>
                  <input
                    type="date"
                    value={form.next_followup_date}
                    onChange={(e) => setForm({ ...form, next_followup_date: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800/60 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-gray-700 shrink-0 bg-gray-900">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 px-4 py-2.5 border-2 border-white/20 text-white hover:bg-white/10 rounded-lg font-medium transition-all"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
