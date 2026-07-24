// backend/utils/leadStatusSync.js
//
// Le CRM a deux machines à états historiques sur un lead :
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
  en_discussion: 'contacte',
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
  contacte: 'en_discussion',
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

module.exports = { RELATION_TO_STATUS, statusForRelation, STATUS_TO_RELATION, relationForStatus };
