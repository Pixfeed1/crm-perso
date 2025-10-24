// src/components/clients/ClientDetails.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FiEdit2, FiTrash2, FiBriefcase, FiUser, FiMail, FiPhone,
  FiMapPin, FiGlobe, FiCalendar, FiDollarSign, FiTag, FiFileText
} from 'react-icons/fi';
import ClientForm from './ClientForm';

const ClientDetails = ({ client, onUpdate, onDelete, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);

  // Format de la date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  };

  // Format de la valeur
  const formatValue = (value) => {
    if (!value || value === 0) return 'Non définie';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Configuration des statuts
  const statusConfig = {
    active: {
      bg: 'bg-green-500/20',
      text: 'text-green-300',
      border: 'border-green-500/30',
      label: 'Actif'
    },
    inactive: {
      bg: 'bg-gray-500/20',
      text: 'text-gray-300',
      border: 'border-gray-500/30',
      label: 'Inactif'
    }
  };

  const statusStyle = statusConfig[client.status] || statusConfig.active;

  // Configuration des types
  const typeConfig = {
    individual: { icon: FiUser, label: 'Particulier' },
    company: { icon: FiBriefcase, label: 'Entreprise' }
  };

  const typeInfo = typeConfig[client.type] || typeConfig.individual;
  const TypeIcon = typeInfo.icon;

  const handleSaveEdit = async (updatedData) => {
    await onUpdate(client.id, updatedData);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <ClientForm
        client={client}
        onSave={handleSaveEdit}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="bg-gray-800/30 border border-gray-700 rounded-2xl p-6 relative"
    >
      {/* En-tête */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-start gap-4">
          <div className={`w-16 h-16 rounded-xl ${statusStyle.bg} ${statusStyle.text} flex items-center justify-center text-2xl`}>
            <TypeIcon />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{client.name}</h2>
            {client.company && (
              <p className="text-indigo-300 text-lg">{client.company}</p>
            )}
            <div className={`inline-block mt-2 text-xs px-3 py-1 rounded-full ${statusStyle.bg} ${statusStyle.text} font-medium`}>
              {statusStyle.label}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsEditing(true)}
            className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
            title="Modifier"
          >
            <FiEdit2 />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onDelete(client.id)}
            className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            title="Supprimer"
          >
            <FiTrash2 />
          </motion.button>
        </div>
      </div>

      {/* Informations principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Type */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-gray-700/50 rounded-lg flex items-center justify-center">
            <TypeIcon className="text-indigo-400" />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Type</div>
            <div className="text-white">{typeInfo.label}</div>
          </div>
        </div>

        {/* Email */}
        {client.email && (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gray-700/50 rounded-lg flex items-center justify-center">
              <FiMail className="text-blue-400" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Email</div>
              <a href={`mailto:${client.email}`} className="text-blue-400 hover:underline">
                {client.email}
              </a>
            </div>
          </div>
        )}

        {/* Téléphone */}
        {client.phone && (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gray-700/50 rounded-lg flex items-center justify-center">
              <FiPhone className="text-green-400" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Téléphone</div>
              <a href={`tel:${client.phone}`} className="text-white">
                {client.phone}
              </a>
            </div>
          </div>
        )}

        {/* Adresse */}
        {client.address && (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gray-700/50 rounded-lg flex items-center justify-center">
              <FiMapPin className="text-red-400" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Adresse</div>
              <div className="text-white">{client.address}</div>
            </div>
          </div>
        )}

        {/* Site web */}
        {client.website && (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gray-700/50 rounded-lg flex items-center justify-center">
              <FiGlobe className="text-purple-400" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Site web</div>
              <a
                href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:underline"
              >
                {client.website}
              </a>
            </div>
          </div>
        )}

        {/* Industrie */}
        {client.industry && (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gray-700/50 rounded-lg flex items-center justify-center">
              <FiBriefcase className="text-yellow-400" />
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Industrie</div>
              <div className="text-white">{client.industry}</div>
            </div>
          </div>
        )}
      </div>

      {/* Informations financières et dates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-900/50 rounded-xl">
        <div>
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <FiDollarSign />
            <span>Valeur vie client</span>
          </div>
          <div className="text-xl font-semibold text-green-400">
            {formatValue(client.lifetime_value)}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <FiCalendar />
            <span>Début contrat</span>
          </div>
          <div className="text-white">
            {client.contract_start_date ? formatDate(client.contract_start_date) : 'N/A'}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <FiCalendar />
            <span>Client depuis</span>
          </div>
          <div className="text-white">
            {formatDate(client.created_at)}
          </div>
        </div>
      </div>

      {/* Source */}
      {client.source && (
        <div className="mb-6">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            <FiTag />
            <span>Source</span>
          </div>
          <div className="inline-block px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-lg text-sm">
            {client.source}
          </div>
        </div>
      )}

      {/* Tags */}
      {client.tags && (
        <div className="mb-6">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            <FiTag />
            <span>Tags</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {client.tags.split(',').map((tag, index) => (
              <div
                key={index}
                className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-lg text-sm"
              >
                {tag.trim()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {client.notes && (
        <div>
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
            <FiFileText />
            <span>Notes</span>
          </div>
          <div className="p-4 bg-gray-900/50 rounded-xl text-gray-300 whitespace-pre-wrap">
            {client.notes}
          </div>
        </div>
      )}

      {/* Projets et revenus associés */}
      {((client.projects && client.projects.length > 0) || (client.revenues && client.revenues.length > 0)) && (
        <div className="mt-6 pt-6 border-t border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Données associées</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {client.projects && client.projects.length > 0 && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                <div className="text-blue-400 text-sm mb-1">Projets</div>
                <div className="text-white text-2xl font-bold">{client.projects.length}</div>
              </div>
            )}
            {client.revenues && client.revenues.length > 0 && (
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                <div className="text-green-400 text-sm mb-1">Revenus</div>
                <div className="text-white text-2xl font-bold">{client.revenues.length}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ClientDetails;
