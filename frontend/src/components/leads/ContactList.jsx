// src/components/leads/ContactList.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUser, FiMail, FiPhone, FiFileText, FiChevronDown } from 'react-icons/fi';

const ContactList = ({ contacts = [], leadType }) => {
  const [expandedContact, setExpandedContact] = useState(null);

  // Bascule de l'expansion d'un contact
  const toggleExpand = (contactId) => {
    setExpandedContact(expandedContact === contactId ? null : contactId);
  };

  // Si aucun contact n'est disponible
  if (contacts.length === 0) {
    return (
      <div className="bg-gray-900/30 rounded-lg p-6 text-center">
        <div className="text-4xl mb-3"><FiUser /></div>
        <h4 className="text-lg font-medium text-gray-300 mb-2">Aucun contact</h4>
        <p className="text-gray-400 text-sm">
          {leadType === 'company'
            ? "Ajoutez des contacts pour cette entreprise."
            : "Ajoutez des informations de contact pour ce prospect."
          }
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {contacts.map((contact) => (
        <motion.div
          key={contact.id}
          className="bg-gray-900/30 rounded-lg overflow-hidden"
          layout
        >
          {/* En-tête du contact (toujours visible) */}
          <div 
            className="p-4 cursor-pointer flex justify-between items-center"
            onClick={() => toggleExpand(contact.id)}
          >
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-full bg-indigo-800 flex items-center justify-center text-lg font-medium text-white border border-indigo-700">
                {contact.name.charAt(0)}
              </div>
              <div className="ml-3">
                <h4 className="font-medium text-gray-200">{contact.name}</h4>
                {contact.position && (
                  <p className="text-sm text-indigo-300">{contact.position}</p>
                )}
              </div>
            </div>
            
            <motion.button
              className="text-gray-400 hover:text-white"
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
                <div className="p-4 pt-3 space-y-3">
                  {/* Email */}
                  {contact.email && (
                    <div className="flex items-start">
                      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 mr-3">
                        <FiMail />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Email</p>
                        <a
                          href={`mailto:${contact.email}`}
                          className="text-indigo-300 hover:text-indigo-200 transition-colors"
                        >
                          {contact.email}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Téléphone */}
                  {contact.phone && (
                    <div className="flex items-start">
                      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 mr-3">
                        <FiPhone />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Téléphone</p>
                        <a
                          href={`tel:${contact.phone}`}
                          className="text-indigo-300 hover:text-indigo-200 transition-colors"
                        >
                          {contact.phone}
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {contact.notes && (
                    <div className="flex items-start">
                      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 mr-3">
                        <FiFileText />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Notes</p>
                        <p className="text-gray-300">{contact.notes}</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Actions */}
                  <div className="flex justify-end mt-2 pt-2 border-t border-gray-700/30">
                    <motion.button
                      className="text-sm text-indigo-300 hover:text-indigo-200 px-3 py-1 rounded-lg hover:bg-indigo-900/30"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Éditer
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
};

export default ContactList;