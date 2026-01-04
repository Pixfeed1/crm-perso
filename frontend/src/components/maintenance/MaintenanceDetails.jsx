// src/components/maintenance/MaintenanceDetails.jsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiEdit2, FiTrash2, FiGlobe, FiUser, FiCalendar, FiZap,
  FiExternalLink, FiFileText, FiPlus, FiSend, FiEye
} from 'react-icons/fi';
import MaintenanceForm from './MaintenanceForm';
import MaintenanceReportForm from './MaintenanceReportForm';
import { formatDate, formatAmount } from '../../utils/formatters';
import { maintenanceReportsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const MaintenanceDetails = ({ contract, onUpdate, onDelete, onClose, onRefresh }) => {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [sendingReport, setSendingReport] = useState(null);

  // Configuration des statuts
  const statusConfig = {
    active: { bg: 'bg-green-500/20', text: 'text-green-300', label: 'Actif' },
    paused: { bg: 'bg-amber-500/20', text: 'text-amber-300', label: 'En pause' },
    cancelled: { bg: 'bg-gray-500/20', text: 'text-gray-300', label: 'Annulé' }
  };

  const statusStyle = statusConfig[contract.status] || statusConfig.active;

  // Couleur PageSpeed
  const getPageSpeedColor = (score) => {
    if (!score) return 'text-gray-400';
    if (score >= 90) return 'text-green-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-rose-400';
  };

  const handleSaveEdit = async (updatedData) => {
    await onUpdate(contract.id, updatedData);
    setIsEditing(false);
  };

  const handlePreviewReport = (reportId) => {
    const url = maintenanceReportsAPI.getPreviewUrl(reportId);
    window.open(url, '_blank');
  };

  const handleSendReport = async (reportId) => {
    if (!contract.client_email) {
      toast.error('Aucun email client configuré');
      return;
    }

    try {
      setSendingReport(reportId);
      await maintenanceReportsAPI.send(reportId, contract.client_email);
      toast.success('Rapport envoyé avec succès');
      onRefresh();
    } catch (error) {
      console.error('Erreur envoi rapport:', error);
      toast.error('Erreur lors de l\'envoi du rapport');
    } finally {
      setSendingReport(null);
    }
  };

  if (isEditing) {
    return (
      <MaintenanceForm
        contract={contract}
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
            <FiGlobe />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{contract.site_name}</h2>
            {contract.client_name && (
              <p className="text-indigo-300 text-lg flex items-center gap-2">
                <FiUser size={16} />
                {contract.client_name}
              </p>
            )}
            <div className={`inline-block mt-2 text-xs px-3 py-1 rounded-full ${statusStyle.bg} ${statusStyle.text} font-medium`}>
              {statusStyle.label}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {contract.site_url && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.open(contract.site_url, '_blank')}
              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              title="Ouvrir le site"
            >
              <FiExternalLink />
            </motion.button>
          )}
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
            onClick={() => onDelete(contract.id)}
            className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            title="Supprimer"
          >
            <FiTrash2 />
          </motion.button>
        </div>
      </div>

      {/* Infos techniques */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900/40 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">PageSpeed Mobile</div>
          <div className={`text-2xl font-bold ${getPageSpeedColor(contract.pagespeed_mobile)}`}>
            {contract.pagespeed_mobile || '-'}
          </div>
        </div>
        <div className="bg-gray-900/40 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">PageSpeed Desktop</div>
          <div className={`text-2xl font-bold ${getPageSpeedColor(contract.pagespeed_desktop)}`}>
            {contract.pagespeed_desktop || '-'}
          </div>
        </div>
        <div className="bg-gray-900/40 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">WordPress</div>
          <div className="text-lg font-medium text-white">
            {contract.wordpress_version || '-'}
          </div>
        </div>
        <div className="bg-gray-900/40 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Montant mensuel</div>
          <div className="text-lg font-medium text-green-400">
            {formatAmount(contract.monthly_amount)}
          </div>
        </div>
      </div>

      {/* Détails supplémentaires */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="space-y-2">
          {contract.site_url && (
            <div className="flex items-center gap-2 text-gray-300">
              <FiGlobe className="text-gray-500" size={14} />
              <a href={contract.site_url} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-400">
                {contract.site_url}
              </a>
            </div>
          )}
          {contract.hosting_provider && (
            <div className="text-gray-400 text-sm">
              Hébergeur: <span className="text-gray-300">{contract.hosting_provider}</span>
            </div>
          )}
          {contract.php_version && (
            <div className="text-gray-400 text-sm">
              PHP: <span className="text-gray-300">{contract.php_version}</span>
            </div>
          )}
          {contract.plugins_count > 0 && (
            <div className="text-gray-400 text-sm">
              Plugins: <span className="text-gray-300">{contract.plugins_count}</span>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <div className="text-gray-400 text-sm">
            Début contrat: <span className="text-gray-300">{contract.contract_start_date ? formatDate(contract.contract_start_date) : '-'}</span>
          </div>
          <div className="text-gray-400 text-sm">
            Dernier rapport: <span className="text-gray-300">{contract.last_report_date ? formatDate(contract.last_report_date) : 'Jamais'}</span>
          </div>
          <div className="text-gray-400 text-sm">
            Prochain rapport: <span className={contract.next_report_due && new Date(contract.next_report_due) <= new Date() ? 'text-amber-400' : 'text-gray-300'}>
              {contract.next_report_due ? formatDate(contract.next_report_due) : '-'}
            </span>
          </div>
        </div>
      </div>

      {/* Section Rapports */}
      <div className="border-t border-gray-700 pt-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-200 flex items-center gap-2">
            <FiFileText />
            Rapports de maintenance
          </h3>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowReportForm(true)}
            className="px-3 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded-lg text-sm flex items-center gap-1"
          >
            <FiPlus size={14} />
            Générer un rapport
          </motion.button>
        </div>

        {/* Formulaire de génération de rapport */}
        <AnimatePresence>
          {showReportForm && (
            <MaintenanceReportForm
              contract={contract}
              onClose={() => setShowReportForm(false)}
              onSuccess={() => {
                setShowReportForm(false);
                onRefresh();
              }}
            />
          )}
        </AnimatePresence>

        {/* Liste des rapports */}
        {contract.reports && contract.reports.length > 0 ? (
          <div className="space-y-2">
            {contract.reports.map(report => (
              <div
                key={report.id}
                className="bg-gray-900/40 rounded-lg p-3 flex justify-between items-center"
              >
                <div>
                  <div className="text-sm text-white">
                    {formatDate(report.period_start)} - {formatDate(report.period_end)}
                  </div>
                  <div className="text-xs text-gray-400">
                    {report.status === 'sent' ? (
                      <span className="text-green-400">Envoyé le {formatDate(report.sent_at)}</span>
                    ) : (
                      <span className="text-gray-400">Brouillon</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handlePreviewReport(report.id)}
                    className="p-2 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-300"
                    title="Prévisualiser"
                  >
                    <FiEye size={14} />
                  </motion.button>
                  {report.status === 'draft' && (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleSendReport(report.id)}
                      disabled={sendingReport === report.id}
                      className="p-2 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 disabled:opacity-50"
                      title="Envoyer"
                    >
                      {sendingReport === report.id ? (
                        <motion.div
                          className="w-3.5 h-3.5 border-2 border-emerald-300 border-t-transparent rounded-full"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                      ) : (
                        <FiSend size={14} />
                      )}
                    </motion.button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-900/30 rounded-lg p-6 text-center">
            <div className="text-3xl mb-2 text-gray-500"><FiFileText /></div>
            <p className="text-gray-400 text-sm">Aucun rapport généré</p>
          </div>
        )}
      </div>

      {/* Notes */}
      {contract.notes && (
        <div className="border-t border-gray-700 pt-6 mt-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Notes</h3>
          <p className="text-gray-300 whitespace-pre-wrap">{contract.notes}</p>
        </div>
      )}
    </motion.div>
  );
};

export default MaintenanceDetails;
