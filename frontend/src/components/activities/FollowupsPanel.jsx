// src/components/activities/FollowupsPanel.jsx
//
// Vue globale "À relancer" : interactions dont la relance est due (aujourd'hui ou en retard)
// et non encore faite, tous contacts confondus (leads + clients).
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiBell, FiPhone, FiMessageSquare, FiFileText, FiCalendar, FiMail, FiCheck, FiUser } from 'react-icons/fi';
import { interactionsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const TYPE_ICON = {
  email: FiMail, appel: FiPhone, sms: FiMessageSquare, note: FiFileText, rdv: FiCalendar
};

const formatDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
};

const isOverdue = (s) => {
  if (!s) return false;
  const d = new Date(s);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
};

const FollowupsPanel = () => {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await interactionsAPI.getFollowups();
      setItems(data || []);
    } catch (error) {
      console.error('Erreur chargement relances:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markDone = async (id) => {
    try {
      setMarking(id);
      await interactionsAPI.markFollowupDone(id, true);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success('Relance marquée comme faite');
    } catch (error) {
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setMarking(null);
    }
  };

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <div className="mb-6 bg-surface/30 border border-rose-500/30 rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
        <FiBell className="text-rose-400" />
        À relancer
        <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300">{items.length}</span>
      </h3>
      <div className="space-y-2">
        <AnimatePresence>
          {items.map((it) => {
            const Icon = TYPE_ICON[it.type] || FiFileText;
            const overdue = isOverdue(it.next_followup_date);
            return (
              <motion.div
                key={it.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-surface-muted/40 border border-border/50 rounded-xl p-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-surface-strong/50 text-text-secondary flex items-center justify-center flex-shrink-0">
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-text-primary font-medium flex items-center gap-1">
                      <FiUser size={12} className="text-text-muted" />
                      {it.contact_name || 'Contact'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {it.contact_type === 'lead' ? 'Lead' : 'Client'}
                    </span>
                  </div>
                  {it.notes && <p className="text-xs text-text-muted truncate mt-0.5">{it.notes}</p>}
                  <span className={`text-xs ${overdue ? 'text-rose-300' : 'text-amber-300'}`}>
                    {overdue ? 'En retard — ' : 'Aujourd’hui — '}relance prévue le {formatDate(it.next_followup_date)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {it.contact_phone && (
                    <a
                      href={`tel:${it.contact_phone}`}
                      className="p-2 bg-green-600/30 hover:bg-green-600/50 text-green-300 rounded-lg"
                      title="Appeler"
                    >
                      <FiPhone size={14} />
                    </a>
                  )}
                  <button
                    onClick={() => markDone(it.id)}
                    disabled={marking === it.id}
                    className="px-3 py-2 bg-accent/30 hover:bg-accent/50 text-indigo-200 rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    <FiCheck size={14} /> Faite
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default FollowupsPanel;
