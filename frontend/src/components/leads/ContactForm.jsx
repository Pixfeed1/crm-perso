// src/components/leads/ContactForm.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';

const ContactForm = ({ contact = {}, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: contact.name || '',
    position: contact.position || '',
    email: contact.email || '',
    phone: contact.phone || '',
    notes: contact.notes || '',
    is_primary: contact.is_primary || false
  });
  
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  
  // Mise à jour des champs du formulaire
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Effacer les erreurs lors de la saisie
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };
  
  // Validation du formulaire
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Le nom est requis';
    }
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Format d\'email invalide';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  // Soumission du formulaire
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    try {
      setSubmitting(true);
      await onSave(formData);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-900/40 rounded-lg p-5">
      <h4 className="text-lg font-medium text-indigo-300 mb-4">
        {contact.id ? 'Modifier le contact' : 'Nouveau contact'}
      </h4>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Nom */}
          <div>
            <label htmlFor="contact-name" className="block text-sm font-medium text-gray-300 mb-1">
              Nom<span className="text-rose-500 ml-1">*</span>
            </label>
            <input
              type="text"
              id="contact-name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={`w-full bg-gray-800/50 border ${
                errors.name ? 'border-rose-500' : 'border-gray-700'
              } rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
              placeholder="John Doe"
            />
            {errors.name && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-1 text-xs text-rose-500"
              >
                {errors.name}
              </motion.p>
            )}
          </div>
          
          {/* Poste / Fonction */}
          <div>
            <label htmlFor="contact-position" className="block text-sm font-medium text-gray-300 mb-1">
              Fonction
            </label>
            <input
              type="text"
              id="contact-position"
              name="position"
              value={formData.position}
              onChange={handleInputChange}
              className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="CTO, Manager, etc."
            />
          </div>
          
          {/* Email */}
          <div>
            <label htmlFor="contact-email" className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              id="contact-email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className={`w-full bg-gray-800/50 border ${
                errors.email ? 'border-rose-500' : 'border-gray-700'
              } rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent`}
              placeholder="john@example.com"
            />
            {errors.email && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-1 text-xs text-rose-500"
              >
                {errors.email}
              </motion.p>
            )}
          </div>
          
          {/* Téléphone */}
          <div>
            <label htmlFor="contact-phone" className="block text-sm font-medium text-gray-300 mb-1">
              Téléphone
            </label>
            <input
              type="tel"
              id="contact-phone"
              name="phone"
              value={formData.phone}
              onChange={handleInputChange}
              className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="+33 6 12 34 56 78"
            />
          </div>
        </div>
        
        {/* Notes */}
        <div>
          <label htmlFor="contact-notes" className="block text-sm font-medium text-gray-300 mb-1">
            Notes
          </label>
          <textarea
            id="contact-notes"
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={3}
            className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Informations supplémentaires sur ce contact..."
          />
        </div>
        
        {/* Contact principal */}
        <div className="flex items-center">
          <input
            type="checkbox"
            id="contact-is-primary"
            name="is_primary"
            checked={formData.is_primary}
            onChange={handleInputChange}
            className="w-4 h-4 text-indigo-600 border-gray-700 rounded focus:ring-indigo-500"
          />
          <label htmlFor="contact-is-primary" className="ml-2 text-sm text-gray-300">
            Contact principal
          </label>
        </div>
        
        {/* Boutons d'action */}
        <div className="flex justify-end space-x-3 pt-2">
          <motion.button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border-2 border-white/30 text-white hover:bg-white/10 hover:border-white/40 font-medium transition-all"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={submitting}
          >
            Annuler
          </motion.button>
          
          <motion.button
            type="submit"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium flex items-center"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <motion.div
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                Enregistrement...
              </>
            ) : (
              <>Enregistrer</>
            )}
          </motion.button>
        </div>
      </form>
    </div>
  );
};

export default ContactForm;