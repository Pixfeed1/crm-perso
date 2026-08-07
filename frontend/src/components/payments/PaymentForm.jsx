// src/components/payments/PaymentForm.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiDollarSign, FiCalendar, FiCreditCard, FiFileText, FiX } from 'react-icons/fi';
import { useToast } from '../../hooks/useToast';
import { paymentsAPI, paymentMethodsAPI } from '../../services/api';

const PaymentForm = ({ invoice, payment = null, onSuccess, onCancel }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [formData, setFormData] = useState({
    invoice_id: invoice?.id || '',
    amount: payment?.amount || '',
    payment_date: payment?.payment_date || new Date().toISOString().split('T')[0],
    payment_method: payment?.payment_method || '',
    reference: payment?.reference || '',
    status: payment?.status || 'completed',
    notes: payment?.notes || ''
  });
  const [errors, setErrors] = useState({});

  // Calcul du montant maximum payable
  const maxAmount = payment
    ? parseFloat(invoice?.total_ttc || 0)
    : parseFloat(invoice?.amount_remaining || invoice?.total_ttc || 0);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const methods = await paymentMethodsAPI.getAll();
      setPaymentMethods(methods.filter(m => m.is_active));
    } catch (error) {
      console.error('Erreur lors du chargement des moyens de paiement:', error);
      // Fallback avec méthodes par défaut
      setPaymentMethods([
        { code: 'VIREMENT', label: 'Virement bancaire' },
        { code: 'CHEQUE', label: 'Chèque' },
        { code: 'CARTE', label: 'Carte bancaire' },
        { code: 'ESPECES', label: 'Espèces' },
        { code: 'PAYPAL', label: 'PayPal' },
        { code: 'STRIPE', label: 'Stripe' }
      ]);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Effacer l'erreur du champ
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Le montant doit être supérieur à 0';
    }

    if (parseFloat(formData.amount) > maxAmount) {
      newErrors.amount = `Le montant ne peut pas dépasser ${maxAmount.toFixed(2)} €`;
    }

    if (!formData.payment_date) {
      newErrors.payment_date = 'La date de paiement est requise';
    }

    if (!formData.payment_method) {
      newErrors.payment_method = 'Le moyen de paiement est requis';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Veuillez corriger les erreurs dans le formulaire');
      return;
    }

    setLoading(true);

    try {
      const paymentData = {
        ...formData,
        invoice_id: invoice.id,
        amount: parseFloat(formData.amount)
      };

      if (payment) {
        // Mise à jour
        await paymentsAPI.update(payment.id, paymentData);
        toast.success('Paiement mis à jour avec succès');
      } else {
        // Création
        await paymentsAPI.create(paymentData);
        toast.success('Paiement enregistré avec succès');
      }

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement du paiement:', error);
      toast.error(error.message || 'Erreur lors de l\'enregistrement du paiement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-surface/50 backdrop-blur-sm rounded-xl p-6"
    >
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold text-text-primary">
          {payment ? 'Modifier le paiement' : 'Enregistrer un paiement'}
        </h3>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <FiX size={24} />
          </button>
        )}
      </div>

      {/* Informations facture */}
      <div className="bg-surface-muted/50 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-text-muted">Facture :</span>
            <span className="text-text-primary ml-2 font-medium">{invoice?.invoice_number}</span>
          </div>
          <div>
            <span className="text-text-muted">Montant total :</span>
            <span className="text-text-primary ml-2 font-medium">{invoice?.total_ttc?.toFixed(2)} €</span>
          </div>
          <div>
            <span className="text-text-muted">Reste à payer :</span>
            <span className="text-green-400 ml-2 font-medium">{maxAmount.toFixed(2)} €</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Montant */}
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-text-secondary mb-1">
            Montant du paiement <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted">
              <FiDollarSign />
            </span>
            <input
              type="number"
              id="amount"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              step="0.01"
              min="0.01"
              max={maxAmount}
              className={`w-full bg-surface-muted/50 border ${errors.amount ? 'border-rose-500' : 'border-border'} rounded-lg px-4 py-2 pl-10 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
              placeholder="0.00"
            />
          </div>
          {errors.amount && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1 text-xs text-rose-500"
            >
              {errors.amount}
            </motion.p>
          )}
          <p className="mt-1 text-xs text-text-muted">
            Montant maximum : {maxAmount.toFixed(2)} €
          </p>
        </div>

        {/* Date de paiement */}
        <div>
          <label htmlFor="payment_date" className="block text-sm font-medium text-text-secondary mb-1">
            Date du paiement <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted">
              <FiCalendar />
            </span>
            <input
              type="date"
              id="payment_date"
              name="payment_date"
              value={formData.payment_date}
              onChange={handleChange}
              className={`w-full bg-surface-muted/50 border ${errors.payment_date ? 'border-rose-500' : 'border-border'} rounded-lg px-4 py-2 pl-10 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
            />
          </div>
          {errors.payment_date && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1 text-xs text-rose-500"
            >
              {errors.payment_date}
            </motion.p>
          )}
        </div>

        {/* Moyen de paiement */}
        <div>
          <label htmlFor="payment_method" className="block text-sm font-medium text-text-secondary mb-1">
            Moyen de paiement <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted">
              <FiCreditCard />
            </span>
            <select
              id="payment_method"
              name="payment_method"
              value={formData.payment_method}
              onChange={handleChange}
              className={`w-full bg-surface-muted/50 border ${errors.payment_method ? 'border-rose-500' : 'border-border'} rounded-lg px-4 py-2 pl-10 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
            >
              <option value="">Sélectionner un moyen de paiement</option>
              {paymentMethods.map(method => (
                <option key={method.code} value={method.code}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>
          {errors.payment_method && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1 text-xs text-rose-500"
            >
              {errors.payment_method}
            </motion.p>
          )}
        </div>

        {/* Référence */}
        <div>
          <label htmlFor="reference" className="block text-sm font-medium text-text-secondary mb-1">
            Référence / N° de transaction
          </label>
          <input
            type="text"
            id="reference"
            name="reference"
            value={formData.reference}
            onChange={handleChange}
            className="w-full bg-surface-muted/50 border border-border rounded-lg px-4 py-2 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Ex: CHQ-2024-001, VIREMENT-12345"
          />
          <p className="mt-1 text-xs text-text-muted">
            Numéro de chèque, référence de virement, ID transaction, etc.
          </p>
        </div>

        {/* Statut */}
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-text-secondary mb-1">
            Statut
          </label>
          <select
            id="status"
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="w-full bg-surface-muted/50 border border-border rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="completed">Paiement reçu</option>
            <option value="pending">En attente</option>
            <option value="cancelled">Annulé</option>
          </select>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-text-secondary mb-1">
            Notes
          </label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-text-muted">
              <FiFileText />
            </span>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              className="w-full bg-surface-muted/50 border border-border rounded-lg px-4 py-2 pl-10 text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Informations complémentaires..."
            />
          </div>
        </div>

        {/* Boutons */}
        <div className="flex justify-end space-x-3 pt-4">
          {onCancel && (
            <motion.button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border-2 border-overlay/30 text-text-primary hover:bg-overlay/10 hover:border-overlay/40 font-medium transition-all"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Annuler
            </motion.button>
          )}
          <motion.button
            type="submit"
            disabled={loading}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              loading
                ? 'bg-purple-600/50 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700'
            } text-text-primary`}
            whileHover={!loading ? { scale: 1.02 } : {}}
            whileTap={!loading ? { scale: 0.98 } : {}}
          >
            {loading ? 'Enregistrement...' : payment ? 'Mettre à jour' : 'Enregistrer le paiement'}
          </motion.button>
        </div>
      </form>
    </motion.div>
  );
};

export default PaymentForm;
