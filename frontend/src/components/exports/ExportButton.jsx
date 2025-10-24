// src/components/exports/ExportButton.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiDownload, FiFileText, FiFile } from 'react-icons/fi';

/**
 * Composant bouton d'export réutilisable
 * Gère le téléchargement de fichiers Excel et PDF
 */
const ExportButton = ({ type = 'excel', endpoint, filename, label, icon: CustomIcon, className = '' }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000${endpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'export');
      }

      // Récupérer le blob
      const blob = await response.blob();

      // Créer un lien de téléchargement
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `export-${Date.now()}.${type === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erreur lors de l\'export:', err);
      setError('Impossible d\'exporter les données');
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsExporting(false);
    }
  };

  const Icon = CustomIcon || (type === 'pdf' ? FiFileText : FiFile);

  const colorClasses = type === 'pdf'
    ? 'from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600'
    : 'from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600';

  return (
    <div className="relative inline-block">
      <motion.button
        onClick={handleExport}
        disabled={isExporting}
        className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r ${colorClasses} text-white rounded-lg shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        whileHover={{ scale: isExporting ? 1 : 1.05 }}
        whileTap={{ scale: isExporting ? 1 : 0.95 }}
      >
        {isExporting ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Export en cours...</span>
          </>
        ) : (
          <>
            <Icon className="w-4 h-4" />
            <span>{label || `Exporter ${type.toUpperCase()}`}</span>
          </>
        )}
      </motion.button>

      {error && (
        <motion.div
          className="absolute top-full mt-2 left-0 right-0 p-2 bg-rose-500 text-white text-sm rounded-lg shadow-lg"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          {error}
        </motion.div>
      )}
    </div>
  );
};

export default ExportButton;
