// src/pages/Invoices.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiFileText, FiPlus, FiEdit2, FiTrash2, FiDollarSign, FiAlertCircle, FiDownload } from 'react-icons/fi';
import { invoicesAPI } from '../services/quotesAPI';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import InvoiceForm from '../components/invoices/InvoiceForm';
import ConfirmModal from '../components/common/ConfirmModal';
import { exportInvoiceToPDF } from '../services/exportPDF';

const Invoices = () => {
  const { toast } = useToast();
  const { confirm, confirmState } = useConfirm();
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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

  const handleMarkAsPaid = async (id) => {
    try {
      await invoicesAPI.markAsPaid(id);
      toast.success('Facture marquée comme payée');
      fetchInvoices();
    } catch (error) {
      toast.error('Erreur');
    }
  };

  const getPaymentStatusBadge = (status) => {
    const badges = {
      pending: { color: 'bg-yellow-500/20 text-yellow-300', icon: FiAlertCircle, label: 'En attente' },
      paid: { color: 'bg-green-500/20 text-green-300', icon: FiDollarSign, label: 'Payée' },
      overdue: { color: 'bg-red-500/20 text-red-300', icon: FiAlertCircle, label: 'En retard' },
      relance1: { color: 'bg-orange-500/20 text-orange-300', icon: FiAlertCircle, label: 'Relance 1' },
      relance2: { color: 'bg-orange-600/20 text-orange-400', icon: FiAlertCircle, label: 'Relance 2' },
      relance3: { color: 'bg-red-600/20 text-red-400', icon: FiAlertCircle, label: 'Mise en demeure' }
    };
    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${badge.color}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
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

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
            Factures
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {filteredInvoices.length} facture{filteredInvoices.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedInvoice(null);
            setIsFormOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
        >
          <FiPlus />
          <span>Nouvelle facture</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <input
          type="text"
          placeholder="Rechercher..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-indigo-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="all">Tous les statuts</option>
          <option value="pending">En attente</option>
          <option value="paid">Payée</option>
          <option value="overdue">En retard</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : filteredInvoices.length === 0 ? (
        <div className="text-center py-12 bg-gray-800/30 rounded-lg border border-gray-700/50">
          <FiFileText className="w-16 h-16 mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">Aucune facture trouvée</p>
        </div>
      ) : (
        <div className="bg-gray-800/30 rounded-lg border border-gray-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800/50">
                <tr className="text-left text-sm text-gray-400">
                  <th className="px-4 py-3">Numéro</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Échéance</th>
                  <th className="px-4 py-3">Montant TTC</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {filteredInvoices.map((invoice) => (
                  <motion.tr
                    key={invoice.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="hover:bg-gray-700/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-sm text-indigo-300">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-white">{invoice.client_name}</td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {formatDate(invoice.issue_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {formatDate(invoice.due_date)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {formatAmount(invoice.total_ttc)}
                    </td>
                    <td className="px-4 py-3">
                      {getPaymentStatusBadge(invoice.payment_status)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => exportInvoiceToPDF(invoice)}
                          className="p-2 text-purple-400 hover:bg-purple-500/20 rounded transition-colors"
                          title="Télécharger PDF"
                        >
                          <FiDownload className="w-4 h-4" />
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
                        {invoice.payment_status !== 'paid' && (
                          <button
                            onClick={() => handleMarkAsPaid(invoice.id)}
                            className="p-2 text-green-400 hover:bg-green-500/20 rounded transition-colors"
                            title="Marquer comme payée"
                          >
                            <FiDollarSign className="w-4 h-4" />
                          </button>
                        )}
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
              className="bg-gray-900 rounded-lg border border-gray-700 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
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

      <ConfirmModal {...confirmState} />
    </div>
  );
};

export default Invoices;
