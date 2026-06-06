// src/components/payments/PaymentList.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiEdit2, FiTrash2, FiDollarSign, FiCalendar, FiCreditCard, FiFileText, FiCheck, FiClock, FiX } from 'react-icons/fi';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import ConfirmModal from '../common/ConfirmModal';
import { paymentsAPI } from '../../services/api';
import PaymentForm from './PaymentForm';

const PaymentList = ({ invoice, payments, onPaymentsUpdate }) => {
  const { toast } = useToast();
  const { confirm, confirmState } = useConfirm();
  const [editingPayment, setEditingPayment] = useState(null);

  // Configuration des statuts
  const statusConfig = {
    completed: {
      icon: <FiCheck />,
      label: 'Reçu',
      bg: 'bg-green-500/20',
      text: 'text-green-300',
      border: 'border-green-500/30'
    },
    pending: {
      icon: <FiClock />,
      label: 'En attente',
      bg: 'bg-amber-500/20',
      text: 'text-amber-300',
      border: 'border-amber-500/30'
    },
    cancelled: {
      icon: <FiX />,
      label: 'Annulé',
      bg: 'bg-rose-500/20',
      text: 'text-rose-300',
      border: 'border-rose-500/30'
    }
  };

  // Labels des moyens de paiement
  const paymentMethodLabels = {
    VIREMENT: 'Virement bancaire',
    CHEQUE: 'Chèque',
    CARTE: 'Carte bancaire',
    ESPECES: 'Espèces',
    PAYPAL: 'PayPal',
    STRIPE: 'Stripe',
    PRELEVEMENT: 'Prélèvement',
    TRAITE: 'Traite',
    AUTRE: 'Autre'
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
  };

  const handleDelete = async (payment) => {
    const confirmed = await confirm({
      title: 'Supprimer ce paiement ?',
      message: `Êtes-vous sûr de vouloir supprimer le paiement de ${payment.amount.toFixed(2)} € ?`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'danger'
    });

    if (!confirmed) return;

    try {
      await paymentsAPI.delete(payment.id);
      toast.success('Paiement supprimé avec succès');
      if (onPaymentsUpdate) {
        onPaymentsUpdate();
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du paiement:', error);
      toast.error(error.message || 'Erreur lors de la suppression du paiement');
    }
  };

  const handleEditSuccess = () => {
    setEditingPayment(null);
    if (onPaymentsUpdate) {
      onPaymentsUpdate();
    }
  };

  if (editingPayment) {
    return (
      <PaymentForm
        invoice={invoice}
        payment={editingPayment}
        onSuccess={handleEditSuccess}
        onCancel={() => setEditingPayment(null)}
      />
    );
  }

  if (!payments || payments.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted">
        <FiDollarSign className="mx-auto text-4xl mb-2 opacity-50" />
        <p>Aucun paiement enregistré</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <AnimatePresence>
          {payments.map((payment, index) => {
            const status = statusConfig[payment.status] || statusConfig.completed;
            const methodLabel = paymentMethodLabels[payment.payment_method] || payment.payment_method;

            return (
              <motion.div
                key={payment.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.05 }}
                className="bg-surface/30 backdrop-blur-sm rounded-lg p-4 hover:bg-surface/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  {/* Gauche : Informations paiement */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {/* Montant */}
                      <div className="flex items-center bg-purple-500/20 border border-purple-500/30 rounded-lg px-3 py-1">
                        <FiDollarSign className="text-purple-300 mr-1" />
                        <span className="text-text-primary font-semibold">
                          {parseFloat(payment.amount).toFixed(2)} €
                        </span>
                      </div>

                      {/* Statut */}
                      <div className={`flex items-center ${status.bg} border ${status.border} rounded-lg px-3 py-1`}>
                        <span className={`${status.text} mr-1`}>{status.icon}</span>
                        <span className={`${status.text} text-sm font-medium`}>
                          {status.label}
                        </span>
                      </div>
                    </div>

                    {/* Détails */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                      <div className="flex items-center text-text-muted">
                        <FiCalendar className="mr-2" size={14} />
                        <span>{formatDate(payment.payment_date)}</span>
                      </div>
                      <div className="flex items-center text-text-muted">
                        <FiCreditCard className="mr-2" size={14} />
                        <span>{methodLabel}</span>
                      </div>
                      {payment.reference && (
                        <div className="flex items-center text-text-muted">
                          <FiFileText className="mr-2" size={14} />
                          <span className="truncate">{payment.reference}</span>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {payment.notes && (
                      <div className="mt-2 text-sm text-text-muted italic">
                        {payment.notes}
                      </div>
                    )}
                  </div>

                  {/* Droite : Actions */}
                  <div className="flex items-center gap-2 ml-4">
                    <motion.button
                      onClick={() => setEditingPayment(payment)}
                      className="p-2 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 transition-colors"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      title="Modifier"
                    >
                      <FiEdit2 size={16} />
                    </motion.button>
                    <motion.button
                      onClick={() => handleDelete(payment)}
                      className="p-2 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 transition-colors"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      title="Supprimer"
                    >
                      <FiTrash2 size={16} />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Modal de confirmation */}
      <ConfirmModal {...confirmState.config} isOpen={confirmState.isOpen} />
    </>
  );
};

export default PaymentList;
