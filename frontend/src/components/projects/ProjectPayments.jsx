// src/components/projects/ProjectPayments.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FiDollarSign,
  FiPlus,
  FiX,
  FiCalendar,
  FiCreditCard,
  FiFileText,
  FiCheck,
  FiTrash2
} from 'react-icons/fi';
import { projectsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const ProjectPayments = ({ project }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentFormData, setPaymentFormData] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'VIREMENT',
    reference: '',
    notes: ''
  });

  // Méthodes de paiement disponibles
  const paymentMethods = [
    { value: 'VIREMENT', label: 'Virement bancaire' },
    { value: 'CHEQUE', label: 'Chèque' },
    { value: 'CARTE', label: 'Carte bancaire' },
    { value: 'ESPECES', label: 'Espèces' },
    { value: 'PAYPAL', label: 'PayPal' },
    { value: 'STRIPE', label: 'Stripe' },
    { value: 'AUTRE', label: 'Autre' }
  ];

  // Charger les paiements au montage
  useEffect(() => {
    loadPayments();
  }, [project.id]);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const paymentsData = await projectsAPI.getPayments(project.id);
      setPayments(paymentsData);
    } catch (error) {
      console.error('Erreur lors du chargement des paiements:', error);
      toast.error('Impossible de charger les paiements');
    } finally {
      setLoading(false);
    }
  };

  // Calculer le total encaissé
  const totalEncaisse = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const montantPrevu = parseFloat(project.amount || project.budget || 0);
  const montantRestant = montantPrevu - totalEncaisse;
  const pourcentageEncaisse = montantPrevu > 0 ? (totalEncaisse / montantPrevu) * 100 : 0;

  // Gestion du formulaire
  const handlePaymentFormChange = (e) => {
    const { name, value } = e.target;
    setPaymentFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();

    if (!paymentFormData.amount || parseFloat(paymentFormData.amount) <= 0) {
      toast.error('Le montant doit être supérieur à 0');
      return;
    }

    try {
      await projectsAPI.addPayment(project.id, {
        amount: parseFloat(paymentFormData.amount),
        payment_date: paymentFormData.payment_date,
        payment_method: paymentFormData.payment_method,
        reference: paymentFormData.reference,
        notes: paymentFormData.notes
      });

      toast.success('Paiement ajouté avec succès ! Un revenu a été créé automatiquement.');

      // Réinitialiser le formulaire
      setPaymentFormData({
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'VIREMENT',
        reference: '',
        notes: ''
      });

      setShowPaymentForm(false);
      loadPayments();
    } catch (error) {
      console.error('Erreur lors de l\'ajout du paiement:', error);
      toast.error('Erreur lors de l\'ajout du paiement');
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm('Voulez-vous vraiment supprimer ce paiement ?')) {
      return;
    }

    try {
      await projectsAPI.deletePayment(project.id, paymentId);
      toast.success('Paiement supprimé');
      loadPayments();
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Créer une facture depuis le projet
  const handleCreateInvoice = () => {
    // Rediriger vers la page de factures avec les données pré-remplies
    navigate('/invoices', {
      state: {
        prefillData: {
          project_id: project.id,
          project_name: project.name,
          client_id: project.client_id,
          lead_id: project.lead_id,
          amount: montantRestant > 0 ? montantRestant : montantPrevu
        }
      }
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  };

  return (
    <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-5 mb-6">
      {/* En-tête */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-gray-200 flex items-center">
          <FiDollarSign className="mr-2" />
          Paiements
        </h3>

        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 px-3 py-1 rounded-lg text-sm flex items-center"
            onClick={() => setShowPaymentForm(true)}
          >
            <FiPlus className="mr-1" />
            Ajouter un paiement
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 px-3 py-1 rounded-lg text-sm flex items-center"
            onClick={handleCreateInvoice}
          >
            <FiFileText className="mr-1" />
            Créer une facture
          </motion.button>
        </div>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3">
          <div className="text-xs text-purple-300 mb-1">Montant prévu</div>
          <div className="text-xl font-bold text-purple-200">{formatCurrency(montantPrevu)}</div>
        </div>

        <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-3">
          <div className="text-xs text-emerald-300 mb-1">Montant encaissé</div>
          <div className="text-xl font-bold text-emerald-200">{formatCurrency(totalEncaisse)}</div>
          <div className="text-xs text-emerald-400 mt-1">{pourcentageEncaisse.toFixed(0)}%</div>
        </div>

        <div className={`${montantRestant > 0 ? 'bg-amber-900/20 border-amber-500/30' : 'bg-gray-900/20 border-gray-500/30'} border rounded-lg p-3`}>
          <div className={`text-xs ${montantRestant > 0 ? 'text-amber-300' : 'text-gray-300'} mb-1`}>
            Montant restant
          </div>
          <div className={`text-xl font-bold ${montantRestant > 0 ? 'text-amber-200' : 'text-gray-200'}`}>
            {formatCurrency(montantRestant)}
          </div>
          {montantRestant <= 0 && (
            <div className="text-xs text-emerald-400 mt-1 flex items-center">
              <FiCheck className="mr-1" /> Payé
            </div>
          )}
        </div>
      </div>

      {/* Barre de progression */}
      <div className="mb-4">
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-purple-500 to-emerald-500"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(pourcentageEncaisse, 100)}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Formulaire d'ajout de paiement */}
      <AnimatePresence>
        {showPaymentForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleAddPayment}
            className="bg-gray-900/50 border border-purple-500/30 rounded-lg p-4 mb-4"
          >
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-medium text-purple-300">Nouveau paiement</h4>
              <button
                type="button"
                onClick={() => setShowPaymentForm(false)}
                className="text-gray-400 hover:text-white"
              >
                <FiX />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-300 mb-1">Montant (€) *</label>
                <input
                  type="number"
                  name="amount"
                  value={paymentFormData.amount}
                  onChange={handlePaymentFormChange}
                  step="0.01"
                  min="0"
                  required
                  className="w-full bg-gray-800 text-gray-100 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="380.00"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-300 mb-1">Date *</label>
                <input
                  type="date"
                  name="payment_date"
                  value={paymentFormData.payment_date}
                  onChange={handlePaymentFormChange}
                  required
                  className="w-full bg-gray-800 text-gray-100 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-300 mb-1">Moyen de paiement</label>
                <select
                  name="payment_method"
                  value={paymentFormData.payment_method}
                  onChange={handlePaymentFormChange}
                  className="w-full bg-gray-800 text-gray-100 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {paymentMethods.map(method => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-300 mb-1">Référence</label>
                <input
                  type="text"
                  name="reference"
                  value={paymentFormData.reference}
                  onChange={handlePaymentFormChange}
                  className="w-full bg-gray-800 text-gray-100 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Numéro de transaction..."
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs text-gray-300 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={paymentFormData.notes}
                  onChange={handlePaymentFormChange}
                  rows={2}
                  className="w-full bg-gray-800 text-gray-100 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Informations supplémentaires..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => setShowPaymentForm(false)}
                className="px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700 text-sm"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm flex items-center"
              >
                <FiCheck className="mr-1" />
                Enregistrer
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Liste des paiements */}
      {loading ? (
        <div className="text-center text-gray-400 py-4">
          Chargement des paiements...
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center text-gray-400 py-8">
          <FiDollarSign className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>Aucun paiement enregistré</p>
          <p className="text-sm mt-1">Cliquez sur "Ajouter un paiement" pour commencer</p>
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((payment) => (
            <motion.div
              key={payment.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-gray-900/30 border border-gray-700 rounded-lg p-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <FiDollarSign className="text-emerald-400" />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">
                      {formatCurrency(payment.amount)}
                    </span>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-sm text-gray-400 flex items-center">
                      <FiCalendar className="w-3 h-3 mr-1" />
                      {formatDate(payment.payment_date)}
                    </span>
                    {payment.payment_method && (
                      <>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-400 flex items-center">
                          <FiCreditCard className="w-3 h-3 mr-1" />
                          {paymentMethods.find(m => m.value === payment.payment_method)?.label || payment.payment_method}
                        </span>
                      </>
                    )}
                  </div>

                  {payment.reference && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      Réf: {payment.reference}
                    </div>
                  )}

                  {payment.notes && (
                    <div className="text-xs text-gray-400 mt-1">
                      {payment.notes}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={() => handleDeletePayment(payment.id)}
                className="text-gray-400 hover:text-rose-400 p-2 rounded transition-colors"
                title="Supprimer"
              >
                <FiTrash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectPayments;
