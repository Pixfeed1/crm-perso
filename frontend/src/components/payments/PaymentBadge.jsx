// src/components/payments/PaymentBadge.jsx
import React from 'react';
import { FiCheck, FiClock, FiAlertTriangle, FiDollarSign } from 'react-icons/fi';

const PaymentBadge = ({ invoice, showAmount = false }) => {
  // Configuration des statuts de paiement
  const statusConfig = {
    paid: {
      icon: <FiCheck />,
      label: 'Payé',
      bg: 'bg-green-500/20',
      text: 'text-green-300',
      border: 'border-green-500/30'
    },
    partial: {
      icon: <FiDollarSign />,
      label: 'Partiel',
      bg: 'bg-blue-500/20',
      text: 'text-blue-300',
      border: 'border-blue-500/30'
    },
    pending: {
      icon: <FiClock />,
      label: 'En attente',
      bg: 'bg-amber-500/20',
      text: 'text-amber-300',
      border: 'border-amber-500/30'
    },
    overdue: {
      icon: <FiAlertTriangle />,
      label: 'En retard',
      bg: 'bg-rose-500/20',
      text: 'text-rose-300',
      border: 'border-rose-500/30'
    }
  };

  const paymentStatus = invoice?.payment_status || 'pending';
  const status = statusConfig[paymentStatus] || statusConfig.pending;

  const amountPaid = parseFloat(invoice?.amount_paid || 0);
  const amountRemaining = parseFloat(invoice?.amount_remaining || invoice?.total_ttc || 0);
  const totalTtc = parseFloat(invoice?.total_ttc || 0);

  return (
    <div className="flex items-center gap-2">
      {/* Badge statut */}
      <div className={`flex items-center ${status.bg} border ${status.border} rounded-lg px-3 py-1`}>
        <span className={`${status.text} mr-1.5`}>{status.icon}</span>
        <span className={`${status.text} text-sm font-medium`}>
          {status.label}
        </span>
      </div>

      {/* Montants détaillés si demandé */}
      {showAmount && (
        <div className="text-sm text-text-muted">
          {paymentStatus === 'partial' && (
            <span>
              {amountPaid.toFixed(2)} € / {totalTtc.toFixed(2)} €
            </span>
          )}
          {paymentStatus === 'pending' && (
            <span>
              {amountRemaining.toFixed(2)} € à payer
            </span>
          )}
          {paymentStatus === 'overdue' && (
            <span className="text-rose-300 font-medium">
              {amountRemaining.toFixed(2)} € en retard
            </span>
          )}
          {paymentStatus === 'paid' && (
            <span className="text-green-300">
              {amountPaid.toFixed(2)} € payé
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default PaymentBadge;
