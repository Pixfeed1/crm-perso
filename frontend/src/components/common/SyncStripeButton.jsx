// « Vérifier auprès de Stripe » : aligne le statut du prélèvement sur Stripe (si une notification
// de Stripe n'est pas arrivée). api : { syncBilling(id) } (abonnements ou contrats de maintenance).
import React, { useState } from 'react';
import { FiRefreshCw } from 'react-icons/fi';
import { useToast } from '../../hooks/useToast';

const LIBELLES = {
  none: 'pas de prélèvement', pending: "en attente d'autorisation", active: 'prélèvement actif',
  past_due: 'impayé', canceling: 'résiliation prévue', canceled: 'résilié'
};

const SyncStripeButton = ({ api, id, onDone, className = '' }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const verifier = async () => {
    setBusy(true);
    try {
      const r = await api.syncBilling(id);
      if (!r.trouve) toast.info('Aucun abonnement trouvé chez Stripe pour cette fiche : le client n’a pas encore souscrit.');
      else if (r.billing_status !== r.avant) toast.success(`Statut mis à jour d'après Stripe : ${LIBELLES[r.billing_status] || r.billing_status}`);
      else toast.success(`Déjà à jour : ${LIBELLES[r.billing_status] || r.billing_status}`);
      onDone && onDone(r);
    } catch (e) { toast.error(e.message || 'Vérification impossible'); } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={verifier} disabled={busy} title="Vérifier le statut du prélèvement auprès de Stripe"
      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-strong disabled:opacity-50 ${className}`}>
      <FiRefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Vérifier auprès de Stripe
    </button>
  );
};

export default SyncStripeButton;
