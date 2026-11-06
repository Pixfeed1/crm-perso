// backend/utils/leadStatusSync.js
//
// Lot 5 : UN SEUL statut, relation_status (celui du Suivi et des campagnes). Le Kanban, la liste et la
// fiche l'affichent. La colonne historique `status` est encore tenue à jour à partir de lui (tableau de
// bord, exports, anciens écrans) mais ne se modifie plus à la main.
//
// Historique : le CRM avait deux machines à états sur un lead :
//   - relation_status (Suivi/cockpit) : nouveau -> a_contacter -> en_discussion ->
//     devis_envoye -> gagne / perdu / pas_business  (le plus riche, source de vérité)
//   - status (Kanban) : nouveau / contacte / prospect / qualifié / négociation /
//     client / perdu
// Elles divergeaient (email envoyé => status='contacte' mais relation_status intact,
// et inversement). Ce mapping aligne `status` sur `relation_status` à chaque transition
// pour n'avoir qu'une seule vérité.
const RELATION_TO_STATUS = {
  nouveau: 'nouveau',
  a_contacter: 'nouveau',      // qualifié « à contacter » mais pas encore joint
  contacte: 'contacte',        // email parti, en attente de réponse
  en_discussion: 'contacte',   // le prospect a répondu (le Kanban reste plus grossier)
  devis_envoye: 'négociation',
  gagne: 'client',
  perdu: 'perdu',
  pas_business: 'pas_business' // aucune colonne Kanban -> disparaît du board (voulu)
};

function statusForRelation(relation) {
  return RELATION_TO_STATUS[relation] || null;
}

// Mapping inverse status (Kanban) -> relation_status (Suivi), pour la synchro
// bidirectionnelle (déplacer une carte dans le Kanban met à jour le Suivi).
// Volontairement approximatif : le Kanban est plus grossier que le Suivi
// (contacte/prospect/qualifié retombent tous sur 'en_discussion').
const STATUS_TO_RELATION = {
  nouveau: 'nouveau',
  new: 'nouveau',
  contacte: 'contacte',        // « Contacté » du Kanban = email parti, pas encore de réponse
  contacted: 'contacte',
  proposal: 'en_discussion',
  qualified: 'en_discussion',
  negotiation: 'devis_envoye',
  won: 'gagne',
  lost: 'perdu',
  prospect: 'en_discussion',
  'qualifié': 'en_discussion',
  'négociation': 'devis_envoye',
  client: 'gagne',
  perdu: 'perdu',
  pas_business: 'pas_business'
};

function relationForStatus(status) {
  return STATUS_TO_RELATION[status] || null;
}

const RELATIONS = ['nouveau', 'a_contacter', 'contacte', 'en_discussion', 'devis_envoye', 'gagne', 'perdu', 'pas_business'];
// Rang d'avancement (les issues perdu / pas_business sont traitées à part).
const RANG = { nouveau: 0, a_contacter: 1, contacte: 2, en_discussion: 3, devis_envoye: 4, gagne: 5 };

// Fusion d'un ancien statut Kanban avec le statut de relation, sans rien perdre :
// - un refus ou une opposition (pas_business) prime toujours ;
// - « Client » au Kanban l'emporte (fiche réellement convertie) ;
// - sinon on garde le plus avancé des deux ; « Perdu » au Kanban ne remplace qu'un statut non avancé.
function fusion(relation, status) {
  const rel = RELATIONS.includes(relation) ? relation : 'nouveau';
  const kb = relationForStatus(status);
  if (!kb || kb === rel) return rel;
  if (rel === 'pas_business') return rel;
  if (kb === 'gagne') return 'gagne';
  if (rel === 'gagne') return rel;
  if (kb === 'pas_business') return kb;
  if (kb === 'perdu') return (RANG[rel] || 0) <= RANG.contacte ? 'perdu' : rel;
  if (rel === 'perdu') return rel;
  return (RANG[kb] || 0) > (RANG[rel] || 0) ? kb : rel;
}

module.exports = { RELATION_TO_STATUS, statusForRelation, STATUS_TO_RELATION, relationForStatus, RELATIONS, fusion };
