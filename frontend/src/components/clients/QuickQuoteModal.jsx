// src/components/clients/QuickQuoteModal.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiFileText, FiSend, FiPlus, FiTrash2 } from 'react-icons/fi';
import { useToast } from '../../hooks/useToast';

const QuickQuoteModal = ({ isOpen, onClose, client }) => {
  const { toast } = useToast();
  const [items, setItems] = useState([{ description: '', quantity: 1, unit_price: 0 }]);
  const [tvaRate, setTvaRate] = useState(20);
  const [validityDays, setValidityDays] = useState(30);
  const [notes, setNotes] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Réinitialiser le formulaire
  useEffect(() => {
    if (isOpen) {
      setItems([{ description: '', quantity: 1, unit_price: 0 }]);
      setTvaRate(20);
      setValidityDays(30);
      setNotes('');
    }
  }, [isOpen]);

  // Ajouter une ligne
  const handleAddItem = () => {
    setItems([...items, { description: '', quantity: 1, unit_price: 0 }]);
  };

  // Supprimer une ligne
  const handleRemoveItem = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  // Mettre à jour une ligne
  const handleUpdateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  // Calculs
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const tvaAmount = subtotal * (tvaRate / 100);
  const total = subtotal + tvaAmount;

  const handleSend = async () => {
    // Validation
    const invalidItems = items.filter(item => !item.description.trim() || item.quantity <= 0 || item.unit_price < 0);
    if (invalidItems.length > 0) {
      toast.error('Veuillez remplir correctement tous les articles');
      return;
    }

    if (!client?.email) {
      toast.error('Ce client n\'a pas d\'adresse email');
      return;
    }

    setIsSending(true);

    try {
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

      // Créer le devis
      const quoteResponse = await fetch(`${API_URL}/api/quotes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          client_id: client.id,
          client_name: client.name,
          client_email: client.email,
          client_address: client.address || '',
          client_siret: client.siret || '',
          items: items,
          tva_rate: tvaRate,
          tva_applicable: true,
          validity_days: validityDays,
          notes: notes,
          payment_details: ''
        })
      });

      if (!quoteResponse.ok) {
        const error = await quoteResponse.json();
        throw new Error(error.message || 'Erreur lors de la création du devis');
      }

      const quote = await quoteResponse.json();

      // Envoyer le devis par email
      const sendResponse = await fetch(`${API_URL}/api/quotes/${quote.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          to: client.email,
          cc: '',
          subject: `Devis ${quote.quote_number}`,
          message: `Bonjour ${client.name},\n\nVeuillez trouver ci-joint votre devis ${quote.quote_number}.\n\nCordialement`
        })
      });

      if (!sendResponse.ok) {
        toast.warning('Devis créé mais non envoyé. Vous pouvez le renvoyer depuis la liste des devis.');
      } else {
        toast.success('Devis créé et envoyé avec succès !');
      }

      onClose();
    } catch (error) {
      console.error('Erreur:', error);
      toast.error(error.message || 'Erreur lors de la création du devis');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-4xl bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                <FiFileText className="text-green-400 text-xl" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-text-primary">Créer et envoyer un devis</h2>
                <p className="text-sm text-text-muted">pour {client?.name}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-surface-strong rounded-lg transition-colors">
              <FiX className="text-text-muted text-xl" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6 overflow-y-auto flex-1">
            {/* Articles */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-3">
                Articles / Services <span className="text-red-400">*</span>
              </label>

              {items.map((item, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => handleUpdateItem(index, 'description', e.target.value)}
                    className="flex-1 px-3 py-2 bg-surface-muted/50 border border-border rounded-lg text-text-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Qté"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => handleUpdateItem(index, 'quantity', Number(e.target.value))}
                    className="w-20 px-3 py-2 bg-surface-muted/50 border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Prix HT"
                    min="0"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => handleUpdateItem(index, 'unit_price', Number(e.target.value))}
                    className="w-28 px-3 py-2 bg-surface-muted/50 border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
                  />
                  <div className="w-24 px-3 py-2 bg-surface-strong/50 rounded-lg text-text-primary text-sm flex items-center justify-end">
                    {(item.quantity * item.unit_price).toFixed(2)} €
                  </div>
                  {items.length > 1 && (
                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="p-2 hover:bg-red-600 rounded-lg transition-colors text-text-muted hover:text-white"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              <button
                onClick={handleAddItem}
                className="mt-2 flex items-center gap-2 px-3 py-2 bg-surface-strong hover:bg-border-strong text-text-primary rounded-lg transition-colors text-sm"
              >
                <FiPlus />
                Ajouter une ligne
              </button>
            </div>

            {/* Paramètres */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Taux TVA (%)</label>
                <select
                  value={tvaRate}
                  onChange={(e) => setTvaRate(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-surface-muted/50 border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value={0}>0% (Exonéré)</option>
                  <option value={5.5}>5.5% (Réduit)</option>
                  <option value={10}>10% (Intermédiaire)</option>
                  <option value={20}>20% (Normal)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Validité (jours)</label>
                <input
                  type="number"
                  min="1"
                  value={validityDays}
                  onChange={(e) => setValidityDays(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-surface-muted/50 border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Notes / Conditions</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Conditions particulières, modalités de paiement..."
                className="w-full px-3 py-2 bg-surface-muted/50 border border-border rounded-lg text-text-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>

            {/* Récapitulatif */}
            <div className="bg-surface-muted/50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Sous-total HT</span>
                <span className="text-text-primary font-medium">{subtotal.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">TVA ({tvaRate}%)</span>
                <span className="text-text-primary font-medium">{tvaAmount.toFixed(2)} €</span>
              </div>
              <div className="pt-2 border-t border-border flex justify-between">
                <span className="text-text-primary font-semibold">Total TTC</span>
                <span className="text-green-400 font-bold text-lg">{total.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-surface-muted/30">
            <button
              onClick={onClose}
              disabled={isSending}
              className="px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-strong rounded-lg transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={handleSend}
              disabled={isSending || items.some(item => !item.description.trim())}
              className="px-6 py-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Envoi en cours...</span>
                </>
              ) : (
                <>
                  <FiSend />
                  <span>Créer et envoyer</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default QuickQuoteModal;
