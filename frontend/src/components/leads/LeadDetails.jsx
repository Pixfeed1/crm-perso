// src/components/leads/LeadDetails.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiStar, FiEye, FiCheckCircle, FiMessageCircle, FiAward, FiXCircle, FiHelpCircle, FiClipboard, FiBuilding, FiUser, FiFileText, FiUsers, FiEdit2, FiTrash2 } from 'react-icons/fi';

// Sous-composants
import ContactList from './ContactList';
import ContactForm from './ContactForm';

const LeadDetails = ({ lead, onUpdate, onDelete, onAddContact }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
    text: 'text-gray-300',
    border: 'border-gray-500/30',
    icon: <FiHelpCircle />
  };
  
  // Mise à jour du statut du lead
  const handleStatusChange = async (newStatus) => {
    try {
      await onUpdate({ status: newStatus });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut:', error);
    }
  };
  
  // Sauvegarde des modifications du lead
  const handleSaveEdit = async (formData) => {
    try {
      await onUpdate(formData);
      setIsEditing(false);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du lead:', error);
    }
  };
  
  // Sauvegarde d'un nouveau contact
  const handleSaveContact = async (contactData) => {
    try {
      await onAddContact(contactData);
      setIsAddingContact(false);
    } catch (error) {
      console.error('Erreur lors de l\'ajout du contact:', error);
    }
  };
  
  // Confirmation et suppression du lead
  const handleConfirmDelete = async () => {
    try {
      await onDelete();
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Erreur lors de la suppression du lead:', error);
    }
  };

  return (
    <div>
      {/* En-tête avec actions */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
            {lead.name}
          </h2>
          {lead.type === 'company' && lead.company && (
            <div className="text-lg text-indigo-300 mt-1">{lead.company}</div>
          )}
        </div>
        
        <div className="flex space-x-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300"
            onClick={() => setIsEditing(true)}
          >
            <FiEdit2 />
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-2 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-300"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <FiTrash2 />
          </motion.button>
        </div>
      </div>
      
      {/* Informations principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Panneau de gauche */}
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-5">
          <h3 className="text-lg font-medium text-gray-200 mb-4 flex items-center gap-2">
            <FiClipboard />
            Informations
          </h3>

          <div className="space-y-4">
            {/* Type */}
            <div className="flex justify-between">
              <span className="text-gray-400">Type</span>
              <span className="font-medium text-white flex items-center gap-2">
                {lead.type === 'company' ? <><FiBuilding /> Entreprise</> : <><FiUser /> Particulier</>}
              </span>
            </div>
            
            {/* Statut avec menu déroulant */}
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Statut</span>
              
              <div className="relative group">
                <button 
                  className={`flex items-center px-3 py-1 rounded-full ${statusStyle.bg} ${statusStyle.text} border ${statusStyle.border} text-sm font-medium`}
                >
                  <span className="mr-1">{statusStyle.icon}</span>
                  {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                  <span className="ml-1">▼</span>
                </button>
                
                {/* Menu déroulant pour changer le statut */}
                <div className="absolute right-0 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-10 overflow-hidden opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300">
                  {Object.keys(statusConfig).map(status => (
                    <button
                      key={status}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-800 flex items-center ${
                        lead.status === status ? 'bg-gray-800' : ''
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
            <div className="flex justify-between">
              <span className="text-gray-400">Source</span>
              <span className="font-medium text-white">{lead.source || 'Non spécifié'}</span>
            </div>
            
            {/* Date de création */}
            <div className="flex justify-between">
              <span className="text-gray-400">Créé le</span>
              <span className="font-medium text-white">{formatDate(lead.created_at)}</span>
            </div>
          </div>
        </div>
        
        {/* Panneau de droite (Notes) */}
        <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-5">
          <h3 className="text-lg font-medium text-gray-200 mb-4 flex items-center gap-2">
            <FiFileText />
            Notes
          </h3>

          <div className="bg-gray-900/50 rounded-lg p-4 min-h-[120px] text-gray-300">
            {lead.notes || 'Aucune note pour ce lead.'}
          </div>
        </div>
      </div>

      {/* Section Contacts */}
      <div className="bg-gray-800/30 backdrop-blur-sm rounded-xl p-5 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-200 flex items-center gap-2">
            <FiUsers />
            Contacts
          </h3>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 px-3 py-1 rounded-lg text-sm flex items-center"
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
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Popup de confirmation de suppression */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <h3 className="text-xl font-semibold text-white mb-2">Confirmer la suppression</h3>
              <p className="text-gray-300 mb-6">
                Êtes-vous sûr de vouloir supprimer définitivement ce lead ? Cette action ne peut pas être annulée.
              </p>
              
              <div className="flex justify-end space-x-3">
                <motion.button
                  className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Annuler
                </motion.button>
                
                <motion.button
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium"
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
    </div>
  );
};

export default LeadDetails;