// src/components/leads/LeadDetails.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiStar, FiEye, FiCheckCircle, FiMessageCircle, FiAward, FiXCircle, FiHelpCircle, FiClipboard, FiBriefcase, FiUser, FiFileText, FiUsers, FiEdit2, FiTrash2, FiUserCheck } from 'react-icons/fi';
import { leadsAPI, clientsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';

// Sous-composants
import ContactList from './ContactList';
import ContactForm from './ContactForm';
import ContactFollowup from '../common/ContactFollowup';
import ProspectEmails from './ProspectEmails';
import LeadForm from './LeadForm';
import ConfirmModal from '../common/ConfirmModal';

const LeadDetails = ({ lead, onUpdate, onDelete, onAddContact, onUpdateContact, onDeleteContact, onAddInteraction, onUpdateInteraction, onDeleteInteraction }) => {
  const { toast } = useToast();
  const { confirm, confirmState } = useConfirm();
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  // Format de la date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  };

  // Configuration des couleurs de statut
  const statusConfig = {
    nouveau: {
      bg: 'bg-blue-500/20',
      text: 'text-blue-300',
      border: 'border-blue-500/30',
      icon: <FiStar />
    },
    prospect: {
      bg: 'bg-purple-500/20',
      text: 'text-purple-300',
      border: 'border-purple-500/30',
      icon: <FiEye />
    },
    qualifié: {
      bg: 'bg-emerald-500/20',
      text: 'text-emerald-300',
      border: 'border-emerald-500/30',
      icon: <FiCheckCircle />
    },
    négociation: {
      bg: 'bg-amber-500/20',
      text: 'text-amber-300',
      border: 'border-amber-500/30',
      icon: <FiMessageCircle />
    },
    client: {
      bg: 'bg-teal-500/20',
      text: 'text-teal-300',
      border: 'border-teal-500/30',
      icon: <FiAward />
    },
    perdu: {
      bg: 'bg-rose-500/20',
      text: 'text-rose-300',
      border: 'border-rose-500/30',
      icon: <FiXCircle />
    }
  };

  // Valeurs par défaut si le statut n'est pas configuré
  const statusStyle = statusConfig[lead.status] || {
    bg: 'bg-gray-500/20',
    text: 'text-text-secondary',
    border: 'border-gray-500/30',
    icon: <FiHelpCircle />
  };
  
  // Mise à jour du statut du lead
  const handleStatusChange = async (newStatus) => {
    try {
      await onUpdate(lead.id, { status: newStatus });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
    }
  };
  
  // Sauvegarde des modifications du lead
  const handleSaveEdit = async (formData) => {
    try {
      await onUpdate(lead.id, formData);
      setIsEditing(false);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du lead:', error);
    }
  };
  
  // Sauvegarde d'un nouveau contact
  const handleSaveContact = async (contactData) => {
    try {
      await onAddContact(lead.id, contactData);
      setIsAddingContact(false);
    } catch (error) {
      console.error('Erreur lors de l\'ajout du contact:', error);
    }
  };


  // Confirmation et suppression du lead
  const handleConfirmDelete = async () => {
    try {
      await onDelete(lead.id);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Erreur lors de la suppression du lead:', error);
    }
  };

  // Conversion du lead en client
  const handleConvertToClient = async () => {
    const confirmed = await confirm({
      title: "Convertir ce lead en client ?",
      message: "Le lead sera marqué comme 'Gagné' et sera créé comme client dans le module Clients.",
      confirmText: "Convertir",
      cancelText: "Annuler",
      variant: "warning",
      itemName: `${lead.name}${lead.company ? ` (${lead.company})` : ''}`
    });

    if (!confirmed) return;

    setIsConverting(true);
    try {
      const result = await clientsAPI.convertFromLead(lead.id, {
        contract_start_date: new Date().toISOString().split('T')[0],
        notes: lead.notes
      });

      toast.success('Lead converti en client avec succès !');

      // Mettre à jour le statut du lead à "won" (le backend l'a déjà fait)
      // Le lead reste dans la base pour les statistiques mais disparaît de la vue
      await onUpdate(lead.id, { status: 'won' });

    } catch (error) {
      console.error('Erreur lors de la conversion du lead:', error);
      if (error.message.includes('déjà été converti')) {
        toast.warning('Ce lead a déjà été converti en client');
      } else {
        toast.error('Erreur lors de la conversion du lead en client');
      }
    } finally {
      setIsConverting(false);
    }
  };

  // Créer un client particulier depuis un contact
  const handleCreateClient = async (result) => {
    try {
      toast.success('Client créé et lié au contact avec succès !');
      // Recharger les contacts pour afficher le nouveau lien
      if (onUpdate) {
        await onUpdate(lead.id, {});
      }
    } catch (error) {
      console.error('Erreur lors de la création du client:', error);
      toast.error('Échec de la création du client');
    }
  };

  // Lier un contact à un client existant
  const handleLinkClient = async (result) => {
    try {
      toast.success('Contact lié au client avec succès !');
      // Recharger les contacts pour afficher le nouveau lien
      if (onUpdate) {
        await onUpdate(lead.id, {});
      }
    } catch (error) {
      console.error('Erreur lors de la liaison:', error);
      toast.error('Échec de la liaison');
    }
  };

  // Délier un contact de son client
  const handleUnlinkClient = async (contactId) => {
    const confirmed = await confirm({
      title: "Délier le contact du client ?",
      message: "Le contact ne sera plus associé à son profil client particulier. Le client ne sera pas supprimé.",
      confirmText: "Délier",
      cancelText: "Annuler",
      variant: "warning"
    });

    if (!confirmed) return;

    try {
      await leadsAPI.unlinkContactFromClient(lead.id, contactId);
      toast.success('Contact délié du client avec succès !');

      // Recharger les contacts
      if (onUpdate) {
        await onUpdate(lead.id, {});
      }
    } catch (error) {
      console.error('Erreur lors du déliaison:', error);
      toast.error(error.response?.data?.message || 'Échec du déliaison');
    }
  };

  // Si en mode édition, afficher le formulaire
  if (isEditing) {
    return (
      <LeadForm
        lead={lead}
        onSave={handleSaveEdit}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <div>
      {/* En-tête avec actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300 break-words">
            {lead.name}
          </h2>
          {lead.type === 'company' && lead.company && (
            <div className="text-base sm:text-lg text-indigo-300 mt-1">{lead.company}</div>
          )}
        </div>

        <div className="flex space-x-2 flex-shrink-0">
          {/* Bouton "Convertir en client" - visible uniquement si le lead n'est pas déjà gagné ou perdu */}
          {lead.status !== 'won' && lead.status !== 'lost' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-3 py-2 rounded-lg bg-green-600/30 hover:bg-green-600/50 text-green-300 flex items-center gap-2 text-sm"
              onClick={handleConvertToClient}
              disabled={isConverting}
            >
              <FiUserCheck className="text-base" />
              <span className="hidden sm:inline">{isConverting ? 'Conversion...' : 'Convertir'}</span>
            </motion.button>
          )}

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-accent/30 hover:bg-accent/50 text-indigo-300"
            onClick={() => setIsEditing(true)}
          >
            <FiEdit2 className="text-base sm:text-lg" />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-300"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <FiTrash2 className="text-base sm:text-lg" />
          </motion.button>
        </div>
      </div>

      {/* Informations principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
        {/* Panneau de gauche */}
        <div className="bg-surface/30 rounded-xl p-4 sm:p-5 overflow-visible">
          <h3 className="text-base sm:text-lg font-medium text-text-primary mb-3 sm:mb-4 flex items-center gap-2">
            <FiClipboard className="text-base sm:text-lg" />
            Informations
          </h3>

          <div className="space-y-3 sm:space-y-4">
            {/* Type */}
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm sm:text-base">Type</span>
              <span className="font-medium text-text-primary flex items-center gap-1 sm:gap-2 text-sm sm:text-base">
                {lead.type === 'company' ? <><FiBriefcase className="text-sm sm:text-base text-text-primary" /> <span className="text-text-primary">Entreprise</span></> : <><FiUser className="text-sm sm:text-base text-text-primary" /> <span className="text-text-primary">Particulier</span></>}
              </span>
            </div>

            {/* Statut avec menu déroulant */}
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm sm:text-base">Statut</span>

              <div className="relative group">
                <button
                  className={`flex items-center px-2 sm:px-3 py-1 rounded-full ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border} text-xs sm:text-sm font-medium`}
                >
                  <span className="mr-1 text-xs sm:text-sm text-text-primary">{statusStyle.icon}</span>
                  {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                  <span className="ml-1">▼</span>
                </button>

                {/* Menu déroulant pour changer le statut */}
                <div className="absolute right-0 mt-2 w-40 sm:w-48 bg-surface-muted border border-border rounded-lg shadow-lg z-50 overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300">
                  {Object.keys(statusConfig).map(status => (
                    <button
                      key={status}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-surface flex items-center ${
                        lead.status === status ? 'bg-surface' : ''
                      }`}
                      onClick={() => handleStatusChange(status)}
                    >
                      <span className="mr-2">{statusConfig[status].icon}</span>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Source */}
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm sm:text-base">Source</span>
              <span className="font-medium text-text-primary text-sm sm:text-base">{lead.source || 'Non spécifié'}</span>
            </div>

            {/* Date de création */}
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm sm:text-base">Créé le</span>
              <span className="font-medium text-text-primary text-sm sm:text-base">{formatDate(lead.created_at)}</span>
            </div>
          </div>
        </div>
        
        {/* Panneau de droite (Notes) */}
        <div className="bg-surface/30 backdrop-blur-sm rounded-xl p-4 sm:p-5">
          <h3 className="text-base sm:text-lg font-medium text-text-primary mb-3 sm:mb-4 flex items-center gap-2">
            <FiFileText className="text-base sm:text-lg" />
            Notes
          </h3>

          <div className="bg-surface-muted/50 rounded-lg p-3 sm:p-4 min-h-[100px] sm:min-h-[120px] text-text-secondary text-sm sm:text-base">
            {lead.notes || 'Aucune note pour ce lead.'}
          </div>
        </div>
      </div>

      {/* Section Contacts */}
      <div className="bg-surface/30 backdrop-blur-sm rounded-xl p-4 sm:p-5 mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 sm:mb-4 gap-3">
          <h3 className="text-base sm:text-lg font-medium text-text-primary flex items-center gap-2">
            <FiUsers className="text-base sm:text-lg" />
            Contacts
          </h3>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-accent/30 hover:bg-accent/50 text-indigo-300 px-3 py-1.5 sm:py-1 rounded-lg text-xs sm:text-sm flex items-center whitespace-nowrap"
            onClick={() => setIsAddingContact(true)}
          >
            <span className="mr-1">+</span>
            Ajouter un contact
          </motion.button>
        </div>

        {/* Liste des contacts ou formulaire d'ajout */}
        <AnimatePresence mode="wait">
          {isAddingContact ? (
            <motion.div
              key="contact-form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ContactForm
                onSave={handleSaveContact}
                onCancel={() => setIsAddingContact(false)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="contact-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ContactList
                contacts={lead.contacts || []}
                leadType={lead.type}
                leadId={lead.id}
                onUpdateContact={onUpdateContact}
                onDeleteContact={onDeleteContact}
                onCreateClient={handleCreateClient}
                onLinkClient={handleLinkClient}
                onUnlinkClient={handleUnlinkClient}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Suivi des prises de contact — système UNIQUE (table interactions) :
          statut, dernier contact, prochaine relance, boutons rapides + timeline complète
          (« Voir tout l'historique »). Remplace l'ancien « Historique des interactions »
          qui lisait une autre table (lead_interactions) et créait un doublon. */}
      <ContactFollowup contactType="lead" contactId={lead.id} phone={lead.phone} />

      {/* Emails : modèle éditable + signature, envoi immédiat ou programmé */}
      <ProspectEmails lead={lead} />

      {/* Popup de confirmation de suppression */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-surface-muted border border-border rounded-xl p-4 sm:p-6 max-w-md w-full"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <h3 className="text-lg sm:text-xl font-semibold text-text-primary mb-2">Confirmer la suppression</h3>
              <p className="text-text-secondary text-sm sm:text-base mb-4 sm:mb-6">
                Êtes-vous sûr de vouloir supprimer définitivement ce lead ? Cette action ne peut pas être annulée.
              </p>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
                <motion.button
                  className="px-4 py-2 rounded-lg border-2 border-overlay/30 text-text-primary hover:bg-overlay/10 hover:border-overlay/40 font-medium transition-all text-sm sm:text-base"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Annuler
                </motion.button>

                <motion.button
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm sm:text-base"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleConfirmDelete}
                >
                  Supprimer
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de confirmation pour la conversion */}
      <ConfirmModal {...confirmState.config} isOpen={confirmState.isOpen} />
    </div>
  );
};

export default LeadDetails;