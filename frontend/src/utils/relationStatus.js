// src/utils/relationStatus.js
// Statut de relation (suivi/prospection) + état "contact joint ?" + canaux de relance.
// Classes basées sur les tokens sémantiques (aucune couleur en dur).

export const RELATION_STATUSES = [
  { key: 'nouveau', label: 'Nouveau', cls: 'bg-neutral-bg text-neutral-text' },
  { key: 'a_contacter', label: 'À contacter', cls: 'bg-info-bg text-info-text' },
  { key: 'contacte', label: 'Contacté', cls: 'bg-info-bg text-info-text' },
  { key: 'en_discussion', label: 'En discussion', cls: 'bg-warning-bg text-warning-text' },
  { key: 'devis_envoye', label: 'Devis envoyé', cls: 'bg-info-bg text-info-text' },
  { key: 'gagne', label: 'Gagné', cls: 'bg-success-bg text-success-text' },
  { key: 'perdu', label: 'Perdu', cls: 'bg-danger-bg text-danger-text' },
  { key: 'pas_business', label: 'Pas de business', cls: 'bg-neutral-bg text-neutral-text' }
];

export const statusMeta = (key) =>
  RELATION_STATUSES.find((s) => s.key === key) || RELATION_STATUSES[0];

// Statut unique d'une fiche (lot 5) : relation_status ; à défaut, l'ancien statut Kanban converti.
const LEGACY_TO_RELATION = {
  new: 'nouveau', nouveau: 'nouveau', contacted: 'contacte', contacte: 'contacte',
  prospect: 'en_discussion', proposal: 'en_discussion', qualified: 'en_discussion', 'qualifié': 'en_discussion',
  negotiation: 'devis_envoye', 'négociation': 'devis_envoye', won: 'gagne', client: 'gagne',
  lost: 'perdu', perdu: 'perdu', pas_business: 'pas_business'
};
export const relationOf = (lead) => (lead && (lead.relation_status || LEGACY_TO_RELATION[lead.status])) || 'nouveau';

export const REACHED_OPTIONS = [
  { key: 'joint', label: 'Joint', verb: 'joint' },
  { key: 'pas_reponse', label: 'Pas de réponse', verb: 'pas de réponse' },
  { key: 'message', label: 'Message laissé', verb: 'message laissé' }
];

export const reachedMeta = (key) => REACHED_OPTIONS.find((r) => r.key === key) || null;

// Canaux de relance multi-canal.
export const CHANNELS = [
  { key: 'appel', label: 'Appel' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'autre', label: 'Autre' }
];

export const channelLabel = (key) => (CHANNELS.find((c) => c.key === key) || {}).label || '';
