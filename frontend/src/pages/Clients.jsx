// src/pages/Clients.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUsers, FiPlus, FiArrowLeft, FiDownload } from 'react-icons/fi';
import { clientsAPI, exportAPI } from '../services/api';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';

// Composants
import ClientCard from '../components/clients/ClientCard';
import ClientDetails from '../components/clients/ClientDetails';
import ClientForm from '../components/clients/ClientForm';
import EmptyState from '../components/common/EmptyState';
import ConfirmModal from '../components/common/ConfirmModal';

const Clients = () => {
  const { toast } = useToast();
  const { confirm, confirmState } = useConfirm();
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [stats, setStats] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Récupération des clients depuis l'API
  useEffect(() => {
    fetchClients();
    fetchStats();
  }, []);

  const fetchClients = async () => {
    setIsLoading(true);
    try {
      const clientsData = await clientsAPI.getAll();
      console.log('Clients chargés via API:', clientsData);
      setClients(clientsData);
      setFilteredClients(clientsData);
    } catch (error) {
      console.error('Erreur lors du chargement des clients:', error);
      toast.error('Erreur lors du chargement des clients');
      setClients([]);
      setFilteredClients([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const statsData = await clientsAPI.getStats();
      console.log('Statistiques clients:', statsData);
      setStats(statsData);
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques:', error);
    }
  };

  // Filtrage des clients
  useEffect(() => {
    const result = clients.filter(client => {
      const searchMatch = searchTerm === '' ||
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client.company && client.company.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase()));

      const statusMatch = statusFilter === 'all' || client.status === statusFilter;

      return searchMatch && statusMatch;
    });

    setFilteredClients(result);
  }, [clients, searchTerm, statusFilter]);

  // Sélection d'un client
  const handleSelectClient = async (client) => {
    try {
      const clientDetails = await clientsAPI.getById(client.id);
      console.log('Détails du client chargés:', clientDetails);
      setSelectedClient(clientDetails);
      setIsAddingClient(false);
      setShowDetails(true);
    } catch (error) {
      console.error(`Erreur lors du chargement des détails du client ${client.id}:`, error);
      setSelectedClient(client);
      setIsAddingClient(false);
      setShowDetails(true);
    }
  };

  // Ajout d'un nouveau client
  const handleAddClient = () => {
    setSelectedClient(null);
    setIsAddingClient(true);
    setShowDetails(true);
  };

  // Retour à la liste (mobile)
  const handleBackToList = () => {
    setShowDetails(false);
    setSelectedClient(null);
    setIsAddingClient(false);
  };

  // Sauvegarde d'un nouveau client
  const handleSaveClient = async (clientData) => {
    try {
      const newClient = await clientsAPI.create(clientData);
      console.log('Client créé:', newClient);
      setClients([...clients, newClient]);
      setIsAddingClient(false);
      setSelectedClient(newClient);
      fetchStats();
      toast.success('Client créé avec succès');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du client:', error);
      toast.error("Une erreur est survenue lors de la création du client.");
    }
  };

  // Mise à jour d'un client existant
  const handleUpdateClient = async (id, updatedData) => {
    try {
      const updatedClient = await clientsAPI.update(id, updatedData);
      console.log('Client mis à jour:', updatedClient);

      const updatedClients = clients.map(client =>
        client.id === id ? { ...client, ...updatedClient } : client
      );

      setClients(updatedClients);
      setSelectedClient(updatedClient);
      fetchStats();
      toast.success('Client mis à jour avec succès');
    } catch (error) {
      console.error('Erreur lors de la mise à jour du client:', error);
      toast.error("Une erreur est survenue lors de la mise à jour du client.");
    }
  };

  // Suppression d'un client
  const handleDeleteClient = async (id) => {
    const clientToDelete = clients.find(c => c.id === id);

    const confirmed = await confirm({
      title: "Supprimer ce client ?",
      message: "Cette action est irréversible.",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger",
      itemName: clientToDelete ? `${clientToDelete.name}${clientToDelete.company ? ` (${clientToDelete.company})` : ''}` : null
    });

    if (!confirmed) return;

    try {
      await clientsAPI.delete(id);
      setClients(clients.filter(client => client.id !== id));
      setSelectedClient(null);
      setIsAddingClient(false);
      fetchStats();
      toast.success('Client supprimé avec succès');
    } catch (error) {
      console.error('Erreur lors de la suppression du client:', error);
      toast.error("Une erreur est survenue lors de la suppression du client.");
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    try {
      exportAPI.clients();
      toast.success('Export CSV en cours...');
    } catch (error) {
      console.error('Erreur lors de l\'export CSV:', error);
      toast.error('Erreur lors de l\'export CSV');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto p-4 sm:p-6">
      <div className="max-w-7xl mx-auto w-full">
        {/* En-tête avec statistiques */}
        <div className="mb-6 pt-16 sm:pt-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                <FiUsers className="text-white text-2xl" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Clients</h1>
                <p className="text-gray-400 text-sm">
                  {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleExportCSV}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <FiDownload />
                <span className="hidden sm:inline">Exporter</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleAddClient}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <FiPlus />
                <span>Nouveau client</span>
              </motion.button>
            </div>
          </div>

          {/* Statistiques */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <div className="text-gray-400 text-xs mb-1">Total</div>
                <div className="text-white text-2xl font-bold">{stats.total_clients || 0}</div>
              </div>
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                <div className="text-green-400 text-xs mb-1">Actifs</div>
                <div className="text-white text-2xl font-bold">{stats.active_clients || 0}</div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <div className="text-blue-400 text-xs mb-1">Valeur moyenne</div>
                <div className="text-white text-2xl font-bold">
                  {stats.avg_lifetime_value ? `${Math.round(stats.avg_lifetime_value)}€` : '0€'}
                </div>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
                <div className="text-purple-400 text-xs mb-1">Valeur totale</div>
                <div className="text-white text-2xl font-bold">
                  {stats.total_lifetime_value ? `${Math.round(stats.total_lifetime_value)}€` : '0€'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Filtres */}
        <div className="mb-4 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Rechercher un client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
          </select>
        </div>

        {/* Contenu principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Liste des clients (cachée sur mobile si détails affichés) */}
          <div className={`lg:col-span-1 space-y-3 ${showDetails ? 'hidden lg:block' : ''}`}>
            {isLoading ? (
              <div className="text-center text-gray-400 py-8">Chargement...</div>
            ) : filteredClients.length === 0 ? (
              <EmptyState
                icon={FiUsers}
                title="Aucun client"
                message="Commencez par ajouter votre premier client"
                actionLabel="Ajouter un client"
                onAction={handleAddClient}
              />
            ) : (
              <AnimatePresence>
                {filteredClients.map((client) => (
                  <ClientCard
                    key={client.id}
                    client={client}
                    isSelected={selectedClient && selectedClient.id === client.id}
                    onClick={() => handleSelectClient(client)}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Détails du client / Formulaire */}
          <div className={`lg:col-span-2 ${!showDetails && !isAddingClient ? 'hidden lg:block' : ''}`}>
            {showDetails && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={handleBackToList}
                className="lg:hidden mb-4 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
              >
                <FiArrowLeft />
                <span>Retour à la liste</span>
              </motion.button>
            )}

            {isAddingClient ? (
              <ClientForm
                onSave={handleSaveClient}
                onCancel={() => {
                  setIsAddingClient(false);
                  setShowDetails(false);
                }}
              />
            ) : selectedClient ? (
              <ClientDetails
                client={selectedClient}
                onUpdate={handleUpdateClient}
                onDelete={handleDeleteClient}
                onClose={() => {
                  setSelectedClient(null);
                  setShowDetails(false);
                }}
              />
            ) : (
              <div className="hidden lg:flex items-center justify-center h-full">
                <EmptyState
                  icon={FiUsers}
                  title="Sélectionnez un client"
                  message="Choisissez un client dans la liste pour voir ses détails"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de confirmation */}
      <ConfirmModal {...confirmState.config} isOpen={confirmState.isOpen} />
    </div>
  );
};

export default Clients;
