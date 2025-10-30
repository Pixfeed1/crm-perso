// src/pages/Clients.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUsers, FiPlus, FiArrowLeft, FiDownload, FiGrid, FiList } from 'react-icons/fi';
import { clientsAPI, exportAPI } from '../services/api';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';

// Composants
import ClientCard from '../components/clients/ClientCard';
import ClientTable from '../components/clients/ClientTable';
import ClientDetails from '../components/clients/ClientDetails';
import ClientForm from '../components/clients/ClientForm';
import ClientFilter from '../components/clients/ClientFilter';
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
  const [viewMode, setViewMode] = useState('cards'); // 'cards' ou 'table'
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    type: 'all',
    source: 'all',
    dateFrom: '',
    dateTo: ''
  });
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

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

  // Filtrage et tri des clients
  useEffect(() => {
    let result = clients.filter(client => {
      // Filtre par recherche
      const searchMatch = filters.search === '' ||
        client.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        (client.company && client.company.toLowerCase().includes(filters.search.toLowerCase())) ||
        (client.email && client.email.toLowerCase().includes(filters.search.toLowerCase()));

      // Filtre par statut
      const statusMatch = filters.status === 'all' || client.status === filters.status;

      // Filtre par type
      const typeMatch = filters.type === 'all' || client.type === filters.type;

      // Filtre par source
      const sourceMatch = filters.source === 'all' || client.source === filters.source;

      // Filtre par date de création (range)
      const dateMatch =
        (!filters.dateFrom || new Date(client.created_at) >= new Date(filters.dateFrom)) &&
        (!filters.dateTo || new Date(client.created_at) <= new Date(filters.dateTo + 'T23:59:59'));

      return searchMatch && statusMatch && typeMatch && sourceMatch && dateMatch;
    });

    // Tri des résultats
    result.sort((a, b) => {
      let aValue, bValue;

      switch (sortField) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'company':
          aValue = (a.company || '').toLowerCase();
          bValue = (b.company || '').toLowerCase();
          break;
        case 'created_at':
        case 'updated_at':
          aValue = new Date(a[sortField]);
          bValue = new Date(b[sortField]);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    setFilteredClients(result);
    // Réinitialiser à la page 1 quand les filtres changent
    setCurrentPage(1);
  }, [clients, filters, sortField, sortDirection]);

  // Calculer les clients pour la page actuelle
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedClients = filteredClients.slice(startIndex, endIndex);

  // Changer de page
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    // Scroll en haut de la liste
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Changer le nombre d'items par page
  const handleItemsPerPageChange = (newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  // Gestion du tri
  const handleSort = (field) => {
    if (sortField === field) {
      // Toggle entre asc et desc si c'est déjà le champ actif
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Nouveau champ de tri: définir à 'asc' par défaut
      setSortField(field);
      setSortDirection('asc');
    }
  };

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
              {/* Toggle vue cartes/liste */}
              <div className="flex bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'cards'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Vue cartes"
                >
                  <FiGrid />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'table'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Vue liste"
                >
                  <FiList />
                </button>
              </div>

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
        <div className="mb-4">
          <ClientFilter
            filters={filters}
            setFilters={setFilters}
            onSort={handleSort}
            sortField={sortField}
            sortDirection={sortDirection}
          />
        </div>

        {/* Contenu principal */}
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
          <>
            {/* Vue cartes */}
            {viewMode === 'cards' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <AnimatePresence>
                  {paginatedClients.map((client) => (
                    <ClientCard
                      key={client.id}
                      client={client}
                      isSelected={selectedClient && selectedClient.id === client.id}
                      onClick={() => handleSelectClient(client)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Vue tableau */}
            {viewMode === 'table' && (
              <ClientTable
                clients={paginatedClients}
                selectedClient={selectedClient}
                onSelectClient={handleSelectClient}
              />
            )}

            {/* Pagination */}
            {filteredClients.length > itemsPerPage && (
              <div className="mt-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-gray-800/40 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
                  {/* Sélecteur nombre d'items */}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400">Afficher</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                      className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span className="text-gray-400">par page</span>
                  </div>

                  {/* Info pagination */}
                  <div className="text-sm text-gray-400">
                    {startIndex + 1}-{Math.min(endIndex, filteredClients.length)} sur {filteredClients.length}
                  </div>

                  {/* Boutons navigation */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      Précédent
                    </button>
                    <span className="px-4 py-2 text-sm text-white font-medium min-w-[80px] text-center">
                      Page {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de confirmation */}
      <ConfirmModal {...confirmState.config} isOpen={confirmState.isOpen} />

      {/* Modal d'ajout de client */}
      {isAddingClient && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl my-8">
            <ClientForm
              onSave={handleSaveClient}
              onCancel={() => {
                setIsAddingClient(false);
                setShowDetails(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Modal détails client (mode cartes et table) */}
      {!isAddingClient && selectedClient && showDetails && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setSelectedClient(null);
              setShowDetails(false);
            }}
          />
          <div className="relative w-full max-w-4xl my-8">
            <ClientDetails
              client={selectedClient}
              onUpdate={handleUpdateClient}
              onDelete={handleDeleteClient}
              onClose={() => {
                setSelectedClient(null);
                setShowDetails(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;
