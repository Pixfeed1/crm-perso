// src/pages/Leads.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUsers, FiPlus, FiDownload, FiUpload, FiGrid, FiList, FiTrello, FiSearch, FiSend } from 'react-icons/fi';
import { leadsAPI, exportAPI } from '../services/api';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';

// Composants
import LeadCard from '../components/leads/LeadCard';
import LeadTable from '../components/leads/LeadTable';
import LeadDetails from '../components/leads/LeadDetails';
import LeadForm from '../components/leads/LeadForm';
import LeadFilter from '../components/leads/LeadFilter';
import KanbanView from '../components/kanban/KanbanView';
import ProspectionPanel from '../components/leads/ProspectionPanel';
import OutreachPanel from '../components/leads/OutreachPanel';
import EmptyState from '../components/common/EmptyState';
import ConfirmModal from '../components/common/ConfirmModal';

const Leads = () => {
  const { toast } = useToast();
  const { confirm, confirmState } = useConfirm();
  const fileInputRef = useRef(null);
  const [leads, setLeads] = useState([]);
  const [filteredLeads, setFilteredLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [view, setView] = useState('cards'); // 'cards', 'table' ou 'kanban'
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
  const [stats, setStats] = useState({
    total: 0,
    newThisMonth: 0,
    byStatus: {},
    conversionRate: 0
  });

  // Récupération des leads depuis l'API
  useEffect(() => {
    const fetchLeads = async () => {
      setIsLoading(true);
      try {
        // Récupérer les leads via l'API
        const leadsData = await leadsAPI.getAll();
        console.log('Leads chargés via API:', leadsData);

        setLeads(leadsData);
        setFilteredLeads(leadsData);
        calculateStats(leadsData);
      } catch (error) {
        console.error('Erreur lors du chargement des leads:', error);
        setLeads([]);
        setFilteredLeads([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeads();
  }, []);

  // Calcul des statistiques
  const calculateStats = (leadsData) => {
    const total = leadsData.length;

    // Leads créés ce mois
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const newThisMonth = leadsData.filter(lead =>
      new Date(lead.created_at) >= startOfMonth
    ).length;

    // Comptage par statut
    const byStatus = {};
    leadsData.forEach(lead => {
      const status = lead.status || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    // Taux de conversion (leads won / total leads)
    const wonLeads = byStatus['won'] || 0;
    const conversionRate = total > 0 ? Math.round((wonLeads / total) * 100) : 0;

    setStats({
      total,
      newThisMonth,
      byStatus,
      conversionRate
    });
  };

  // Filtrage et tri des leads
  useEffect(() => {
    let result = leads.filter(lead => {
      // Filtre par recherche
      const searchMatch = filters.search === '' ||
        lead.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        (lead.company && lead.company.toLowerCase().includes(filters.search.toLowerCase()));

      // Filtre par statut
      // "all" signifie tous les leads ACTIFS (exclut won/lost qui sont archivés)
      const statusMatch = filters.status === 'all'
        ? (lead.status !== 'won' && lead.status !== 'lost')
        : lead.status === filters.status;

      // Filtre par type
      const typeMatch = filters.type === 'all' || lead.type === filters.type;

      // Filtre par source
      const sourceMatch = filters.source === 'all' || lead.source === filters.source;

      // Filtre par date de création (range)
      const dateMatch =
        (!filters.dateFrom || new Date(lead.created_at) >= new Date(filters.dateFrom)) &&
        (!filters.dateTo || new Date(lead.created_at) <= new Date(filters.dateTo + 'T23:59:59'));

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

    setFilteredLeads(result);
    // Réinitialiser à la page 1 quand les filtres changent
    setCurrentPage(1);
  }, [leads, filters, sortField, sortDirection]);

  // Calculer les leads pour la page actuelle
  const totalPages = Math.ceil(filteredLeads.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLeads = filteredLeads.slice(startIndex, endIndex);

  // Changer de page
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
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


  // Sélection d'un lead
  const handleSelectLead = async (lead) => {
    try {
      // Récupérer les détails complets du lead via l'API
      const leadDetails = await leadsAPI.getById(lead.id);
      console.log('Détails du lead chargés via API:', leadDetails);

      setSelectedLead(leadDetails);
      setIsAddingLead(false);
      setShowDetails(true); // Afficher les détails sur mobile
    } catch (error) {
      console.error(`Erreur lors du chargement des détails du lead ${lead.id}:`, error);
      // Utiliser les informations de base du lead si les détails ne peuvent pas être chargés
      setSelectedLead(lead);
      setIsAddingLead(false);
      setShowDetails(true); // Afficher les détails sur mobile
    }
  };

  // Import de leads depuis un fichier JSON
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Accepter soit un tableau direct, soit un objet avec propriété "leads"
      const leadsToImport = Array.isArray(data) ? data : data.leads;

      if (!Array.isArray(leadsToImport) || leadsToImport.length === 0) {
        toast.error("Le fichier doit contenir un tableau de leads");
        return;
      }

      const result = await leadsAPI.import(leadsToImport);

      // Rafraîchir la liste
      const updatedLeads = await leadsAPI.getAll();
      setLeads(updatedLeads);
      setFilteredLeads(updatedLeads);
      calculateStats(updatedLeads);

      toast.success(result.message);

      if (result.errors?.length > 0) {
        console.warn('Erreurs d\'import:', result.errors);
      }
    } catch (error) {
      console.error('Erreur import:', error);
      toast.error("Erreur lors de l'import: " + (error.message || "fichier JSON invalide"));
    } finally {
      // Reset le input pour permettre de réimporter le même fichier
      event.target.value = '';
    }
  };

  // Ajout d'un nouveau lead
  const handleAddLead = () => {
    setSelectedLead(null);
    setIsAddingLead(true);
    setShowDetails(true); // Afficher le formulaire sur mobile
  };

  // Retour à la liste (mobile)
  const handleBackToList = () => {
    setShowDetails(false);
    setSelectedLead(null);
    setIsAddingLead(false);
  };

  // Sauvegarde d'un nouveau lead via l'API
  const handleSaveLead = async (leadData) => {
    try {
      // Utiliser l'API pour créer le lead
      const newLead = await leadsAPI.create(leadData);
      console.log('Lead créé via API:', newLead);

      // Mettre à jour l'état local
      setLeads([...leads, newLead]);
      setIsAddingLead(false);
      setSelectedLead(newLead);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du lead:', error);
      toast.error("Une erreur est survenue lors de la création du lead.");
    }
  };

  // Mise à jour d'un lead existant via l'API
  const handleUpdateLead = async (id, updatedData) => {
    try {
      // Utiliser l'API pour mettre à jour le lead
      const updatedLead = await leadsAPI.update(id, updatedData);
      console.log('Lead mis à jour via API:', updatedLead);

      // Mettre à jour l'état local
      const updatedLeads = leads.map(lead =>
        lead.id === id ? { ...lead, ...updatedLead } : lead
      );

      setLeads(updatedLeads);
      setSelectedLead({ ...selectedLead, ...updatedLead });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du lead:', error);
      toast.error("Une erreur est survenue lors de la mise à jour du lead.");
    }
  };

  // Suppression d'un lead via l'API
  const handleDeleteLead = async (id) => {
    const leadToDelete = leads.find(l => l.id === id);

    const confirmed = await confirm({
      title: "Supprimer ce lead ?",
      message: "Cette action est irréversible. Toutes les données associées (contacts, interactions) seront également supprimées.",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger",
      itemName: leadToDelete ? `${leadToDelete.name}${leadToDelete.company ? ` (${leadToDelete.company})` : ''}` : null
    });

    if (!confirmed) return;

    try {
      // Utiliser l'API pour supprimer le lead
      await leadsAPI.delete(id);
      console.log('Lead supprimé via API');

      // Mettre à jour l'état local
      const remainingLeads = leads.filter(lead => lead.id !== id);

      setLeads(remainingLeads);
      setSelectedLead(null);
      setShowDetails(false); // Retour à la liste sur mobile
      toast.success("Lead supprimé avec succès");
    } catch (error) {
      console.error('Erreur lors de la suppression du lead:', error);
      toast.error("Une erreur est survenue lors de la suppression du lead.");
    }
  };

  // Ajout d'un contact à un lead via l'API
  const handleAddContact = async (leadId, contactData) => {
    try {
      // Utiliser l'API pour ajouter un contact
      const newContact = await leadsAPI.addContact(leadId, contactData);
      console.log('Contact ajouté via API:', newContact);

      // Mettre à jour l'état local du lead sélectionné
      if (selectedLead && selectedLead.id === leadId) {
        const updatedContacts = [...(selectedLead.contacts || []), newContact];
        setSelectedLead({
          ...selectedLead,
          contacts: updatedContacts
        });
      }
    } catch (error) {
      console.error('Erreur lors de l\'ajout du contact:', error);
      toast.error("Une erreur est survenue lors de l'ajout du contact.");
    }
  };

  // Mise à jour d'un contact existant via l'API
  const handleUpdateContact = async (leadId, contactId, updatedData) => {
    try {
      // Utiliser l'API pour mettre à jour un contact
      const updatedContact = await leadsAPI.updateContact(leadId, contactId, updatedData);
      console.log('Contact mis à jour via API:', updatedContact);

      // Mettre à jour l'état local du lead sélectionné
      if (selectedLead && selectedLead.id === leadId && selectedLead.contacts) {
        const updatedContacts = selectedLead.contacts.map(contact =>
          contact.id === contactId ? { ...contact, ...updatedContact } : contact
        );

        setSelectedLead({
          ...selectedLead,
          contacts: updatedContacts
        });
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour du contact:', error);
      toast.error("Une erreur est survenue lors de la mise à jour du contact.");
    }
  };

  // Suppression d'un contact via l'API
  const handleDeleteContact = async (leadId, contactId) => {
    const contactToDelete = selectedLead?.contacts?.find(c => c.id === contactId);

    const confirmed = await confirm({
      title: "Supprimer ce contact ?",
      message: "Cette action est irréversible.",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger",
      itemName: contactToDelete ? contactToDelete.name : null
    });

    if (!confirmed) return;

    try {
      // Utiliser l'API pour supprimer un contact
      await leadsAPI.deleteContact(leadId, contactId);
      console.log('Contact supprimé via API');

      // Mettre à jour l'état local du lead sélectionné
      if (selectedLead && selectedLead.id === leadId && selectedLead.contacts) {
        const remainingContacts = selectedLead.contacts.filter(contact => contact.id !== contactId);

        setSelectedLead({
          ...selectedLead,
          contacts: remainingContacts
        });
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du contact:', error);
      toast.error("Une erreur est survenue lors de la suppression du contact.");
    }
  };

  // Ajout d'une interaction à un lead via l'API
  const handleAddInteraction = async (leadId, interactionData) => {
    try {
      // Utiliser l'API pour ajouter une interaction
      const newInteraction = await leadsAPI.addInteraction(leadId, interactionData);
      console.log('Interaction ajoutée via API:', newInteraction);

      // Mettre à jour l'état local du lead sélectionné
      if (selectedLead && selectedLead.id === leadId) {
        const updatedInteractions = [...(selectedLead.interactions || []), newInteraction];
        setSelectedLead({
          ...selectedLead,
          interactions: updatedInteractions
        });
      }
    } catch (error) {
      console.error('Erreur lors de l\'ajout de l\'interaction:', error);
      toast.error("Une erreur est survenue lors de l'ajout de l'interaction.");
    }
  };

  // Mise à jour d'une interaction existante via l'API
  const handleUpdateInteraction = async (interactionId, updatedData) => {
    try {
      // Utiliser l'API pour mettre à jour une interaction
      const updatedInteraction = await leadsAPI.updateInteraction(interactionId, updatedData);
      console.log('Interaction mise à jour via API:', updatedInteraction);

      // Mettre à jour l'état local du lead sélectionné
      if (selectedLead && selectedLead.interactions) {
        const updatedInteractions = selectedLead.interactions.map(interaction =>
          interaction.id === interactionId ? { ...interaction, ...updatedInteraction } : interaction
        );

        setSelectedLead({
          ...selectedLead,
          interactions: updatedInteractions
        });
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'interaction:', error);
      toast.error("Une erreur est survenue lors de la mise à jour de l'interaction.");
    }
  };

  // Suppression d'une interaction via l'API
  const handleDeleteInteraction = async (interactionId) => {
    const interactionToDelete = selectedLead?.interactions?.find(i => i.id === interactionId);

    const confirmed = await confirm({
      title: "Supprimer cette interaction ?",
      message: "Cette action est irréversible.",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger",
      itemName: interactionToDelete ? interactionToDelete.type : null
    });

    if (!confirmed) return;

    try {
      // Utiliser l'API pour supprimer une interaction
      await leadsAPI.deleteInteraction(interactionId);
      console.log('Interaction supprimée via API');

      // Mettre à jour l'état local du lead sélectionné
      if (selectedLead && selectedLead.interactions) {
        const remainingInteractions = selectedLead.interactions.filter(interaction => interaction.id !== interactionId);

        setSelectedLead({
          ...selectedLead,
          interactions: remainingInteractions
        });
      }
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'interaction:', error);
      toast.error("Une erreur est survenue lors de la suppression de l'interaction.");
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <motion.div
          className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-indigo-500 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto p-1 sm:p-2 lg:p-4">
      <div className="max-w-7xl mx-auto w-full">
        {/* En-tête avec statistiques */}
        <div className="mb-6 pt-16 sm:pt-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                <FiUsers className="text-white text-2xl" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">Leads</h1>
                <p className="text-gray-400 text-sm">
                  {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {/* Toggle vue cartes/table/kanban/prospection */}
              <div className="flex bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setView('cards')}
                  className={`p-2 rounded transition-colors ${
                    view === 'cards'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Vue cartes"
                >
                  <FiGrid />
                </button>
                <button
                  onClick={() => setView('table')}
                  className={`p-2 rounded transition-colors ${
                    view === 'table'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Vue liste"
                >
                  <FiList />
                </button>
                <button
                  onClick={() => setView('kanban')}
                  className={`p-2 rounded transition-colors ${
                    view === 'kanban'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Vue Kanban"
                >
                  <FiTrello />
                </button>
                <button
                  onClick={() => setView('prospection')}
                  className={`p-2 rounded transition-colors ${
                    view === 'prospection'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Prospection"
                >
                  <FiSearch />
                </button>
                <button
                  onClick={() => setView('outreach')}
                  className={`p-2 rounded transition-colors ${
                    view === 'outreach'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Outreach (Email, Facebook, Instagram)"
                >
                  <FiSend />
                </button>
              </div>

              {/* Input fichier caché pour l'import */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportFile}
                accept=".json"
                className="hidden"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleImportClick}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-2 transition-colors"
                title="Importer des leads depuis un fichier JSON"
              >
                <FiUpload />
                <span className="hidden sm:inline">Importer</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => exportAPI.leads()}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <FiDownload />
                <span className="hidden sm:inline">Exporter</span>
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleAddLead}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <FiPlus />
                <span>Nouveau lead</span>
              </motion.button>
            </div>
          </div>

          {/* Statistiques */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <div className="text-gray-400 text-xs mb-1">Total</div>
                <div className="text-white text-2xl font-bold">{stats.total || 0}</div>
              </div>
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                <div className="text-green-400 text-xs mb-1">Nouveaux</div>
                <div className="text-white text-2xl font-bold">{stats.newThisMonth || 0}</div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                <div className="text-blue-400 text-xs mb-1">Gagnés</div>
                <div className="text-white text-2xl font-bold">{stats.byStatus?.won || 0}</div>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
                <div className="text-purple-400 text-xs mb-1">Taux conversion</div>
                <div className="text-white text-2xl font-bold">{stats.conversionRate || 0}%</div>
              </div>
            </div>
          )}
        </div>

        {/* Filtres */}
        <div className="mb-4">
          <LeadFilter
            filters={filters}
            setFilters={setFilters}
            onSort={handleSort}
            sortField={sortField}
            sortDirection={sortDirection}
          />
        </div>

        {/* Vue Prospection */}
        {view === 'prospection' ? (
          <ProspectionPanel
            onLeadCreated={(newLead) => {
              setLeads([...leads, newLead]);
              toast.success('Lead créé avec succès depuis la prospection');
            }}
          />
        ) : view === 'outreach' ? (
          <OutreachPanel
            leads={filteredLeads}
            onLeadUpdated={(updatedLead) => {
              setLeads(leads.map(l => l.id === updatedLead.id ? updatedLead : l));
            }}
          />
        ) : view === 'kanban' ? (
          /* Vue Kanban */
          <KanbanView
            leads={filteredLeads}
            onLeadClick={handleSelectLead}
            onLeadUpdate={handleUpdateLead}
          />
        ) : (
          <>
            {/* Contenu principal */}
            {isLoading ? (
              <div className="text-center text-gray-400 py-8">Chargement...</div>
            ) : filteredLeads.length === 0 ? (
              <EmptyState
                icon={FiUsers}
                title="Aucun lead"
                message="Commencez par ajouter votre premier lead"
                actionLabel="Ajouter un lead"
                onAction={handleAddLead}
              />
            ) : (
              <>
                {/* Vue cartes */}
                {view === 'cards' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    <AnimatePresence>
                      {paginatedLeads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          isSelected={selectedLead && selectedLead.id === lead.id}
                          onClick={() => handleSelectLead(lead)}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}

                {/* Vue tableau */}
                {view === 'table' && (
                  <LeadTable
                    leads={paginatedLeads}
                    selectedLead={selectedLead}
                    onSelectLead={handleSelectLead}
                  />
                )}

                {/* Pagination */}
                {filteredLeads.length > itemsPerPage && (
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
                        {startIndex + 1}-{Math.min(endIndex, filteredLeads.length)} sur {filteredLeads.length}
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
          </>
        )}
      </div>

      {/* Modal de confirmation */}
      <ConfirmModal {...confirmState.config} isOpen={confirmState.isOpen} />

      {/* Modal d'ajout de lead */}
      {isAddingLead && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl my-8">
            <LeadForm
              onSave={handleSaveLead}
              onCancel={() => {
                setIsAddingLead(false);
                setShowDetails(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Modal détails lead (mode cartes et table) */}
      {!isAddingLead && selectedLead && showDetails && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setSelectedLead(null);
              setShowDetails(false);
            }}
          />
          <div className="relative w-full max-w-4xl my-8">
            <LeadDetails
              lead={selectedLead}
              onUpdate={handleUpdateLead}
              onDelete={handleDeleteLead}
              onAddContact={handleAddContact}
              onUpdateContact={handleUpdateContact}
              onDeleteContact={handleDeleteContact}
              onAddInteraction={handleAddInteraction}
              onUpdateInteraction={handleUpdateInteraction}
              onDeleteInteraction={handleDeleteInteraction}
              onClose={() => {
                setSelectedLead(null);
                setShowDetails(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};


export default Leads;
