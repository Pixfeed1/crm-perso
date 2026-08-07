// src/pages/Invoices.jsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiFileText, FiPlus, FiEdit2, FiTrash2, FiDollarSign, FiAlertCircle, FiDownload, FiSend, FiX, FiCreditCard, FiRepeat, FiTrendingUp } from 'react-icons/fi';
import { invoicesAPI } from '../services/quotesAPI';
import { paymentsAPI, scheduledEmailsAPI } from '../services/api';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import InvoiceForm from '../components/invoices/InvoiceForm';
import PaymentBadge from '../components/payments/PaymentBadge';
import PaymentForm from '../components/payments/PaymentForm';
import PaymentList from '../components/payments/PaymentList';
import ConfirmModal from '../components/common/ConfirmModal';
import SendEmailModal from '../components/common/SendEmailModal';
import Button from '../components/common/Button';
import { exportInvoiceToPDF } from '../services/exportPDF';
import SubscriptionsTab from '../components/subscriptions/SubscriptionsTab';
import Treasury from './Treasury';

const VALID_TABS = ['invoices', 'subscriptions', 'treasury'];

const Invoices = () => {
  const { toast } = useToast();
  const { confirm, confirmState } = useConfirm();
  // Onglet actif piloté par le query param ?tab= (comme le hub Portefeuille).
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = VALID_TABS.includes(rawTab) ? rawTab : 'invoices';
  const setActiveTab = (tab) => setSearchParams({ tab });
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [invoiceToSend, setInvoiceToSend] = useState(null);
  const [viewingPayments, setViewingPayments] = useState(false);
  const [paymentsInvoice, setPaymentsInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    setIsLoading(true);
    try {
      const data = await invoicesAPI.getAll();
      setInvoices(data);
      setFilteredInvoices(data);
    } catch (error) {
      console.error('Erreur:', error);
      toast.error('Erreur lors du chargement des factures');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let filtered = invoices;
    if (searchTerm) {
      filtered = filtered.filter(inv =>
        inv.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.client_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(inv => inv.payment_status === statusFilter);
    }
    setFilteredInvoices(filtered);
  }, [searchTerm, statusFilter, invoices]);

  const handleSaveInvoice = async (invoiceData) => {
    try {
      if (selectedInvoice) {
        await invoicesAPI.update(selectedInvoice.id, invoiceData);
        toast.success('Facture modifiée avec succès');
      } else {
        await invoicesAPI.create(invoiceData);
        toast.success('Facture créée avec succès');
      }
      setIsFormOpen(false);
      setSelectedInvoice(null);
      fetchInvoices();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde de la facture');
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await confirm({
      title: 'Supprimer la facture',
      message: 'Êtes-vous sûr de vouloir supprimer cette facture ?',
      confirmText: 'Supprimer',
      cancelText: 'Annuler'
    });
    if (confirmed) {
      try {
        await invoicesAPI.delete(id);
        toast.success('Facture supprimée');
        fetchInvoices();
      } catch (error) {
        toast.error('Erreur lors de la suppression');
      }
    }
  };

  const handleViewPayments = async (invoice) => {
    setPaymentsInvoice(invoice);
    setViewingPayments(true);
    setShowPaymentForm(false);
    await fetchPaymentsForInvoice(invoice.id);
  };

  const fetchPaymentsForInvoice = async (invoiceId) => {
    try {
      const data = await paymentsAPI.getByInvoice(invoiceId);
      setPayments(data);
    } catch (error) {
      console.error('Erreur lors du chargement des paiements:', error);
      toast.error('Erreur lors du chargement des paiements');
    }
  };

  const handlePaymentsUpdate = async () => {
    if (paymentsInvoice) {
      await fetchPaymentsForInvoice(paymentsInvoice.id);
      await fetchInvoices(); // Rafraîchir la liste pour mettre à jour les statuts
    }
  };

  const handleClosePayments = () => {
    setViewingPayments(false);
    setPaymentsInvoice(null);
    setPayments([]);
    setShowPaymentForm(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-FR');
  };

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  };

  // Envoyer facture par email
  const handleSendEmail = (invoice) => {
    setInvoiceToSend(invoice);
    setEmailModalOpen(true);
  };

  const handleEmailSend = async (emailData) => {
    try {
      await invoicesAPI.sendEmail(invoiceToSend.id, emailData);
      toast.success('Facture envoyée avec succès');
      fetchInvoices(); // Rafraîchir
    } catch (error) {
      console.error('Erreur lors de l\'envoi:', error);
      throw new Error(error.message || 'Erreur lors de l\'envoi de l\'email');
    }
  };

  // Programmer l'envoi d'un email
  const handleScheduleEmail = async (scheduleData) => {
    try {
      await scheduledEmailsAPI.create({
        to_email: scheduleData.recipientEmail,
        to_name: invoiceToSend.client_name,
        subject: `Votre facture ${invoiceToSend.invoice_number}`,
        body_html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">Votre facture ${invoiceToSend.invoice_number}</h2>
            <p>Bonjour ${invoiceToSend.client_name || ''},</p>
            <p>Veuillez trouver ci-joint votre facture n°<strong>${invoiceToSend.invoice_number}</strong>.</p>
            ${scheduleData.customMessage ? `<div style="margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px;">${scheduleData.customMessage.replace(/\n/g, '<br>')}</div>` : ''}
            <p>Cordialement,<br/>L'équipe</p>
          </div>
        `,
        scheduled_at: scheduleData.scheduledAt,
        email_type: 'invoice',
        related_type: 'invoice',
        related_id: invoiceToSend.id
      });
      toast.success(`Email programmé pour le ${new Date(scheduleData.scheduledAt).toLocaleString('fr-FR')}`);
    } catch (error) {
      console.error('Erreur lors de la programmation:', error);
      throw new Error(error.message || 'Erreur lors de la programmation de l\'email');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto p-1 sm:p-2 lg:p-4">
      <div className="max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pt-16 sm:pt-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
              Finances
            </h1>
            {activeTab === 'invoices' && (
              <p className="text-text-muted text-sm mt-1">
                {filteredInvoices.length} facture{filteredInvoices.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {activeTab === 'invoices' && (
            <Button
              onClick={() => {
                setSelectedInvoice(null);
                setIsFormOpen(true);
              }}
              variant="primary"
              icon={FiPlus}
              className="w-full sm:w-auto"
            >
              Nouvelle facture
            </Button>
          )}
        </div>

        {/* Onglets */}
        <div className="flex gap-2 mb-6 border-b border-border/50">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'invoices'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <FiFileText size={16} />
            Factures
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'subscriptions'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <FiRepeat size={16} />
            Abonnements
          </button>
          <button
            onClick={() => setActiveTab('treasury')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'treasury'
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <FiTrendingUp size={16} />
            Trésorerie
          </button>
        </div>

        {activeTab === 'treasury' && <Treasury />}

        {activeTab === 'subscriptions' && <SubscriptionsTab />}

        {activeTab === 'invoices' && (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-indigo-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-surface/50 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="paid">Payée</option>
            <option value="overdue">En retard</option>
          </select>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-text-muted">Chargement...</div>
        ) : filteredInvoices.length === 0 ? (
          <div className="text-center py-12 bg-surface/30 rounded-lg border border-border/50">
            <FiFileText className="w-16 h-16 mx-auto text-gray-600 mb-4" />
            <p className="text-text-muted">Aucune facture trouvée</p>
          </div>
        ) : (
          <div className="bg-surface/30 rounded-lg border border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface/50">
                  <tr className="text-left text-sm text-text-muted">
                    <th className="px-4 py-3">Numéro</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Échéance</th>
                    <th className="px-4 py-3">Montant TTC</th>
                    <th className="px-4 py-3">Statut</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredInvoices.map((invoice) => (
                    <motion.tr
                      key={invoice.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-surface-strong/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-sm text-indigo-300">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-4 py-3 text-text-primary">{invoice.client_name}</td>
                      <td className="px-4 py-3 text-text-muted text-sm">
                        {formatDate(invoice.issue_date)}
                      </td>
                      <td className="px-4 py-3 text-text-muted text-sm">
                        {formatDate(invoice.due_date)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-text-primary">
                        {formatAmount(invoice.total_ttc)}
                      </td>
                      <td className="px-4 py-3">
                        <PaymentBadge invoice={invoice} showAmount={false} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSendEmail(invoice)}
                            className="p-2 text-indigo-400 hover:bg-indigo-500/20 rounded transition-colors"
                            title="Envoyer par email"
                          >
                            <FiSend className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => exportInvoiceToPDF(invoice)}
                            className="p-2 text-purple-400 hover:bg-purple-500/20 rounded transition-colors"
                            title="Télécharger PDF"
                          >
                            <FiDownload className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleViewPayments(invoice)}
                            className="p-2 text-green-400 hover:bg-green-500/20 rounded transition-colors"
                            title="Gérer les paiements"
                          >
                            <FiCreditCard className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setIsFormOpen(true);
                            }}
                            className="p-2 text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                            title="Modifier"
                          >
                            <FiEdit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(invoice.id)}
                            className="p-2 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                            title="Supprimer"
                          >
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
        )}
      </div>

      {/* Modal formulaire */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => {
              setIsFormOpen(false);
              setSelectedInvoice(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-surface-muted rounded-lg border border-border max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <InvoiceForm
                invoice={selectedInvoice}
                onSave={handleSaveInvoice}
                onCancel={() => {
                  setIsFormOpen(false);
                  setSelectedInvoice(null);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal {...confirmState.config} isOpen={confirmState.isOpen} />

      {/* Modal gestion des paiements */}
      <AnimatePresence>
        {viewingPayments && paymentsInvoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={handleClosePayments}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-surface-muted rounded-lg border border-border max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* En-tête */}
              <div className="sticky top-0 bg-surface-muted border-b border-border px-6 py-4 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-text-primary">
                    Gestion des paiements
                  </h2>
                  <p className="text-sm text-text-muted mt-1">
                    Facture {paymentsInvoice.invoice_number} - {paymentsInvoice.client_name}
                  </p>
                </div>
                <button
                  onClick={handleClosePayments}
                  className="text-text-muted hover:text-text-primary transition-colors"
                >
                  <FiX size={24} />
                </button>
              </div>

              {/* Contenu */}
              <div className="p-6">
                {/* Résumé facture */}
                <div className="bg-surface/50 rounded-lg p-4 mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <span className="text-text-muted text-sm">Montant total</span>
                      <p className="text-text-primary font-semibold text-lg">
                        {formatAmount(paymentsInvoice.total_ttc)}
                      </p>
                    </div>
                    <div>
                      <span className="text-text-muted text-sm">Déjà payé</span>
                      <p className="text-green-400 font-semibold text-lg">
                        {formatAmount(paymentsInvoice.amount_paid || 0)}
                      </p>
                    </div>
                    <div>
                      <span className="text-text-muted text-sm">Reste à payer</span>
                      <p className="text-purple-400 font-semibold text-lg">
                        {formatAmount(paymentsInvoice.amount_remaining || paymentsInvoice.total_ttc)}
                      </p>
                    </div>
                    <div>
                      <span className="text-text-muted text-sm">Statut</span>
                      <div className="mt-1">
                        <PaymentBadge invoice={paymentsInvoice} showAmount={false} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bouton ajouter paiement */}
                {!showPaymentForm && paymentsInvoice.payment_status !== 'paid' && (
                  <div className="mb-6">
                    <button
                      onClick={() => setShowPaymentForm(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                    >
                      <FiPlus />
                      <span>Enregistrer un paiement</span>
                    </button>
                  </div>
                )}

                {/* Formulaire paiement */}
                {showPaymentForm && (
                  <div className="mb-6">
                    <PaymentForm
                      invoice={paymentsInvoice}
                      onSuccess={() => {
                        setShowPaymentForm(false);
                        handlePaymentsUpdate();
                      }}
                      onCancel={() => setShowPaymentForm(false)}
                    />
                  </div>
                )}

                {/* Liste des paiements */}
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-4">
                    Historique des paiements ({payments.length})
                  </h3>
                  <PaymentList
                    invoice={paymentsInvoice}
                    payments={payments}
                    onPaymentsUpdate={handlePaymentsUpdate}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal d'envoi email */}
      <SendEmailModal
        isOpen={emailModalOpen}
        onClose={() => {
          setEmailModalOpen(false);
          setInvoiceToSend(null);
        }}
        onSend={handleEmailSend}
        onSchedule={handleScheduleEmail}
        defaultEmail={invoiceToSend?.client_email || ''}
        documentType="facture"
        documentNumber={invoiceToSend?.invoice_number || ''}
        clientName={invoiceToSend?.client_name || ''}
      />
    </div>
  );
};

export default Invoices;
