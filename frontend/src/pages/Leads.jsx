// src/pages/Leads.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// Remplacer executeQuery par la fonction d'API
import { leadsAPI } from '../services/api';

// Composants
import LeadCard from '../components/leads/LeadCard';
import LeadDetails from '../components/leads/LeadDetails';
import LeadForm from '../components/leads/LeadForm';
import LeadFilter from '../components/leads/LeadFilter';
import EmptyState from '../components/common/EmptyState';

const Leads = () => {
  const [leads, setLeads] = useState([]);
  const [filteredLeads, setFilteredLeads] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    type: 'all'
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

  // Filtrage des leads
  useEffect(() => {
    const result = leads.filter(lead => {
      // Filtre par recherche
      const searchMatch = filters.search === '' || 
        lead.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        (lead.company && lead.company.toLowerCase().includes(filters.search.toLowerCase()));
      
      // Filtre par statut
      const statusMatch = filters.status === 'all' || lead.status === filters.status;
      
      // Filtre par type
      const typeMatch = filters.type === 'all' || lead.type === filters.type;
      
      return searchMatch && statusMatch && typeMatch;
    });
    
    setFilteredLeads(result);
  }, [leads, filters]);

  // Sélection d'un lead
  const handleSelectLead = async (lead) => {
    try {
      // Récupérer les détails complets du lead via l'API
      const leadDetails = await leadsAPI.getById(lead.id);
      console.log('Détails du lead chargés via API:', leadDetails);
      
      setSelectedLead(leadDetails);
      setIsAddingLead(false);
    } catch (error) {
      console.error(`Erreur lors du chargement des détails du lead ${lead.id}:`, error);
      // Utiliser les informations de base du lead si les détails ne peuvent pas être chargés
      setSelectedLead(lead);
      setIsAddingLead(false);
    }
  };

  // Ajout d'un nouveau lead
  const handleAddLead = () => {
    setSelectedLead(null);
    setIsAddingLead(true);
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
      alert("Une erreur est survenue lors de la création du lead.");
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
      alert("Une erreur est survenue lors de la mise à jour du lead.");
    }
  };

  // Suppression d'un lead via l'API
  const handleDeleteLead = async (id) => {
    try {
      // Utiliser l'API pour supprimer le lead
      await leadsAPI.delete(id);
      console.log('Lead supprimé via API');
      
      // Mettre à jour l'état local
      const remainingLeads = leads.filter(lead => lead.id !== id);
      
      setLeads(remainingLeads);
      setSelectedLead(null);
    } catch (error) {
      console.error('Erreur lors de la suppression du lead:', error);
      alert("Une erreur est survenue lors de la suppression du lead.");
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
      alert("Une erreur est survenue lors de l'ajout du contact.");
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
      alert("Une erreur est survenue lors de la mise à jour du contact.");
    }
  };

  // Suppression d'un contact via l'API
  const handleDeleteContact = async (leadId, contactId) => {
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
      alert("Une erreur est survenue lors de la suppression du contact.");
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <motion.div
          className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="mb-6">
        <motion.h1 
          className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Leads & Contacts
        </motion.h1>
        <motion.p 
          className="text-indigo-200 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Gérez vos prospects et opportunités
        </motion.p>
      </header>

      <div className="flex flex-grow h-[calc(100%-80px)] overflow-hidden">
        {/* Panneau de gauche: Liste des leads */}
        <motion.div 
          className="w-1/3 pr-4 overflow-hidden flex flex-col"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Vos Leads</h2>
            <motion.button
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-full flex items-center"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleAddLead}
            >
              <span className="mr-1">+</span> Nouveau Lead
            </motion.button>
          </div>
          
          <LeadFilter filters={filters} setFilters={setFilters} />
          
          <div className="flex-grow overflow-y-auto pr-2 space-y-3 mt-4">
            <AnimatePresence>
              {filteredLeads.length > 0 ? (
                filteredLeads.map((lead) => (
                  <motion.div
                    key={lead.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                    layout
                  >
                    <LeadCard 
                      lead={lead}
                      isSelected={selectedLead && selectedLead.id === lead.id}
                      onClick={() => handleSelectLead(lead)}
                    />
                  </motion.div>
                ))
              ) : (
                <EmptyState 
                  icon="👥"
                  title="Aucun lead trouvé"
                  description="Ajoutez de nouveaux leads ou modifiez vos filtres."
                />
              )}
            </AnimatePresence>
          </div>
        </motion.div>
        
        {/* Panneau de droite: Détails du lead ou formulaire d'ajout */}
        <motion.div 
          className="w-2/3 pl-4 overflow-hidden"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="bg-gray-800/30 backdrop-blur-sm rounded-2xl p-6 h-full overflow-y-auto">
            <AnimatePresence mode="wait">
              {isAddingLead ? (
                <motion.div
                  key="add-form"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <LeadForm 
                    onSave={handleSaveLead}
                    onCancel={() => setIsAddingLead(false)}
                  />
                </motion.div>
              ) : selectedLead ? (
                <motion.div
                  key={`lead-${selectedLead.id}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <LeadDetails 
                    lead={selectedLead}
                    onUpdate={(updatedData) => handleUpdateLead(selectedLead.id, updatedData)}
                    onDelete={() => handleDeleteLead(selectedLead.id)}
                    onAddContact={(contactData) => handleAddContact(selectedLead.id, contactData)}
                    onUpdateContact={(contactId, updatedData) => 
                      handleUpdateContact(selectedLead.id, contactId, updatedData)
                    }
                    onDeleteContact={(contactId) => 
                      handleDeleteContact(selectedLead.id, contactId)
                    }
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="empty-state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex items-center justify-center"
                >
                  <EmptyState 
                    icon="✨"
                    title="Sélectionnez un lead"
                    description="Choisissez un lead dans la liste ou créez-en un nouveau."
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Leads;