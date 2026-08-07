// src/components/projects/MaintenanceReports.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiFileText, FiSend, FiEye, FiTrash2, FiPlus, FiCalendar, FiClock, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { maintenanceReportsAPI } from '../../services/api';

const MaintenanceReports = ({ project }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(null);

  // Dates pour le générateur
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (project?.id) {
      loadReports();
      // Définir les dates par défaut (mois en cours)
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setPeriodStart(firstDay.toISOString().split('T')[0]);
      setPeriodEnd(lastDay.toISOString().split('T')[0]);
    }
  }, [project?.id]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const data = await maintenanceReportsAPI.getByProject(project.id);
      setReports(data);
    } catch (error) {
      console.error('Erreur chargement rapports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!periodStart || !periodEnd) return;

    try {
      setGenerating(true);
      await maintenanceReportsAPI.generate(project.id, {
        period_start: periodStart,
        period_end: periodEnd,
        notes: notes || null
      });
      setShowGenerator(false);
      setNotes('');
      loadReports();
    } catch (error) {
      console.error('Erreur génération rapport:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async (reportId, email) => {
    try {
      setSending(reportId);
      await maintenanceReportsAPI.send(reportId, email);
      loadReports();
    } catch (error) {
      console.error('Erreur envoi rapport:', error);
    } finally {
      setSending(null);
    }
  };

  const handleDelete = async (reportId) => {
    if (!window.confirm('Supprimer ce rapport ?')) return;

    try {
      await maintenanceReportsAPI.delete(reportId);
      loadReports();
    } catch (error) {
      console.error('Erreur suppression rapport:', error);
    }
  };

  const handlePreview = (reportId) => {
    const url = maintenanceReportsAPI.getPreviewUrl(reportId);
    window.open(url, '_blank');
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const statusConfig = {
    'draft': { label: 'Brouillon', bg: 'bg-gray-500/20', text: 'text-text-secondary', icon: <FiFileText /> },
    'sent': { label: 'Envoyé', bg: 'bg-emerald-500/20', text: 'text-emerald-300', icon: <FiCheckCircle /> },
    'viewed': { label: 'Lu', bg: 'bg-blue-500/20', text: 'text-blue-300', icon: <FiEye /> }
  };

  return (
    <div className="bg-surface/30 backdrop-blur-sm rounded-xl p-5 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-medium text-text-primary flex items-center">
          <span className="mr-2"><FiFileText /></span>
          Rapports de maintenance
        </h3>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 px-3 py-1 rounded-lg text-sm flex items-center"
          onClick={() => setShowGenerator(!showGenerator)}
        >
          <FiPlus className="mr-1" />
          Générer un rapport
        </motion.button>
      </div>

      {/* Formulaire de génération */}
      <AnimatePresence>
        {showGenerator && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 bg-surface-muted/40 rounded-lg p-4"
          >
            <h4 className="text-purple-300 font-medium mb-3">Nouveau rapport</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-text-muted mb-1">Début de période</label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Fin de période</label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-text-muted mb-1">Notes pour le client (optionnel)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full bg-surface/50 text-text-primary border border-border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Message personnalisé à inclure dans le rapport..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowGenerator(false)}
                className="px-4 py-2 rounded-lg border border-border-strong text-text-secondary hover:bg-surface-strong/50"
              >
                Annuler
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGenerate}
                disabled={generating || !periodStart || !periodEnd}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white flex items-center disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <motion.div
                      className="w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    Génération...
                  </>
                ) : (
                  <>Générer</>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Liste des rapports */}
      {loading ? (
        <div className="flex justify-center py-8">
          <motion.div
            className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-surface-muted/30 rounded-lg p-6 text-center">
          <div className="text-4xl mb-3 text-text-muted"><FiFileText /></div>
          <h4 className="text-lg font-medium text-text-secondary mb-2">Aucun rapport</h4>
          <p className="text-text-muted text-sm">
            Générez un rapport pour l'envoyer au client.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => {
            const status = statusConfig[report.status] || statusConfig.draft;
            const data = report.report_data || {};

            return (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface/50 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${status.bg} ${status.text}`}>
                        {status.icon}
                        {status.label}
                      </span>
                      <span className="text-text-muted text-sm">
                        {formatDate(report.period_start)} - {formatDate(report.period_end)}
                      </span>
                    </div>

                    <div className="flex gap-4 text-sm text-text-muted">
                      <span className="flex items-center gap-1">
                        <FiCalendar className="text-text-muted" />
                        {data.summary?.interventions_count || 0} intervention{(data.summary?.interventions_count || 0) > 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <FiClock className="text-text-muted" />
                        {Math.round((data.summary?.total_duration_minutes || 0) / 60 * 10) / 10}h
                      </span>
                      {report.sent_at && (
                        <span className="text-emerald-400">
                          Envoyé le {formatDate(report.sent_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handlePreview(report.id)}
                      className="p-2 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-300"
                      title="Prévisualiser"
                    >
                      <FiEye size={16} />
                    </motion.button>

                    {report.status === 'draft' && (
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleSend(report.id)}
                        disabled={sending === report.id}
                        className="p-2 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 disabled:opacity-50"
                        title="Envoyer au client"
                      >
                        {sending === report.id ? (
                          <motion.div
                            className="w-4 h-4 border-2 border-emerald-300 border-t-transparent rounded-full"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          />
                        ) : (
                          <FiSend size={16} />
                        )}
                      </motion.button>
                    )}

                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleDelete(report.id)}
                      className="p-2 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 text-rose-300"
                      title="Supprimer"
                    >
                      <FiTrash2 size={16} />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MaintenanceReports;
