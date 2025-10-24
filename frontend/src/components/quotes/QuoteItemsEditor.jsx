// frontend/src/components/quotes/QuoteItemsEditor.jsx

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

/**
 * Composant pour éditer les lignes d'un devis
 * Permet d'ajouter/supprimer des lignes et calcule automatiquement les totaux
 */
const QuoteItemsEditor = ({ items, onChange, disabled = false }) => {
  // Ajouter une nouvelle ligne vide
  const handleAddItem = () => {
    const newItem = {
      description: '',
      quantity: 1,
      unit_price: 0,
      total_price: 0
    };
    onChange([...items, newItem]);
  };

  // Supprimer une ligne
  const handleRemoveItem = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    onChange(newItems);
  };

  // Mettre à jour une ligne
  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;

    // Recalculer le total de la ligne si quantité ou prix change
    if (field === 'quantity' || field === 'unit_price') {
      const quantity = parseFloat(newItems[index].quantity) || 0;
      const unitPrice = parseFloat(newItems[index].unit_price) || 0;
      newItems[index].total_price = quantity * unitPrice;
    }

    onChange(newItems);
  };

  // Calculer le sous-total
  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + (parseFloat(item.total_price) || 0), 0);
  };

  // Calculer la TVA (20%)
  const calculateTax = () => {
    return calculateSubtotal() * 0.20;
  };

  // Calculer le total TTC
  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  return (
    <div className="space-y-4">
      {/* Tableau des lignes */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10">
          <thead>
            <tr className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-2/5">
                Description
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/6">
                Quantité
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/6">
                Prix U. HT
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-1/6">
                Total HT
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-16">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            <AnimatePresence mode="popLayout">
              {items.map((item, index) => (
                <motion.tr
                  key={index}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.2 }}
                  className="hover:bg-white/5 transition-colors"
                >
                  {/* Description */}
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      disabled={disabled}
                      placeholder="Description de l'article"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg
                               text-white placeholder-gray-400
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                               disabled:opacity-50 disabled:cursor-not-allowed
                               transition-all"
                    />
                  </td>

                  {/* Quantité */}
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      disabled={disabled}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg
                               text-white
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                               disabled:opacity-50 disabled:cursor-not-allowed
                               transition-all"
                    />
                  </td>

                  {/* Prix unitaire HT */}
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={item.unit_price}
                      onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                      disabled={disabled}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg
                               text-white
                               focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                               disabled:opacity-50 disabled:cursor-not-allowed
                               transition-all"
                    />
                  </td>

                  {/* Total HT */}
                  <td className="px-4 py-3">
                    <div className="px-3 py-2 bg-gradient-to-r from-indigo-500/10 to-purple-500/10
                                  border border-indigo-500/20 rounded-lg text-white font-medium">
                      {item.total_price.toFixed(2)} €
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRemoveItem(index)}
                      disabled={disabled || items.length === 1}
                      className="p-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10
                               rounded-lg transition-all
                               disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Supprimer la ligne"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Bouton Ajouter une ligne */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleAddItem}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2
                 bg-gradient-to-r from-indigo-500 to-purple-500
                 hover:from-indigo-600 hover:to-purple-600
                 text-white font-medium rounded-lg
                 shadow-lg shadow-indigo-500/25
                 disabled:opacity-50 disabled:cursor-not-allowed
                 transition-all"
      >
        <PlusIcon className="h-5 w-5" />
        Ajouter une ligne
      </motion.button>

      {/* Totaux */}
      <div className="mt-6 space-y-3 max-w-md ml-auto">
        {/* Sous-total HT */}
        <div className="flex justify-between items-center px-4 py-2 bg-white/5 rounded-lg">
          <span className="text-gray-300 font-medium">Sous-total HT</span>
          <span className="text-white font-semibold">{calculateSubtotal().toFixed(2)} €</span>
        </div>

        {/* TVA 20% */}
        <div className="flex justify-between items-center px-4 py-2 bg-white/5 rounded-lg">
          <span className="text-gray-300 font-medium">TVA (20%)</span>
          <span className="text-white font-semibold">{calculateTax().toFixed(2)} €</span>
        </div>

        {/* Total TTC */}
        <div className="flex justify-between items-center px-4 py-3
                      bg-gradient-to-r from-indigo-500/20 to-purple-500/20
                      border border-indigo-500/30 rounded-lg">
          <span className="text-white font-bold text-lg">Total TTC</span>
          <span className="text-white font-bold text-xl">{calculateTotal().toFixed(2)} €</span>
        </div>
      </div>
    </div>
  );
};

export default QuoteItemsEditor;
