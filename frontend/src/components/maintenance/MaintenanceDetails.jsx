// src/components/maintenance/MaintenanceDetails.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FiEdit2, FiTrash2, FiGlobe, FiUser, FiCalendar, FiZap,
  FiExternalLink, FiFileText, FiPlus, FiSend, FiEye, FiDownload, FiCreditCard, FiCopy,
  FiXCircle, FiRotateCcw
} from 'react-icons/fi';
import { formatDate, formatAmount } from '../../utils/formatters';
import { maintenanceReportsAPI, maintenanceContractsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import Modal from '../common/Modal';
import ConfirmModal from '../common/ConfirmModal';
import BillingLinkEmailModal from '../billing/BillingLinkEmailModal';

const MaintenanceDetails = ({ contract, onDelete, onRefresh, onEdit, onGenerateReport }) => {
  const { toast } = useToast();
  const { confirm, confirmState } = useConfirm();
  const [sendingReport, setSendingReport] = useState(null);
  const [billingEmailOpen, setBillingEmailOpen] = useState(false);
  const [billingUrl, setBillingUrl] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSending, setBillingSending] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelImmediate, setCancelImmediate] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);

  // Configuration des statuts
  const statusConfig = {
    active: { bg: 'bg-green-500/20', text: 'text-green-300', label: 'Actif' },
    paused: { bg: 'bg-amber-500/20', text: 'text-amber-300', label: 'En pause' },
    cancelled: { bg: 'bg-gray-500/20', text: 'text-gray-300', label: 'Annulé' }
  };

  // Statut du prélèvement
  const billingStatusConfig = {
    none: { bg: 'bg-gray-500/20', text: 'text-gray-300', label: 'Pas de prélèvement' },
    pending: { bg: 'bg-amber-500/20', text: 'text-amber-300', label: "En attente d'autorisation" },
    active: { bg: 'bg-green-500/20', text: 'text-green-300', label: 'Prélèvement actif' },
    past_due: { bg: 'bg-rose-500/20', text: 'text-rose-300', label: 'Impayé' },
    canceling: { bg: 'bg-amber-500/20', text: 'text-amber-300', label: 'Résiliation prévue' },
    canceled: { bg: 'bg-gray-500/20', text: 'text-gray-300', label: 'Résilié' }
  };
  const billingStyle = billingStatusConfig[contract.billing_status] || billingStatusConfig.none;

  const statusStyle = statusConfig[contract.status] || statusConfig.active;

  // Couleur PageSpeed
  const getPageSpeedColor = (score) => {
    if (!score) return 'text-gray-400';
    if (score >= 90) return 'text-green-400';
    if (score >= 50) return 'text-amber-400';
    return 'text-rose-400';
  };

  // Aperçu HTML : récupéré via le client authentifié (token attaché), affiché via un blob
  const handlePreviewReport = async (reportId) => {
    try {
      const html = await maintenanceReportsAPI.getPreviewHtml(reportId);
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      console.error('Erreur aperçu rapport:', error);
      toast.error('Erreur lors de l\'ouverture de l\'aperçu');
    }
  };

  // PDF : récupéré en blob via le client authentifié, ouvert dans un nouvel onglet
  const handleOpenPdf = async (reportId) => {
    try {
      const blob = await maintenanceReportsAPI.getPdfBlob(reportId);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      console.error('Erreur PDF rapport:', error);
      toast.error('Erreur lors de l\'ouverture du PDF');
    }
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

  // Suppression d'un rapport : confirmation simple si brouillon, avertissement explicite si envoyé.
  const handleDeleteReport = async (report) => {
    const isSent = report.status === 'sent';
    const confirmed = await confirm({
      title: 'Supprimer ce rapport ?',
      message: isSent
        ? "Ce rapport a déjà été envoyé au client ; le supprimer ne le retire que du CRM, pas de la boîte mail du client."
        : 'Cette action supprimera définitivement ce rapport. Cette opération est irréversible.',
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'danger'
    });
    if (!confirmed) return;

    try {
      await maintenanceReportsAPI.delete(report.id);
      toast.success('Rapport supprimé');
      onRefresh();
    } catch (error) {
      console.error('Erreur suppression rapport:', error);
      toast.error(error.message || 'Erreur lors de la suppression du rapport');
    }
  };

  // Mise en place du prélèvement : crée la session Stripe et récupère le lien
  const handleSetupBilling = async () => {
    try {
      setBillingLoading(true);
      const { url } = await maintenanceContractsAPI.createBillingCheckout(contract.id);
      setBillingUrl(url);
      onRefresh();
    } catch (error) {
      console.error('Erreur création prélèvement:', error);
      toast.error(error.message || 'Erreur lors de la création du prélèvement');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleCopyBillingLink = async () => {
    if (!billingUrl) return;
    try {
      await navigator.clipboard.writeText(billingUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      toast.error('Impossible de copier le lien');
    }
  };

  const handleSendBillingEmail = async (payload) => {
    try {
      setBillingSending(true);
      const res = await maintenanceContractsAPI.sendBillingLink(contract.id, payload);
      toast.success(`Lien envoyé à ${res.sentTo || 'au client'}`);
      setBillingEmailOpen(false);
    } catch (error) {
      console.error('Erreur envoi lien prélèvement:', error);
      toast.error(error.message || "Erreur lors de l'envoi du lien");
    } finally {
      setBillingSending(false);
    }
  };

  const isPro = String(contract.plan || '').toLowerCase().includes('pro');
  const conditionsLabel = `Conditions Maintenance ${isPro ? 'Professionnel' : 'Essentiel'}`;
  const defaultBillingMessage =
    `Bonjour ${contract.client_name || ''},\n\n` +
    `Comme convenu, voici le lien pour mettre en place le prélèvement de la maintenance de votre site. ` +
    `Vous trouverez les conditions détaillées en pièce jointe.\n\nBien à vous,`;

  const handleConfirmCancel = async () => {
    try {
      setCancelLoading(true);
      await maintenanceContractsAPI.cancelBilling(contract.id, cancelImmediate);
      toast.success(cancelImmediate ? 'Prélèvement arrêté immédiatement' : 'Résiliation programmée en fin de période');
      setCancelModalOpen(false);
      setCancelImmediate(false);
      onRefresh();
    } catch (error) {
      console.error('Erreur résiliation prélèvement:', error);
      toast.error(error.message || 'Erreur lors de la résiliation');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleResumeBilling = async () => {
    try {
      setResumeLoading(true);
      await maintenanceContractsAPI.resumeBilling(contract.id);
      toast.success('Prélèvement réactivé');
      onRefresh();
    } catch (error) {
      console.error('Erreur réactivation prélèvement:', error);
      toast.error(error.message || 'Erreur lors de la réactivation');
    } finally {
      setResumeLoading(false);
    }
  };

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
            onClick={onEdit}
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
          <div className="text-xs text-gray-400 mb-1">Version CMS / App</div>
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

      {/* Section Prélèvement */}
      <div className="border-t border-gray-700 pt-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-200 flex items-center gap-2">
            <FiCreditCard />
            Prélèvement automatique
          </h3>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${billingStyle.bg} ${billingStyle.text}`}>
            {billingStyle.label}
          </span>
        </div>

        {(contract.billing_status === 'none' || contract.billing_status === 'pending') && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleSetupBilling}
            disabled={billingLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {billingLoading ? (
              <motion.div
                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              />
            ) : (
              <FiCreditCard size={16} />
            )}
            Mettre en place le prélèvement
          </motion.button>
        )}

        {billingUrl && (
          <div className="mt-4 bg-gray-900/40 rounded-lg p-3">
            <p className="text-xs text-gray-400 mb-2">Lien de paiement (carte ou SEPA) :</p>
            <input
              type="text"
              readOnly
              value={billingUrl}
              onFocus={(e) => e.target.select()}
              className="w-full min-w-0 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 mb-3"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyBillingLink}
                className="px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 text-gray-200 rounded-lg text-sm flex items-center gap-1"
              >
                <FiCopy size={14} /> {linkCopied ? 'Copié !' : 'Copier le lien'}
              </button>
              <button
                type="button"
                onClick={() => setBillingEmailOpen(true)}
                disabled={billingSending}
                className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 rounded-lg text-sm flex items-center gap-1 disabled:opacity-50"
              >
                <FiSend size={14} /> {billingSending ? 'Envoi…' : 'Envoyer au client par email'}
              </button>
            </div>
          </div>
        )}

        {/* Arrêter le prélèvement (actif ou impayé) */}
        {(contract.billing_status === 'active' || contract.billing_status === 'past_due') && (
          <div className="mt-3">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => { setCancelImmediate(false); setCancelModalOpen(true); }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm flex items-center gap-2"
            >
              <FiXCircle size={16} />
              Arrêter le prélèvement
            </motion.button>
          </div>
        )}

        {/* Résiliation programmée : bandeau + réactivation */}
        {contract.billing_status === 'canceling' && (
          <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-sm text-amber-200 mb-3">
              Résiliation prévue le {contract.billing_cancel_at ? formatDate(contract.billing_cancel_at) : '—'}.
            </p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleResumeBilling}
              disabled={resumeLoading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {resumeLoading ? (
                <motion.div
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              ) : (
                <FiRotateCcw size={16} />
              )}
              Réactiver le prélèvement
            </motion.button>
          </div>
        )}
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
            onClick={onGenerateReport}
            className="px-3 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded-lg text-sm flex items-center gap-1"
          >
            <FiPlus size={14} />
            Générer un rapport
          </motion.button>
        </div>

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
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleOpenPdf(report.id)}
                    className="p-2 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-300"
                    title="Ouvrir le PDF"
                  >
                    <FiDownload size={14} />
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
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleDeleteReport(report)}
                    className="p-2 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-300"
                    title="Supprimer"
                  >
                    <FiTrash2 size={14} />
                  </motion.button>
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

      {/* Modale de confirmation d'arrêt du prélèvement */}
      <Modal isOpen={cancelModalOpen} onClose={() => setCancelModalOpen(false)} maxWidth="max-w-md">
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-3">Arrêter le prélèvement</h3>
          <p className="text-sm text-gray-300 mb-4">
            Arrêter le prélèvement de ce contrat ? Le service reste actif jusqu'à la fin de la
            période déjà payée, puis plus aucun prélèvement ne sera effectué.
          </p>
          <label className="flex items-start gap-2 cursor-pointer mb-5">
            <input
              type="checkbox"
              checked={cancelImmediate}
              onChange={(e) => setCancelImmediate(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-600 bg-gray-700 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-gray-300">Arrêter immédiatement (sans attendre la fin de la période)</span>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCancelModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-700/50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleConfirmCancel}
              disabled={cancelLoading}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center gap-2 disabled:opacity-50"
            >
              {cancelLoading && (
                <motion.div
                  className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
              )}
              Confirmer
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation de suppression de rapport */}
      <ConfirmModal {...confirmState.config} isOpen={confirmState.isOpen} />

      <BillingLinkEmailModal
        isOpen={billingEmailOpen}
        onClose={() => setBillingEmailOpen(false)}
        onSend={handleSendBillingEmail}
        title="Envoyer le lien de prélèvement"
        clientName={contract.client_name || ''}
        defaultMessage={defaultBillingMessage}
        conditionsLabel={conditionsLabel}
      />
    </motion.div>
  );
};

export default MaintenanceDetails;
