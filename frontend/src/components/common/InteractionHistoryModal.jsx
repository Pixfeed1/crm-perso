// src/components/common/InteractionHistoryModal.jsx
//
// Modale lecture seule de l'historique complet des echanges d'un contact (emails envoyes
// avec leur contenu integral, appels, notes...). Ouverte depuis le cockpit Suivi pour
// pouvoir relire ce qui a deja ete dit avant de relancer, sans quitter le Suivi.
// Reutilise interactionsAPI.getByContact + InteractionTimeline. Tokens de theme.
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiClock } from 'react-icons/fi';
import { interactionsAPI } from '../../services/api';
import { statusMeta } from '../../utils/relationStatus';
import InteractionTimeline from './InteractionTimeline';

const InteractionHistoryModal = ({ isOpen, onClose, contactType, contactId, contactName }) => {
  const [items, setItems] = useState([]);
  const [relationStatus, setRelationStatus] = useState('nouveau');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!isOpen || !contactId) return;
    setLoading(true);
    try {
      const data = await interactionsAPI.getByContact(contactType, contactId);
      if (Array.isArray(data)) {
        setItems(data);
      } else {
        setItems(data.items || []);
        setRelationStatus(data.relation_status || 'nouveau');
      }
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    } finally {
      setLoading(false);
    }
  }, [isOpen, contactType, contactId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => {
    try {
      await interactionsAPI.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (error) {
      console.error('Erreur suppression interaction:', error);
    }
  };

  const sMeta = statusMeta(relationStatus);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="bg-surface border border-border rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
            initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-text-primary flex items-center gap-2 truncate">
                  <FiClock size={16} /> Historique des échanges
                </h3>
                <p className="text-xs text-text-muted mt-0.5 flex items-center gap-2 truncate">
                  <span className="truncate">{contactName || 'Contact'}</span>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${sMeta.cls}`}>{sMeta.label}</span>
                </p>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong flex-shrink-0" title="Fermer">
                <FiX size={18} />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              {loading ? (
                <p className="text-sm text-text-muted py-6 text-center">Chargement…</p>
              ) : (
                <InteractionTimeline items={items} onDelete={handleDelete} />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InteractionHistoryModal;
