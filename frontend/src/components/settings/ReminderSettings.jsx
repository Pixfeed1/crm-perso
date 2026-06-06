// frontend/src/components/settings/ReminderSettings.jsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FiBell,
  FiMail,
  FiAlertCircle,
  FiCheck,
  FiSettings,
  FiSend,
  FiBarChart2
} from 'react-icons/fi';
import { remindersAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';

const ReminderSettings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState({
    reminder_1_days: 7,
    reminder_2_days: 14,
    reminder_3_days: 21,
    email_subject_1: 'Rappel - Facture {invoice_number} en attente de paiement',
    email_subject_2: '2ème rappel - Facture {invoice_number} en retard',
    email_subject_3: 'Dernier rappel - Facture {invoice_number} impayée'
  });
  const [stats, setStats] = useState(null);
  const [pendingInvoices, setPendingInvoices] = useState([]);

  useEffect(() => {
    loadSettings();
    loadStats();
    loadPendingInvoices();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await remindersAPI.getSettings();
      setEnabled(data.enabled || false);
      setConfig(data.config || config);
    } catch (error) {
      console.error('Erreur lors du chargement des paramètres:', error);
      toast.error('Erreur lors du chargement des paramètres');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await remindersAPI.getStats();
      setStats(data);
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques:', error);
    }
  };

  const loadPendingInvoices = async () => {
    try {
      const data = await remindersAPI.detectInvoices();
      setPendingInvoices(data.invoices || []);
    } catch (error) {
      console.error('Erreur lors du chargement des factures en attente:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await remindersAPI.updateSettings({
        enabled,
        config
      });
      toast.success('Paramètres enregistrés avec succès');
      await loadStats();
      await loadPendingInvoices();
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement:', error);
      toast.error('Erreur lors de l\'enregistrement des paramètres');
    } finally {
      setSaving(false);
    }
  };

  const handleSendBatch = async () => {
    if (!window.confirm(`Envoyer ${pendingInvoices.length} relance(s) maintenant ?`)) {
      return;
    }

    try {
      const result = await remindersAPI.sendBatch();
      toast.success(`${result.sent} relance(s) envoyée(s) avec succès`);
      await loadStats();
      await loadPendingInvoices();
    } catch (error) {
      console.error('Erreur lors de l\'envoi:', error);
      toast.error('Erreur lors de l\'envoi des relances');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-t�te */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-purple-500/20 rounded-lg">
          <FiBell className="text-purple-400 text-2xl" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-text-primary">Relances automatiques</h2>
          <p className="text-text-muted text-sm">
            Configurez l'envoi automatique de relances pour les factures impayées
          </p>
        </div>
      </div>

      {/* Activation du syst�me */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface/50 backdrop-blur-sm rounded-xl border border-border/50 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${enabled ? 'bg-green-500/20' : 'bg-surface-strong/50'}`}>
              {enabled ? (
                <FiCheck className="text-green-400" />
              ) : (
                <FiAlertCircle className="text-text-muted" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary">
                Système de relances
              </h3>
              <p className="text-sm text-text-muted">
                {enabled ? 'Activé - Les relances seront envoyées automatiquement' : 'Désactivé - Aucune relance ne sera envoyée'}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-14 h-7 bg-surface-strong peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
          </label>
        </div>
      </motion.div>

      {/* Configuration des intervalles */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-surface/50 backdrop-blur-sm rounded-xl border border-border/50 p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <FiSettings className="text-purple-400" />
          <h3 className="text-lg font-semibold text-text-primary">Intervalles de relance</h3>
        </div>

        <p className="text-sm text-text-muted mb-4">
          Définissez le nombre de jours après l'échéance pour chaque niveau de relance
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1ère relance */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              1ère relance (jours)
            </label>
            <input
              type="number"
              min="1"
              value={config.reminder_1_days}
              onChange={(e) => setConfig(prev => ({ ...prev, reminder_1_days: parseInt(e.target.value) }))}
              className="w-full bg-surface-muted/50 border border-border rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Rappel cordial après {config.reminder_1_days} jours de retard
            </p>
          </div>

          {/* 2ème relance */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              2ème relance (jours)
            </label>
            <input
              type="number"
              min="1"
              value={config.reminder_2_days}
              onChange={(e) => setConfig(prev => ({ ...prev, reminder_2_days: parseInt(e.target.value) }))}
              className="w-full bg-surface-muted/50 border border-border rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Rappel ferme après {config.reminder_2_days} jours de retard
            </p>
          </div>

          {/* 3ème relance */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              3ème relance (jours)
            </label>
            <input
              type="number"
              min="1"
              value={config.reminder_3_days}
              onChange={(e) => setConfig(prev => ({ ...prev, reminder_3_days: parseInt(e.target.value) }))}
              className="w-full bg-surface-muted/50 border border-border rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Dernier rappel après {config.reminder_3_days} jours de retard
            </p>
          </div>
        </div>
      </motion.div>

      {/* Templates des emails */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-surface/50 backdrop-blur-sm rounded-xl border border-border/50 p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <FiMail className="text-purple-400" />
          <h3 className="text-lg font-semibold text-text-primary">Sujets des emails</h3>
        </div>

        <p className="text-sm text-text-muted mb-4">
          Personnalisez les sujets des emails de relance. Utilisez <code className="bg-surface-muted px-1 rounded">{'{invoice_number}'}</code> pour le numéro de facture.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Sujet 1ère relance
            </label>
            <input
              type="text"
              value={config.email_subject_1}
              onChange={(e) => setConfig(prev => ({ ...prev, email_subject_1: e.target.value }))}
              className="w-full bg-surface-muted/50 border border-border rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Rappel - Facture {invoice_number}"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Sujet 2ème relance
            </label>
            <input
              type="text"
              value={config.email_subject_2}
              onChange={(e) => setConfig(prev => ({ ...prev, email_subject_2: e.target.value }))}
              className="w-full bg-surface-muted/50 border border-border rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="2ème rappel - Facture {invoice_number}"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Sujet 3ème relance
            </label>
            <input
              type="text"
              value={config.email_subject_3}
              onChange={(e) => setConfig(prev => ({ ...prev, email_subject_3: e.target.value }))}
              className="w-full bg-surface-muted/50 border border-border rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Dernier rappel - Facture {invoice_number}"
            />
          </div>
        </div>
      </motion.div>

      {/* Statistiques */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-surface/50 backdrop-blur-sm rounded-xl border border-border/50 p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <FiBarChart2 className="text-purple-400" />
            <h3 className="text-lg font-semibold text-text-primary">Statistiques</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <p className="text-sm text-text-muted">Relances envoyées</p>
              <p className="text-2xl font-bold text-blue-400">{stats.total_reminders_sent || 0}</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <p className="text-sm text-text-muted">Niveau 1</p>
              <p className="text-2xl font-bold text-green-400">{stats.level_1_count || 0}</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <p className="text-sm text-text-muted">Niveau 2</p>
              <p className="text-2xl font-bold text-amber-400">{stats.level_2_count || 0}</p>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-4">
              <p className="text-sm text-text-muted">Niveau 3</p>
              <p className="text-2xl font-bold text-rose-400">{stats.level_3_count || 0}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Factures en attente de relance */}
      {enabled && pendingInvoices.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FiAlertCircle className="text-amber-400" />
              <h3 className="text-lg font-semibold text-text-primary">
                Factures en attente de relance ({pendingInvoices.length})
              </h3>
            </div>
            <motion.button
              onClick={handleSendBatch}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <FiSend />
              Envoyer maintenant
            </motion.button>
          </div>

          <div className="space-y-2">
            {pendingInvoices.slice(0, 5).map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between bg-surface-muted/50 rounded-lg p-3"
              >
                <div>
                  <p className="text-text-primary font-medium">{invoice.invoice_number}</p>
                  <p className="text-sm text-text-muted">{invoice.client_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-amber-400 font-semibold">
                    Relance niveau {invoice.next_reminder_level}
                  </p>
                  <p className="text-sm text-text-muted">
                    {invoice.days_overdue} jour{invoice.days_overdue > 1 ? 's' : ''} de retard
                  </p>
                </div>
              </div>
            ))}
            {pendingInvoices.length > 5 && (
              <p className="text-center text-sm text-text-muted pt-2">
                ... et {pendingInvoices.length - 5} autre{pendingInvoices.length - 5 > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </motion.div>
      )}

      {/* Bouton Enregistrer */}
      <div className="flex justify-end">
        <motion.button
          onClick={handleSave}
          disabled={saving}
          className={`px-6 py-3 rounded-lg font-medium transition-all ${
            saving
              ? 'bg-purple-600/50 cursor-not-allowed'
              : 'bg-purple-600 hover:bg-purple-700'
          } text-text-primary`}
          whileHover={!saving ? { scale: 1.05 } : {}}
          whileTap={!saving ? { scale: 0.95 } : {}}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
        </motion.button>
      </div>
    </div>
  );
};

export default ReminderSettings;
