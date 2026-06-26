// src/components/subscriptions/SubscriptionsTab.jsx
//
// Onglet "Abonnements" (facturation récurrente Stripe pour n'importe quel client/montant).
// Réutilise la mécanique de paiement de la maintenance (lien court pay.pixfeed.net, email,
// résiliation/réactivation).
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiRepeat, FiPlus, FiTrash2, FiSend, FiCopy, FiCheck, FiLink,
  FiUser, FiX, FiSlash, FiRotateCcw, FiEdit2, FiEye, FiAlertTriangle
} from 'react-icons/fi';
import { subscriptionsAPI, clientsAPI } from '../../services/api';
import { useToast } from '../../hooks/useToast';
import BillingLinkEmailModal from '../billing/BillingLinkEmailModal';

// Modalités par défaut, adaptées à la périodicité (même esprit que les docs maintenance).
const buildDefaultModalites = (periodicity, intervalCount) => {
  const n = Math.max(parseInt(intervalCount, 10) || 1, 1);
  const periodWord = periodicity === 'year'
    ? 'annuel'
    : periodicity === 'custom'
      ? `tous les ${n} mois`
      : 'mensuel';
  return [
    'Engagement : Sans engagement de durée. Résiliable à tout moment ; la résiliation prend effet à la fin de la période en cours, sans remboursement au prorata.',
    `Facturation : Prélèvement ${periodWord} automatique par carte via Stripe, à la date anniversaire de souscription. Facture transmise par email.`,
    'Résiliation : Effective à la fin de la période en cours.',
    'Responsabilité : Pixfeed met en œuvre les moyens nécessaires à la bonne exécution de la prestation, sans garantie de résultat absolu inhérente à la nature du web.'
  ].join('\n');
};

const billingStatusConfig = {
  none: { bg: 'bg-gray-500/20', text: 'text-text-secondary', label: 'Pas de paiement' },
  pending: { bg: 'bg-amber-500/20', text: 'text-amber-300', label: "En attente d'autorisation" },
  active: { bg: 'bg-green-500/20', text: 'text-green-300', label: 'Actif' },
  past_due: { bg: 'bg-rose-500/20', text: 'text-rose-300', label: 'Impayé' },
  canceling: { bg: 'bg-amber-500/20', text: 'text-amber-300', label: 'Résiliation prévue' },
  canceled: { bg: 'bg-gray-500/20', text: 'text-text-secondary', label: 'Résilié' }
};

const formatAmount = (amount) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount || 0);

const periodicityLabel = (sub) => {
  const count = parseInt(sub.interval_count, 10) || 1;
  if (count === 1) return sub.interval === 'year' ? 'Annuel' : 'Mensuel';
  return `Tous les ${count} ${sub.interval === 'year' ? 'ans' : 'mois'}`;
};

