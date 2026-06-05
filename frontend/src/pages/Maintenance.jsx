// src/pages/Maintenance.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiTool, FiPlus, FiGrid, FiList, FiSearch, FiX } from 'react-icons/fi';
import { maintenanceContractsAPI } from '../services/api';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';

// Composants
import MaintenanceCard from '../components/maintenance/MaintenanceCard';
import MaintenanceDetails from '../components/maintenance/MaintenanceDetails';
import MaintenanceForm from '../components/maintenance/MaintenanceForm';
import MaintenanceReportForm from '../components/maintenance/MaintenanceReportForm';
import EmptyState from '../components/common/EmptyState';
import ConfirmModal from '../components/common/ConfirmModal';
import Modal from '../components/common/Modal';

const Maintenance = () => {
  const { toast } = useToast();
  const { confirm, confirmState } = useConfirm();

  // États
  const [contracts, setContracts] = useState([]);
  const [filteredContracts, setFilteredContracts] = useState([]);
  const [selectedContract, setSelectedContract] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState(null); // null = création
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [viewMode, setViewMode] = useState('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Deep-link depuis la liste Clients (?contract=ID ouvre le détail, ?client=ID pré-filtre)
  const [searchParams] = useSearchParams();
  const [clientFilterId, setClientFilterId] = useState(searchParams.get('client') || '');
  const deepLinkApplied = useRef(false);

  // Chargement initial
  useEffect(() => {
    fetchContracts();
    fetchStats();
  }, []);

  // Filtrage
  useEffect(() => {
    let result = contracts.filter(contract => {
      const searchMatch = searchQuery === '' ||
        contract.site_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (contract.client_name && contract.client_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (contract.site_url && contract.site_url.toLowerCase().includes(searchQuery.toLowerCase()));

      const statusMatch = statusFilter === 'all' || contract.status === statusFilter;

      const clientMatch = !clientFilterId || String(contract.client_id) === String(clientFilterId);

      return searchMatch && statusMatch && clientMatch;
    });

    setFilteredContracts(result);
  }, [contracts, searchQuery, statusFilter, clientFilterId]);

  // Application du deep-link (une seule fois, après chargement des contrats)
  useEffect(() => {
    if (deepLinkApplied.current || isLoading) return;
    const contractParam = searchParams.get('contract');
    if (contractParam) {
      deepLinkApplied.current = true;
      const existing = contracts.find(c => String(c.id) === String(contractParam));
      if (existing) {
        handleSelectContract(existing);
      } else {
        maintenanceContractsAPI.getById(contractParam)
          .then(cd => { setSelectedContract(cd); setShowDetails(true); })
          .catch(() => {});
      }
    } else if (searchParams.get('client')) {
      deepLinkApplied.current = true;
      setClientFilterId(searchParams.get('client'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, contracts]);

  const fetchContracts = async () => {
    setIsLoading(true);
    try {
      const data = await maintenanceContractsAPI.getAll();
      setContracts(data);
      setFilteredContracts(data);
    } catch (error) {
      console.error('Erreur chargement contrats:', error);
      toast.error('Erreur lors du chargement des contrats');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await maintenanceContractsAPI.getStats();
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    }
  };

  // Sélection d'un contrat
  const handleSelectContract = async (contract) => {
    try {
      const contractDetails = await maintenanceContractsAPI.getById(contract.id);
      setSelectedContract(contractDetails);
      setShowDetails(true);
    } catch (error) {
      console.error('Erreur chargement détails:', error);
      toast.error('Erreur lors du chargement des détails');
    }
  };

  // Ouverture de la modale de contrat (création)
  const handleAddContract = () => {
    setEditingContract(null);
    setContractModalOpen(true);
  };

  // Ouverture de la modale de contrat (édition)
  const handleEditContract = (contract) => {
    setEditingContract(contract);
    setContractModalOpen(true);
  };

  const closeContractModal = () => {
    setContractModalOpen(false);
    setEditingContract(null);
  };

  // Soumission de la modale (création ou édition selon editingContract)
  const handleContractSubmit = async (data) => {
    if (editingContract) {
      await handleUpdateContract(editingContract.id, data);
    } else {
      await handleSaveContract(data);
    }
    closeContractModal();
  };

  // Fermer le détail et revenir à la liste
  const closeDetails = () => {
    setShowDetails(false);
    setSelectedContract(null);
  };

  // Sauvegarde nouveau contrat
  const handleSaveContract = async (contractData) => {
    try {
      const newContract = await maintenanceContractsAPI.create(contractData);
      setContracts([...contracts, newContract]);
      setSelectedContract(newContract);
      setShowDetails(true);
      fetchStats();
      toast.success('Contrat créé avec succès');
    } catch (error) {
      console.error('Erreur création contrat:', error);
      toast.error('Erreur lors de la création du contrat');
    }
  };

  // Mise à jour
  const handleUpdateContract = async (id, updatedData) => {
    try {
      const updatedContract = await maintenanceContractsAPI.update(id, updatedData);
      setContracts(contracts.map(c => c.id === id ? { ...c, ...updatedContract } : c));
      setSelectedContract(updatedContract);
      fetchStats();
      toast.success('Contrat mis à jour avec succès');
    } catch (error) {
      console.error('Erreur mise à jour contrat:', error);
      toast.error('Erreur lors de la mise à jour');
    }
  };

  // Suppression
  const handleDeleteContract = async (id) => {
    const contractToDelete = contracts.find(c => c.id === id);

    const confirmed = await confirm({
      title: "Supprimer ce contrat ?",
      message: "Cette action supprimera également tous les rapports associés.",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger",
      itemName: contractToDelete?.site_name
    });

    if (!confirmed) return;

    try {
      await maintenanceContractsAPI.delete(id);
      setContracts(contracts.filter(c => c.id !== id));
      setSelectedContract(null);
      setShowDetails(false);
      fetchStats();
      toast.success('Contrat supprimé avec succès');
    } catch (error) {
      console.error('Erreur suppression contrat:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Rafraîchir le contrat sélectionné
  const handleRefreshContract = async () => {
    if (selectedContract) {
      const updated = await maintenanceContractsAPI.getById(selectedContract.id);
      setSelectedContract(updated);
      fetchContracts();
      fetchStats();
    }
  };

  // Options de filtre statut
  const statusOptions = [
    { value: 'all', label: 'Tous' },
    { value: 'active', label: 'Actifs' },
    { value: 'paused', label: 'En pause' },
    { value: 'cancelled', label: 'Annulés' }
  ];

  return (
    <div className="h-full flex flex-col overflow-y-auto p-1 sm:p-2 lg:p-4">
      <div className="max-w-7xl mx-auto w-full">
        {/* En-tête */}
        <div className="mb-6 pt-16 sm:pt-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                <FiTool className="text-white text-2xl" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Maintenance</h1>
                <p className="text-gray-400 text-sm">
                  {filteredContracts.length} contrat{filteredContracts.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {/* Toggle vue */}
              <div className="flex bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'cards' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <FiGrid />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <FiList />
                </button>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleAddContract}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <FiPlus />
                <span>Nouveau contrat</span>
              </motion.button>
            </div>
          </div>

          {/* Statistiques */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <div className="text-gray-400 text-xs mb-1">Total</div>
                <div className="text-white text-2xl font-bold">{stats.total_contracts || 0}</div>
              </div>
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                <div className="text-green-400 text-xs mb-1">Actifs</div>
                <div className="text-white text-2xl font-bold">{stats.active_contracts || 0}</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <div className="text-amber-400 text-xs mb-1">Rapports à envoyer</div>
                <div className="text-white text-2xl font-bold">{stats.reports_due || 0}</div>
              </div>
              <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4">
                <div className="text-indigo-400 text-xs mb-1">Revenus mensuels</div>
                <div className="text-white text-2xl font-bold">
                  {Math.round(stats.monthly_revenue || 0)}€
                </div>
              </div>
            </div>
          )}

          {/* Recherche et filtres */}
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-3 mb-6">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Recherche */}
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Rechercher un site..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-2 pl-10 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    <FiX />
                  </button>
                )}
              </div>

              {/* Filtre statut */}
              <div className="flex gap-2">
                {statusOptions.map(option => (
                  <motion.button
                    key={option.value}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStatusFilter(option.value)}
                    className={`px-3 py-2 rounded-lg text-sm ${
                      statusFilter === option.value
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {option.label}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Chip de filtre par client (deep-link depuis la fiche client) */}
        {clientFilterId && !showDetails && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setClientFilterId('')}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30"
            >
              Contrats d'un client
              {filteredContracts[0]?.client_name ? ` · ${filteredContracts[0].client_name}` : ''}
              <FiX size={14} />
            </button>
          </div>
        )}

        {/* Contenu principal : bascule liste / détail en pleine largeur */}
        <div className="w-full">
          {showDetails && selectedContract ? (
            <AnimatePresence mode="wait">
              <motion.div
                key="details"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="w-full"
              >
                {/* Bouton retour toujours visible */}
                <button
                  onClick={closeDetails}
                  className="mb-4 text-gray-400 hover:text-white flex items-center gap-2"
                >
                  ← Retour à la liste
                </button>

                <MaintenanceDetails
                  contract={selectedContract}
                  onUpdate={handleUpdateContract}
                  onDelete={handleDeleteContract}
                  onClose={closeDetails}
                  onRefresh={handleRefreshContract}
                  onEdit={() => handleEditContract(selectedContract)}
                  onGenerateReport={() => setReportModalOpen(true)}
                />
              </motion.div>
            </AnimatePresence>
          ) : isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-purple-500"></div>
            </div>
          ) : filteredContracts.length === 0 ? (
            <EmptyState
              icon={<FiTool />}
              title="Aucun contrat"
              description={searchQuery || statusFilter !== 'all'
                ? "Aucun contrat ne correspond à vos critères"
                : "Créez votre premier contrat de maintenance"}
              action={
                !searchQuery && statusFilter === 'all' && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAddContract}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                  >
                    Créer un contrat
                  </motion.button>
                )
              }
            />
          ) : (
            <div className={viewMode === 'cards'
              ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
              : 'space-y-2'
            }>
              <AnimatePresence>
                {filteredContracts.map(contract => (
                  <MaintenanceCard
                    key={contract.id}
                    contract={contract}
                    isSelected={selectedContract?.id === contract.id}
                    onClick={() => handleSelectContract(contract)}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Modale formulaire de contrat (création / édition) */}
      <Modal isOpen={contractModalOpen} onClose={closeContractModal} maxWidth="max-w-[720px]">
        <MaintenanceForm
          contract={editingContract || {}}
          onSave={handleContractSubmit}
          onCancel={closeContractModal}
        />
      </Modal>

      {/* Modale formulaire de rapport */}
      <Modal isOpen={reportModalOpen} onClose={() => setReportModalOpen(false)} maxWidth="max-w-[720px]">
        {selectedContract && (
          <MaintenanceReportForm
            contract={selectedContract}
            onClose={() => setReportModalOpen(false)}
            onSuccess={() => {
              setReportModalOpen(false);
              handleRefreshContract();
            }}
          />
        )}
      </Modal>

      {/* Modal de confirmation */}
      <ConfirmModal {...confirmState.config} isOpen={confirmState.isOpen} />
    </div>
  );
};

export default Maintenance;
