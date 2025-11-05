// src/components/leads/ContactList.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUser, FiMail, FiPhone, FiFileText, FiChevronDown, FiEdit2, FiTrash2, FiUserCheck, FiLink, FiExternalLink, FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import ContactForm from './ContactForm';
import ContactClientModal from './ContactClientModal';

const ContactList = ({
  contacts = [],
  leadType,
  leadId,
  onUpdateContact,
  onDeleteContact,
  onCreateClient,
  onLinkClient,
  onUnlinkClient
}) => {
  const navigate = useNavigate();
  const [expandedContact, setExpandedContact] = useState(null);
  const [editingContact, setEditingContact] = useState(null);
  const [deletingContact, setDeletingContact] = useState(null);
  const [clientModalContact, setClientModalContact] = useState(null);

  // Bascule de l'expansion d'un contact
  const toggleExpand = (contactId) => {
    setExpandedContact(expandedContact === contactId ? null : contactId);
  };

  // Gérer la sauvegarde d'un contact édité
  const handleSaveEdit = async (contactData) => {
    if (onUpdateContact) {
      await onUpdateContact(leadId, editingContact.id, contactData);
    }
    setEditingContact(null);
  };

  // Confirmer la suppression
  const handleConfirmDelete = async () => {
    if (onDeleteContact && deletingContact) {
      await onDeleteContact(leadId, deletingContact.id);
    }
    setDeletingContact(null);
  };

  // Si aucun contact n'est disponible
  if (contacts.length === 0) {
    return (
      <div className="bg-gray-900/30 rounded-lg p-4 sm:p-6 text-center">
        <div className="text-3xl sm:text-4xl mb-3"><FiUser /></div>
        <h4 className="text-base sm:text-lg font-medium text-gray-300 mb-2">Aucun contact</h4>
        <p className="text-gray-400 text-xs sm:text-sm">
          {leadType === 'company'
            ? "Ajoutez des contacts pour cette entreprise."
            : "Ajoutez des informations de contact pour ce prospect."
          }
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 sm:space-y-3">
        {contacts.map((contact) => (
          <motion.div
            key={contact.id}
            className="bg-gray-900/30 rounded-lg overflow-hidden"
            layout
          >
            {/* En-tête du contact (toujours visible) */}
            <div
              className="p-3 sm:p-4 cursor-pointer flex justify-between items-center hover:bg-gray-900/50 transition-colors"
              onClick={() => toggleExpand(contact.id)}
            >
              <div className="flex items-center min-w-0 flex-1">
                <div className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0 rounded-full bg-indigo-800 flex items-center justify-center text-sm sm:text-lg font-medium text-white border border-indigo-700">
                  {contact.name.charAt(0)}
                </div>
                <div className="ml-2 sm:ml-3 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-gray-200 text-sm sm:text-base truncate">{contact.name}</h4>
                    {contact.client_id && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-medium"
                        title="Ce contact est aussi client particulier"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/clients?id=${contact.client_id}`);
                        }}
                      >
                        <FiUserCheck className="text-xs" />
                        Client
                      </span>
                    )}
                  </div>
                  {contact.position && (
                    <p className="text-xs sm:text-sm text-indigo-300 truncate">{contact.position}</p>
                  )}
                </div>
              </div>

              <motion.button
                className="text-gray-400 hover:text-white ml-2 flex-shrink-0"
                animate={{ rotate: expandedContact === contact.id ? 180 : 0 }}
                transition={{ duration: 0.3 }}
              >
                <FiChevronDown />
              </motion.button>
            </div>

            {/* Détails du contact (conditionnellement visibles) */}
            <AnimatePresence>
              {expandedContact === contact.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden border-t border-gray-700/50"
                >
                  <div className="p-3 sm:p-4 pt-3 space-y-3">
                    {/* Email */}
                    {contact.email && (
                      <div className="flex items-start">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 mr-2 sm:mr-3">
                          <FiMail className="text-sm sm:text-base text-indigo-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-400 mb-1">Email</p>
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-indigo-300 hover:text-indigo-200 transition-colors text-sm break-all"
                          >
                            {contact.email}
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Téléphone */}
                    {contact.phone && (
                      <div className="flex items-start">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 mr-2 sm:mr-3">
                          <FiPhone className="text-sm sm:text-base text-green-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-400 mb-1">Téléphone</p>
                          <a
                            href={`tel:${contact.phone}`}
                            className="text-indigo-300 hover:text-indigo-200 transition-colors text-sm"
                          >
                            {contact.phone}
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {contact.notes && (
                      <div className="flex items-start">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 mr-2 sm:mr-3">
                          <FiFileText className="text-sm sm:text-base text-purple-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-400 mb-1">Notes</p>
                          <p className="text-gray-300 text-sm">{contact.notes}</p>
                        </div>
                      </div>
                    )}

                    {/* Statut Client */}
                    {contact.client_id && (
                      <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <FiUserCheck className="text-emerald-400" />
                          <span className="text-sm font-medium text-emerald-300">Client particulier</span>
                        </div>
                        <p className="text-xs text-gray-400">
                          Ce contact a aussi un profil client pour ses besoins personnels
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row justify-between gap-2 mt-2 pt-2 border-t border-gray-700/30">
                      {/* Actions principales */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <motion.button
                          className="text-xs sm:text-sm text-indigo-300 hover:text-indigo-200 px-3 py-1.5 sm:py-1 rounded-lg hover:bg-indigo-900/30 flex items-center justify-center gap-1"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingContact(contact);
                          }}
                        >
                          <FiEdit2 className="text-xs" />
                          Éditer
                        </motion.button>
                        <motion.button
                          className="text-xs sm:text-sm text-rose-300 hover:text-rose-200 px-3 py-1.5 sm:py-1 rounded-lg hover:bg-rose-900/30 flex items-center justify-center gap-1"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingContact(contact);
                          }}
                        >
                          <FiTrash2 className="text-xs" />
                          Supprimer
                        </motion.button>
                      </div>

                      {/* Actions client */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        {contact.client_id ? (
                          <>
                            <motion.button
                              className="text-xs sm:text-sm text-emerald-300 hover:text-emerald-200 px-3 py-1.5 sm:py-1 rounded-lg hover:bg-emerald-900/30 flex items-center justify-center gap-1"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/clients?id=${contact.client_id}`);
                              }}
                            >
                              <FiExternalLink className="text-xs" />
                              Voir le client
                            </motion.button>
                            <motion.button
                              className="text-xs sm:text-sm text-amber-300 hover:text-amber-200 px-3 py-1.5 sm:py-1 rounded-lg hover:bg-amber-900/30 flex items-center justify-center gap-1"
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onUnlinkClient) {
                                  onUnlinkClient(contact.id);
                                }
                              }}
                            >
                              <FiX className="text-xs" />
                              Délier du client
                            </motion.button>
                          </>
                        ) : (
                          <motion.button
                            className="text-xs sm:text-sm text-emerald-300 hover:text-emerald-200 px-3 py-1.5 sm:py-1 rounded-lg hover:bg-emerald-900/30 flex items-center justify-center gap-1"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setClientModalContact(contact);
                            }}
                          >
                            <FiLink className="text-xs" />
                            Créer profil client
                          </motion.button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>

      {/* Modal d'édition */}
      <AnimatePresence>
        {editingContact && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditingContact(null)}
          >
            <motion.div
              className="bg-gray-900 border border-gray-700 rounded-xl p-4 sm:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-4">Éditer le contact</h3>
              <ContactForm
                contact={editingContact}
                onSave={handleSaveEdit}
                onCancel={() => setEditingContact(null)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de confirmation de suppression */}
      <AnimatePresence>
        {deletingContact && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-gray-900 border border-gray-700 rounded-xl p-4 sm:p-6 max-w-md w-full"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">Confirmer la suppression</h3>
              <p className="text-gray-300 text-sm sm:text-base mb-4 sm:mb-6">
                Êtes-vous sûr de vouloir supprimer le contact <strong>{deletingContact.name}</strong> ?
              </p>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
                <motion.button
                  className="px-4 py-2 rounded-lg border-2 border-white/30 text-white hover:bg-white/10 hover:border-white/40 font-medium transition-all text-sm sm:text-base"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setDeletingContact(null)}
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

      {/* Modal de création/liaison client */}
      <AnimatePresence>
        {clientModalContact && (
          <ContactClientModal
            contact={clientModalContact}
            leadId={leadId}
            onClose={() => setClientModalContact(null)}
            onCreateClient={onCreateClient}
            onLinkClient={onLinkClient}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default ContactList;