const SubscriptionsTab = () => {
  const { toast } = useToast();
  const [subscriptions, setSubscriptions] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // Création / édition (même modale)
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);          // null = création ; sinon = id édité
  const [editBillingActive, setEditBillingActive] = useState(false); // verrouille montant/périodicité
  const [form, setForm] = useState({
    client_id: '', label: '', amount_eur: '', periodicity: 'month', interval_count: 2,
    cond_intro: '', cond_included: '', cond_excluded: '', cond_modalites: ''
  });
  const [modalitesTouched, setModalitesTouched] = useState(false);

  // Email d'envoi du lien
  const [emailTarget, setEmailTarget] = useState(null);

  // Prévisualisation (lecture seule) de ce que reçoit le client
  const [previewTarget, setPreviewTarget] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const openForm = () => {
    setEditingId(null);
    setEditBillingActive(false);
    setForm({
      client_id: '', label: '', amount_eur: '', periodicity: 'month', interval_count: 2,
      cond_intro: '', cond_included: '', cond_excluded: '',
      cond_modalites: buildDefaultModalites('month', 2)
    });
    setModalitesTouched(false);
    setFormOpen(true);
  };

  const openEdit = (sub) => {
    const periodicity = sub.interval === 'year'
      ? 'year'
      : ((parseInt(sub.interval_count, 10) || 1) > 1 ? 'custom' : 'month');
    setEditingId(sub.id);
    setEditBillingActive(sub.billing_status === 'active');
    setForm({
      client_id: sub.client_id || '',
      label: sub.label || '',
      amount_eur: sub.amount_eur ?? '',
      periodicity,
      interval_count: parseInt(sub.interval_count, 10) || 2,
      cond_intro: sub.cond_intro || '',
      cond_included: sub.cond_included || '',
      cond_excluded: sub.cond_excluded || '',
      cond_modalites: sub.cond_modalites || buildDefaultModalites(periodicity, sub.interval_count)
    });
    setModalitesTouched(true); // ne pas écraser les conditions existantes
    setFormOpen(true);
  };

  const openPreview = async (sub) => {
    setPreviewTarget(sub);
    setPreviewData(null);
    setPreviewLoading(true);
    try {
      const data = await subscriptionsAPI.preview(sub.id, { includeConditions: true });
      setPreviewData(data);
    } catch (error) {
      toast.error(error.message || "Erreur lors de la prévisualisation");
      setPreviewTarget(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Régénère les modalités par défaut quand la périodicité change (si non éditées à la main).
  useEffect(() => {
    if (formOpen && !modalitesTouched) {
      setForm((prev) => ({ ...prev, cond_modalites: buildDefaultModalites(prev.periodicity, prev.interval_count) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.periodicity, form.interval_count, formOpen]);

  // Liens de paiement générés (par abonnement) + état copie
  const [payLinks, setPayLinks] = useState({});
  const [loadingLink, setLoadingLink] = useState(null);
  const [sendingLink, setSendingLink] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Résiliation / réactivation
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelImmediate, setCancelImmediate] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [subs, cls] = await Promise.all([
        subscriptionsAPI.getAll(),
        clientsAPI.getAll()
      ]);
      setSubscriptions(subs || []);
      setClients(cls || []);
    } catch (error) {
      console.error('Erreur chargement abonnements:', error);
      toast.error('Erreur lors du chargement des abonnements');
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      const subs = await subscriptionsAPI.getAll();
      setSubscriptions(subs || []);
    } catch (error) {
      console.error('Erreur rafraîchissement abonnements:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.client_id || !form.label) {
      toast.error('Client et libellé sont obligatoires');
      return;
    }
    const editingLockedAmount = editingId && editBillingActive;
    if (!editingLockedAmount && !form.amount_eur) {
      toast.error('Le montant est obligatoire');
      return;
    }
    const interval = form.periodicity === 'year' ? 'year' : 'month';
    const interval_count = form.periodicity === 'custom' ? Math.max(parseInt(form.interval_count, 10) || 1, 1) : 1;
    const base = {
      client_id: form.client_id,
      label: form.label,
      cond_intro: form.cond_intro || null,
      cond_included: form.cond_included || null,
      cond_excluded: form.cond_excluded || null,
      cond_modalites: form.cond_modalites || null
    };
    // Montant/périodicité : envoyés à la création, et en édition seulement si Stripe pas actif.
    if (!editingLockedAmount) {
      base.amount_eur = Number(form.amount_eur);
      base.interval = interval;
      base.interval_count = interval_count;
    }
    try {
      setSaving(true);
      if (editingId) {
        await subscriptionsAPI.update(editingId, base);
        toast.success('Abonnement mis à jour');
      } else {
        await subscriptionsAPI.create(base);
        toast.success('Abonnement créé');
      }
      setFormOpen(false);
      fetchSubscriptions();
    } catch (error) {
      console.error('Erreur enregistrement abonnement:', error);
      toast.error(error.message || "Erreur lors de l'enregistrement de l'abonnement");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateLink = async (sub) => {
    try {
      setLoadingLink(sub.id);
      const { url } = await subscriptionsAPI.createBillingCheckout(sub.id);
      setPayLinks((prev) => ({ ...prev, [sub.id]: url }));
      fetchSubscriptions();
    } catch (error) {
      console.error('Erreur génération lien:', error);
      toast.error(error.message || 'Erreur lors de la génération du lien');
    } finally {
      setLoadingLink(null);
    }
  };

  const handleCopyLink = async (sub) => {
    const url = payLinks[sub.id];
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(sub.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      toast.error('Impossible de copier le lien');
    }
  };

  const handleSendEmail = async (payload) => {
    if (!emailTarget) return;
    try {
      setSendingLink(emailTarget.id);
      const res = await subscriptionsAPI.sendBillingLink(emailTarget.id, payload);
      toast.success(`Lien envoyé à ${res.sentTo || 'au client'}`);
      setEmailTarget(null);
      fetchSubscriptions();
    } catch (error) {
      console.error('Erreur envoi lien:', error);
      toast.error(error.message || "Erreur lors de l'envoi du lien");
    } finally {
      setSendingLink(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    try {
      setCancelLoading(true);
      await subscriptionsAPI.cancelBilling(cancelTarget.id, cancelImmediate);
      toast.success(cancelImmediate ? 'Abonnement arrêté immédiatement' : 'Résiliation programmée en fin de période');
      setCancelTarget(null);
      setCancelImmediate(false);
      fetchSubscriptions();
    } catch (error) {
      console.error('Erreur résiliation:', error);
      toast.error(error.message || 'Erreur lors de la résiliation');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleResume = async (sub) => {
    try {
      setResumeLoading(sub.id);
      await subscriptionsAPI.resumeBilling(sub.id);
      toast.success('Abonnement réactivé');
      fetchSubscriptions();
    } catch (error) {
      console.error('Erreur réactivation:', error);
      toast.error(error.message || 'Erreur lors de la réactivation');
    } finally {
      setResumeLoading(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await subscriptionsAPI.delete(deleteTarget.id);
      toast.success('Abonnement supprimé');
      setDeleteTarget(null);
      fetchSubscriptions();
    } catch (error) {
      console.error('Erreur suppression:', error);
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-text-muted text-sm">
          {subscriptions.length} abonnement{subscriptions.length !== 1 ? 's' : ''}
        </p>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={openForm}
          className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-indigo-700 text-white rounded-lg transition-colors"
        >
          <FiPlus />
          Créer un abonnement
        </motion.button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-muted">Chargement...</div>
      ) : subscriptions.length === 0 ? (
        <div className="text-center py-12 bg-surface/30 rounded-lg border border-border/50">
          <FiRepeat className="w-16 h-16 mx-auto text-gray-600 mb-4" />
          <p className="text-text-muted">Aucun abonnement</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((sub) => {
            const style = billingStatusConfig[sub.billing_status] || billingStatusConfig.none;
            const url = payLinks[sub.id];
            return (
              <motion.div
                key={sub.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface/30 border border-border/50 rounded-xl p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-text-primary font-semibold">{sub.label}</h3>
                      <span className={`text-xs px-2.5 py-1 rounded-full ${style.bg} ${style.text} font-medium`}>
                        {style.label}
                      </span>
                    </div>
                    <p className="text-indigo-300 text-sm flex items-center gap-2 mt-1">
                      <FiUser size={14} />
                      {sub.client_name || 'Client inconnu'}
                    </p>
                    <p className="text-text-muted text-sm mt-1">
                      <span className="text-text-primary font-medium">{formatAmount(sub.amount_eur)}</span>
                      {' · '}{periodicityLabel(sub)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => openEdit(sub)}
                      className="p-2 bg-surface-muted/60 hover:bg-surface-muted text-text-secondary rounded-lg transition-colors"
                      title="Modifier l'abonnement"
                    >
                      <FiEdit2 size={16} />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => openPreview(sub)}
                      className="p-2 bg-surface-muted/60 hover:bg-surface-muted text-text-secondary rounded-lg transition-colors"
                      title="Prévisualiser l'email et les conditions"
                    >
                      <FiEye size={16} />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleGenerateLink(sub)}
                      disabled={loadingLink === sub.id}
                      className="p-2 bg-accent/30 hover:bg-accent/50 text-indigo-300 rounded-lg transition-colors disabled:opacity-50"
                      title="Générer le lien de paiement"
                    >
                      <FiLink size={16} />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setEmailTarget(sub)}
                      disabled={sendingLink === sub.id}
                      className="p-2 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded-lg transition-colors disabled:opacity-50"
                      title="Envoyer le lien par email"
                    >
                      <FiSend size={16} />
                    </motion.button>
                    {(sub.billing_status === 'active' || sub.billing_status === 'past_due') && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => { setCancelTarget(sub); setCancelImmediate(false); }}
                        className="p-2 bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 rounded-lg transition-colors"
                        title="Arrêter"
                      >
                        <FiSlash size={16} />
                      </motion.button>
                    )}
                    {sub.billing_status === 'canceling' && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleResume(sub)}
                        disabled={resumeLoading === sub.id}
                        className="p-2 bg-green-600/30 hover:bg-green-600/50 text-green-300 rounded-lg transition-colors disabled:opacity-50"
                        title="Réactiver"
                      >
                        <FiRotateCcw size={16} />
                      </motion.button>
                    )}
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setDeleteTarget(sub)}
                      className="p-2 bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded-lg transition-colors"
                      title="Supprimer"
                    >
                      <FiTrash2 size={16} />
                    </motion.button>
                  </div>
                </div>

                {url && (
                  <div className="mt-3 bg-surface-muted/40 rounded-lg p-3">
                    <p className="text-xs text-text-muted mb-2">Lien de paiement (carte ou SEPA) :</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={url}
                        onFocus={(e) => e.target.select()}
                        className="flex-1 min-w-0 bg-surface/60 border border-border rounded-lg px-3 py-2 text-sm text-text-secondary"
                      />
                      <button
                        onClick={() => handleCopyLink(sub)}
                        className="px-3 py-2 bg-accent/40 hover:bg-accent/60 text-indigo-200 rounded-lg text-sm flex items-center gap-1"
                      >
                        {copiedId === sub.id ? <FiCheck size={14} /> : <FiCopy size={14} />}
                        {copiedId === sub.id ? 'Copié' : 'Copier'}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modale création */}
      <AnimatePresence>
        {formOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={() => setFormOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-surface-muted border border-border rounded-2xl max-w-lg w-full flex flex-col max-h-[90vh] overflow-hidden"
              style={{ maxHeight: '90dvh' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-border shrink-0">
                <h2 className="text-xl font-bold text-text-primary">{editingId ? "Modifier l'abonnement" : 'Nouvel abonnement'}</h2>
                <button onClick={() => setFormOpen(false)} className="text-text-muted hover:text-text-primary">
                  <FiX size={22} />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
                <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">Client</label>
                  <select
                    value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                    className="w-full px-3 py-2 bg-surface/60 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500"
                    required
                  >
                    <option value="">Sélectionner un client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-text-secondary mb-1">Libellé</label>
                  <input
                    type="text"
                    value={form.label}
                    onChange={(e) => setForm({ ...form, label: e.target.value })}
                    placeholder="Ex. Hébergement Premium"
                    className="w-full px-3 py-2 bg-surface/60 border border-border rounded-lg text-text-primary placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                {editBillingActive && (
                  <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
                    <FiAlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>Le prélèvement Stripe est actif : le montant et la périodicité sont verrouillés (les modifier ici ne changerait pas le prélèvement réel). Pour changer le prix, arrêtez l'abonnement puis recréez-en un.</span>
                  </div>
                )}

                <div>
                  <label className="block text-sm text-text-secondary mb-1">Montant (€)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount_eur}
                    onChange={(e) => setForm({ ...form, amount_eur: e.target.value })}
                    placeholder="0.00"
                    disabled={editBillingActive}
                    className="w-full px-3 py-2 bg-surface/60 border border-border rounded-lg text-text-primary placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    required={!editBillingActive}
                  />
                </div>

                <div>
                  <label className="block text-sm text-text-secondary mb-1">Périodicité</label>
                  <select
                    value={form.periodicity}
                    onChange={(e) => setForm({ ...form, periodicity: e.target.value })}
                    disabled={editBillingActive}
                    className="w-full px-3 py-2 bg-surface/60 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="month">Mensuel</option>
                    <option value="year">Annuel</option>
                    <option value="custom">Personnalisé (tous les N mois)</option>
                  </select>
                </div>

                {form.periodicity === 'custom' && (
                  <div>
                    <label className="block text-sm text-text-secondary mb-1">Tous les N mois</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.interval_count}
                      onChange={(e) => setForm({ ...form, interval_count: e.target.value })}
                      disabled={editBillingActive}
                      className="w-full px-3 py-2 bg-surface/60 border border-border rounded-lg text-text-primary focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                )}

                {/* Conditions (PDF joint à l'envoi du lien) */}
                <div className="pt-2 border-t border-border/60">
                  <p className="text-sm font-semibold text-text-primary mb-3">Conditions (PDF joint à l'email)</p>

                  <div className="mb-3">
                    <label className="block text-sm text-text-secondary mb-1">Intro</label>
                    <textarea
                      value={form.cond_intro}
                      onChange={(e) => setForm({ ...form, cond_intro: e.target.value })}
                      rows={2}
                      placeholder="Texte d'introduction du document de conditions..."
                      className="w-full px-3 py-2 bg-surface/60 border border-border rounded-lg text-text-primary placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-y"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="block text-sm text-text-secondary mb-1">Inclus <span className="text-gray-500">(une ligne par élément)</span></label>
                    <textarea
                      value={form.cond_included}
                      onChange={(e) => setForm({ ...form, cond_included: e.target.value })}
                      rows={3}
                      placeholder={"Hébergement et nom de domaine\nSupport par email\n..."}
                      className="w-full px-3 py-2 bg-surface/60 border border-border rounded-lg text-text-primary placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-y"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="block text-sm text-text-secondary mb-1">Exclus <span className="text-gray-500">(une ligne par élément)</span></label>
                    <textarea
                      value={form.cond_excluded}
                      onChange={(e) => setForm({ ...form, cond_excluded: e.target.value })}
                      rows={3}
                      placeholder={"Développements spécifiques\nRefonte graphique\n..."}
                      className="w-full px-3 py-2 bg-surface/60 border border-border rounded-lg text-text-primary placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-y"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-text-secondary mb-1">Modalités <span className="text-gray-500">(« Clé : valeur » par ligne)</span></label>
                    <textarea
                      value={form.cond_modalites}
                      onChange={(e) => { setForm({ ...form, cond_modalites: e.target.value }); setModalitesTouched(true); }}
                      rows={5}
                      className="w-full px-3 py-2 bg-surface/60 border border-border rounded-lg text-text-primary placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-y"
                    />
                    <p className="text-xs text-gray-500 mt-1">Pré-rempli selon la périodicité (engagement, facturation, résiliation, responsabilité).</p>
                  </div>
                </div>
                </div>

                <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0 bg-surface-muted">
                  <button
                    type="button"
                    onClick={() => setFormOpen(false)}
                    className="flex-1 px-4 py-2.5 border-2 border-overlay/20 text-text-primary hover:bg-overlay/10 rounded-lg font-medium transition-all"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 bg-accent hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Enregistrement...' : (editingId ? 'Enregistrer' : "Créer l'abonnement")}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modale résiliation (même logique que la maintenance) */}
      <AnimatePresence>
        {cancelTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setCancelTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-gradient-to-br from-surface-muted via-surface to-surface-muted border border-rose-500/30 rounded-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="bg-rose-500/20 text-rose-400 p-3 rounded-xl">
                  <FiSlash className="text-2xl" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-text-primary mb-1">Arrêter l'abonnement</h3>
                  <p className="text-text-secondary text-sm">
                    « {cancelTarget.label} » — {cancelTarget.client_name || 'client'}
                  </p>
                </div>
              </div>

              <label className="flex items-start gap-3 p-3 bg-overlay/5 rounded-lg border border-overlay/10 cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={cancelImmediate}
                  onChange={(e) => setCancelImmediate(e.target.checked)}
                  className="mt-1"
                />
                <span className="text-sm text-text-secondary">
                  Arrêter <strong className="text-text-primary">immédiatement</strong>. Sinon, l'abonnement
                  reste actif jusqu'à la fin de la période déjà payée (résiliation programmée).
                </span>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => setCancelTarget(null)}
                  className="flex-1 px-4 py-2.5 border-2 border-overlay/20 text-text-primary hover:bg-overlay/10 rounded-lg font-medium transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmCancel}
                  disabled={cancelLoading}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {cancelLoading ? 'Traitement...' : (cancelImmediate ? 'Arrêter maintenant' : 'Programmer')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modale suppression */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-gradient-to-br from-surface-muted via-surface to-surface-muted border border-red-500/30 rounded-2xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="bg-red-500/20 text-red-400 p-3 rounded-xl">
                  <FiTrash2 className="text-2xl" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-text-primary mb-1">Supprimer l'abonnement</h3>
                  <p className="text-text-secondary text-sm">
                    Cette action supprime l'abonnement du CRM. Si un paiement récurrent Stripe est
                    actif, pensez à l'arrêter avant.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 px-4 py-2.5 border-2 border-overlay/20 text-text-primary hover:bg-overlay/10 rounded-lg font-medium transition-all"
                >
                  Annuler
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                >
                  Supprimer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modale d'aperçu (ce que le client va recevoir) */}
      <AnimatePresence>
        {previewTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setPreviewTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-surface-muted border border-border rounded-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden"
              style={{ maxHeight: '90dvh' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center px-6 py-4 border-b border-border shrink-0">
                <h2 className="text-xl font-bold text-text-primary">Aperçu de l'envoi</h2>
                <button onClick={() => setPreviewTarget(null)} className="text-text-muted hover:text-text-primary">
                  <FiX size={22} />
                </button>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                {previewLoading ? (
                  <p className="text-text-muted text-sm text-center py-8">Chargement de l'aperçu…</p>
                ) : previewData ? (
                  <>
                    {/* Destinataire (pour vérifier le bon mail) */}
                    <div>
                      <p className="text-xs text-text-muted mb-1">Destinataire</p>
                      {previewData.hasEmail ? (
                        <p className="text-text-primary font-medium">{previewData.recipient}</p>
                      ) : (
                        <p className="flex items-center gap-2 text-rose-300 font-medium">
                          <FiAlertTriangle size={14} /> Aucune adresse email sur la fiche client — l'envoi échouera.
                        </p>
                      )}
                      <p className="text-xs text-text-muted mt-1">
                        L'email vient de la fiche client. Mauvais mail ? Corrigez-le sur le client, ou changez le client lié via « Modifier ».
                      </p>
                    </div>

                    {/* Sujet */}
                    <div>
                      <p className="text-xs text-text-muted mb-1">Sujet</p>
                      <p className="text-text-primary">{previewData.subject}</p>
                    </div>

                    {/* Corps de l'email */}
                    <div>
                      <p className="text-xs text-text-muted mb-1">Corps de l'email</p>
                      <iframe
                        title="Aperçu de l'email"
                        srcDoc={previewData.emailHtml}
                        className="w-full h-56 bg-white rounded-lg border border-border"
                      />
                    </div>

                    {/* Conditions (PDF joint) */}
                    {previewData.conditionsHtml && (
                      <div>
                        <p className="text-xs text-text-muted mb-1">Conditions (PDF joint à l'email)</p>
                        <iframe
                          title="Aperçu des conditions"
                          srcDoc={previewData.conditionsHtml}
                          className="w-full h-96 bg-white rounded-lg border border-border"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-text-muted text-sm text-center py-8">Aperçu indisponible.</p>
                )}
              </div>
              <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0 bg-surface-muted">
                <button
                  onClick={() => setPreviewTarget(null)}
                  className="flex-1 px-4 py-2.5 border-2 border-overlay/20 text-text-primary hover:bg-overlay/10 rounded-lg font-medium transition-all"
                >
                  Fermer
                </button>
                <button
                  onClick={() => { const t = previewTarget; setPreviewTarget(null); setEmailTarget(t); }}
                  disabled={!previewData || !previewData.hasEmail}
                  className="flex-1 px-4 py-2.5 bg-accent hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <FiSend size={15} /> Envoyer…
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BillingLinkEmailModal
        isOpen={!!emailTarget}
        onClose={() => setEmailTarget(null)}
        onSend={handleSendEmail}
        title="Envoyer le lien de paiement"
        clientName={emailTarget?.client_name || ''}
        defaultMessage={emailTarget
          ? `Bonjour ${emailTarget.client_name || ''},\n\nComme convenu, voici le lien pour mettre en place le paiement de votre abonnement « ${emailTarget.label} ». Vous trouverez les conditions détaillées en pièce jointe.\n\nBien à vous,`
          : ''}
        conditionsLabel="Conditions de l'abonnement"
      />
    </div>
  );
};

export default SubscriptionsTab;
