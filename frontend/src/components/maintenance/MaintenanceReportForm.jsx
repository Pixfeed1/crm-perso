// src/components/maintenance/MaintenanceReportForm.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiCheckCircle } from 'react-icons/fi';
import { maintenanceReportsAPI, maintenanceContractsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const MaintenanceReportForm = ({ contract, onClose, onSuccess }) => {
  const { toast } = useToast();

  // Dates par défaut (mois précédent)
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);

  const [formData, setFormData] = useState({
    period_start: firstDay.toISOString().split('T')[0],
    period_end: lastDay.toISOString().split('T')[0],
    pagespeed_mobile: contract.pagespeed_mobile || '',
    pagespeed_desktop: contract.pagespeed_desktop || '',
    wordpress_version: contract.wordpress_version || '',
    plugins_updated: '',
    theme_updated: false,
    security_scan: true,
    backup_done: true,
    database_optimized: true,
    actions_list: '',
    notes: ''
  });

  const [submitting, setSubmitting] = useState(false);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSubmitting(true);

      // Mettre à jour les scores PageSpeed du contrat
      if (formData.pagespeed_mobile && formData.pagespeed_desktop) {
        await maintenanceContractsAPI.updatePageSpeed(
          contract.id,
          parseInt(formData.pagespeed_mobile),
          parseInt(formData.pagespeed_desktop)
        );
      }

      // Générer le rapport
      const reportData = {
        period_start: formData.period_start,
        period_end: formData.period_end,
        notes: formData.notes,
        report_data: {
          pagespeed_mobile: formData.pagespeed_mobile ? parseInt(formData.pagespeed_mobile) : null,
          pagespeed_desktop: formData.pagespeed_desktop ? parseInt(formData.pagespeed_desktop) : null,
          wordpress_version: formData.wordpress_version,
          plugins_updated: formData.plugins_updated ? parseInt(formData.plugins_updated) : 0,
          theme_updated: formData.theme_updated,
          security_scan: formData.security_scan,
          backup_done: formData.backup_done,
          database_optimized: formData.database_optimized,
          actions_list: formData.actions_list.split('\n').filter(a => a.trim())
        }
      };

      // Utiliser l'endpoint dédié aux contrats de maintenance
      await maintenanceReportsAPI.generateForContract(contract.id, reportData);

      toast.success('Rapport généré avec succès');
      onSuccess();
    } catch (error) {
      console.error('Erreur génération rapport:', error);
      toast.error('Erreur lors de la génération du rapport');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-4 bg-gray-900/40 rounded-lg p-5"
    >
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-purple-300 font-medium">Nouveau rapport de maintenance</h4>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="text-gray-400 hover:text-white"
        >
          <FiX />
        </motion.button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Période */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Début de période</label>
            <input
              type="date"
              name="period_start"
              value={formData.period_start}
              onChange={handleInputChange}
              className="w-full bg-gray-800/50 text-white border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Fin de période</label>
            <input
              type="date"
              name="period_end"
              value={formData.period_end}
              onChange={handleInputChange}
              className="w-full bg-gray-800/50 text-white border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Performance */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">PageSpeed Mobile</label>
            <input
              type="number"
              name="pagespeed_mobile"
              value={formData.pagespeed_mobile}
              onChange={handleInputChange}
              min="0"
              max="100"
              className="w-full bg-gray-800/50 text-white border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="0-100"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">PageSpeed Desktop</label>
            <input
              type="number"
              name="pagespeed_desktop"
              value={formData.pagespeed_desktop}
              onChange={handleInputChange}
              min="0"
              max="100"
              className="w-full bg-gray-800/50 text-white border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="0-100"
            />
          </div>
        </div>

        {/* Mises à jour */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Version CMS / App</label>
            <input
              type="text"
              name="wordpress_version"
              value={formData.wordpress_version}
              onChange={handleInputChange}
              className="w-full bg-gray-800/50 text-white border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="6.4.2"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Plugins mis à jour</label>
            <input
              type="number"
              name="plugins_updated"
              value={formData.plugins_updated}
              onChange={handleInputChange}
              min="0"
              className="w-full bg-gray-800/50 text-white border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="0"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="theme_updated"
                checked={formData.theme_updated}
                onChange={handleInputChange}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm text-gray-300">Thème mis à jour</span>
            </label>
          </div>
        </div>

        {/* Sécurité & Sauvegardes */}
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="security_scan"
              checked={formData.security_scan}
              onChange={handleInputChange}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-gray-300">Scan sécurité effectué</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="backup_done"
              checked={formData.backup_done}
              onChange={handleInputChange}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-gray-300">Sauvegarde effectuée</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="database_optimized"
              checked={formData.database_optimized}
              onChange={handleInputChange}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-gray-300">Base de données optimisée</span>
          </label>
        </div>

        {/* Actions réalisées */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Actions réalisées (une par ligne)</label>
          <textarea
            name="actions_list"
            value={formData.actions_list}
            onChange={handleInputChange}
            rows={4}
            className="w-full bg-gray-800/50 text-white border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Mise à jour CMS&#10;Mise à jour des extensions&#10;Optimisation des images&#10;Nettoyage du cache"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Notes pour le client (optionnel)</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleInputChange}
            rows={2}
            className="w-full bg-gray-800/50 text-white border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Message personnalisé..."
          />
        </div>

        {/* Boutons */}
        <div className="flex justify-end gap-2 pt-2">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700/50"
          >
            Annuler
          </motion.button>
          <motion.button
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <motion.div
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                Génération...
              </>
            ) : (
              <>
                <FiCheckCircle size={16} />
                Générer le rapport
              </>
            )}
          </motion.button>
        </div>
      </form>
    </motion.div>
  );
};

export default MaintenanceReportForm;
