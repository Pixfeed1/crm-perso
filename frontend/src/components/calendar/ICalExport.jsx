import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiDownload,
  FiX,
  FiCalendar,
  FiFilter,
  FiCheck,
  FiClock
} from 'react-icons/fi';

const ICalExport = ({ onClose, currentView }) => {
  const [exportType, setExportType] = useState('all'); // 'all', 'range', 'category'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState('');
  const [calendarName, setCalendarName] = useState('Mon Calendrier CRM');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const categories = [
    'Réunion',
    'Appel',
    'Tâche',
    'Rendez-vous',
    'Formation',
    'Autre'
  ];

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);

    try {
      const token = localStorage.getItem('token');
      let url = '/api/events/export/calendar';
      let params = new URLSearchParams();

      if (calendarName) {
        params.append('calendar_name', calendarName);
      }

      if (exportType === 'range' && startDate && endDate) {
        params.append('start_date', startDate);
        params.append('end_date', endDate);
      } else if (exportType === 'category' && category) {
        url = `/api/events/export/category/${category}`;
      }

      const queryString = params.toString();
      const fullUrl = queryString ? `${url}?${queryString}` : url;

      const response = await fetch(fullUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'export');
      }

      // Télécharger le fichier
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;

      // Extraire le nom de fichier de l'en-tête Content-Disposition
      const contentDisposition = response.headers.get('Content-Disposition');
      let fileName = 'calendar.ics';
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
        if (fileNameMatch && fileNameMatch[1]) {
          fileName = fileNameMatch[1];
        }
      }

      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setExportSuccess(true);

      // Fermer automatiquement après 2 secondes
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Erreur lors de l\'export:', error);
      alert('Erreur lors de l\'export du calendrier');
    } finally {
      setIsExporting(false);
    }
  };

  const isFormValid = () => {
    if (exportType === 'range') {
      return startDate && endDate && new Date(startDate) <= new Date(endDate);
    }
    if (exportType === 'category') {
      return category;
    }
    return true; // 'all' est toujours valide
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <FiDownload className="text-blue-600 text-xl" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Exporter au format iCal
                </h2>
                <p className="text-sm text-gray-500">
                  Compatible avec Apple, Google, Outlook, etc.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <FiX className="text-2xl" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Nom du calendrier */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom du calendrier
              </label>
              <input
                type="text"
                value={calendarName}
                onChange={(e) => setCalendarName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Mon Calendrier CRM"
              />
            </div>

            {/* Type d'export */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Que souhaitez-vous exporter ?
              </label>
              <div className="space-y-3">
                {/* Tous les événements */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    exportType === 'all'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setExportType('all')}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        exportType === 'all'
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}
                    >
                      {exportType === 'all' && (
                        <FiCheck className="text-white text-xs" />
                      )}
                    </div>
                    <FiCalendar className="text-gray-600" />
                    <div>
                      <div className="font-medium text-gray-900">
                        Tous les événements
                      </div>
                      <div className="text-sm text-gray-500">
                        Exporter l'intégralité du calendrier
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Plage de dates */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    exportType === 'range'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setExportType('range')}
                >
                  <div className="flex items-center space-x-3 mb-3">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        exportType === 'range'
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}
                    >
                      {exportType === 'range' && (
                        <FiCheck className="text-white text-xs" />
                      )}
                    </div>
                    <FiClock className="text-gray-600" />
                    <div>
                      <div className="font-medium text-gray-900">
                        Plage de dates
                      </div>
                      <div className="text-sm text-gray-500">
                        Exporter une période spécifique
                      </div>
                    </div>
                  </div>

                  {exportType === 'range' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="ml-8 space-y-3 mt-3"
                    >
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Date de début
                        </label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Date de fin
                        </label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>
                    </motion.div>
                  )}
                </motion.div>

                {/* Par catégorie */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    exportType === 'category'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setExportType('category')}
                >
                  <div className="flex items-center space-x-3 mb-3">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        exportType === 'category'
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-gray-300'
                      }`}
                    >
                      {exportType === 'category' && (
                        <FiCheck className="text-white text-xs" />
                      )}
                    </div>
                    <FiFilter className="text-gray-600" />
                    <div>
                      <div className="font-medium text-gray-900">
                        Par catégorie
                      </div>
                      <div className="text-sm text-gray-500">
                        Exporter une catégorie d'événements
                      </div>
                    </div>
                  </div>

                  {exportType === 'category' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="ml-8 mt-3"
                    >
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Catégorie
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      >
                        <option value="">Sélectionner une catégorie</option>
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </motion.div>
                  )}
                </motion.div>
              </div>
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <FiCalendar className="text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Format iCalendar (.ics)</p>
                  <p className="text-blue-600">
                    Le fichier exporté sera compatible avec tous les calendriers :
                    Apple Calendar, Google Calendar, Microsoft Outlook, Thunderbird, etc.
                    Les événements récurrents et leurs exceptions seront préservés.
                  </p>
                </div>
              </div>
            </div>

            {/* Success message */}
            {exportSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-green-50 border border-green-200 rounded-lg p-4"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <FiCheck className="text-white" />
                  </div>
                  <div className="text-sm text-green-800">
                    <p className="font-medium">Export réussi !</p>
                    <p className="text-green-600">
                      Le fichier .ics a été téléchargé avec succès.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 p-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isExporting}
            >
              Annuler
            </button>
            <button
              onClick={handleExport}
              disabled={!isFormValid() || isExporting}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isExporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Export en cours...</span>
                </>
              ) : (
                <>
                  <FiDownload />
                  <span>Exporter</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ICalExport;
