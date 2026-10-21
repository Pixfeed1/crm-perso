// backend/utils/campaignRules.js
//
// Règles PURES du module Campagnes (sans base ni réseau) :
//  - classifyItem : prêt / à vérifier / exclu, avec la raison, à partir de la fiche, de la
//    ligne de crawl, des contrôles d'exclusion déjà faits (désinscrit, déjà sollicité…) et de
//    l'email généré ;
//  - planSlots : créneaux d'envoi à cadence lente (par jour, plage horaire, espacement, jours
//    ouvrés), en heure de Paris.
// Testé dans tests/campaign.test.js.

const { promotionBlocker } = require('./prospectScore');

const FERMES = new Set(['gagne', 'perdu', 'pas_business', 'client']);

/**
 * Classe un prospect pour une campagne.
 * @param {object} p
 * @param {object} p.lead            fiche (email, relation_status, company, website)
 * @param {object|null} p.row        ligne crawl_results (peut être null)
 * @param {object} p.controles       { optout: bool, dejaSollicite: number|null (jours), autreCampagne: bool, dejaEnvoyeCampagne: bool }
 * @param {object|null} p.email      { ok, mode, subject, body, raison } résultat de la génération
 * @returns {{ statut: 'pret'|'a_verifier'|'exclu', raison: string|null }}
 */
function classifyItem({ lead, row, controles = {}, email }) {
  const to = String((lead && lead.email) || '').trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { statut: 'exclu', raison: 'aucune adresse email valide' };
  if (controles.optout) return { statut: 'exclu', raison: 'désinscrit ou opposition : bloqué définitivement' };
  if (controles.dejaEnvoyeCampagne) return { statut: 'exclu', raison: 'déjà sollicité dans cette campagne' };
  if (controles.dejaSollicite != null && controles.dejaSollicite < 90) return { statut: 'exclu', raison: `déjà sollicité par email il y a ${controles.dejaSollicite} jour${controles.dejaSollicite > 1 ? 's' : ''} (moins de 90)` };
  if (controles.autreCampagne) return { statut: 'exclu', raison: 'déjà dans une autre campagne active' };
  if (lead && FERMES.has(String(lead.relation_status || ''))) return { statut: 'exclu', raison: `fiche ${lead.relation_status} : pas de prospection` };
  if (row) {
    const blocker = promotionBlocker(row);
    if (blocker) return { statut: 'exclu', raison: blocker };
  }
  if (!email || !email.ok) return { statut: 'exclu', raison: (email && email.raison) || 'aucun email généré' };
  // À vérifier : tout ce qu'un humain doit regarder avant d'envoyer.
  if (!row) return { statut: 'a_verifier', raison: 'aucune mesure du site : réanalyser avant envoi' };
  if (!row.analyse_le) return { statut: 'a_verifier', raison: 'mesures de l\'ancien crawl : réanalyser avant envoi' };
  const domaine = String(row.domain || lead.company || '').toLowerCase().replace(/^www\./, '');
  const emailDomain = to.split('@')[1].toLowerCase();
  if (domaine && emailDomain && !emailDomain.endsWith(domaine) && !domaine.endsWith(emailDomain) && !/gmail|orange|wanadoo|free|hotmail|outlook|yahoo|laposte|sfr|bbox|icloud|protonmail/.test(emailDomain)) {
    return { statut: 'a_verifier', raison: `adresse d'un autre domaine (${emailDomain})` };
  }
  if (row.sirene_match === 'probable' || row.sirene_match === 'douteux') return { statut: 'a_verifier', raison: `identité SIRENE ${row.sirene_match} : relire le nom de la boutique` };
  if (email.mode === 'maintenance') return { statut: 'pret', raison: 'aucune preuve : email de maintenance sans alerte' };
  return { statut: 'pret', raison: null };
}

// ─── Créneaux d'envoi ───────────────────────────────────────────────────────
const TZ = 'Europe/Paris';
function parisParts(d) {
  const f = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short' });
  const parts = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { hour: parseInt(parts.hour, 10) % 24, minute: parseInt(parts.minute, 10), weekday: parts.weekday };
}
function isWeekend(d) {
  const w = parisParts(d).weekday.toLowerCase();
  return w.startsWith('sam') || w.startsWith('dim');
}
// Prochain instant >= d dont l'heure de Paris vaut `hour`:00 (même jour si possible, sinon le lendemain).
function atParisHour(d, hour) {
  const x = new Date(d);
  x.setUTCSeconds(0, 0);
  for (let i = 0; i < 48 * 60; i++) {
    const p = parisParts(x);
    if (p.hour === hour && p.minute === 0) return x;
    x.setUTCMinutes(x.getUTCMinutes() + 1);
  }
  return x;
}

/**
 * Répartit n envois : par_jour maximum par jour, entre heure_debut et heure_fin (Paris),
 * espacés d'au moins espacement_min minutes, jours ouvrés seulement si demandé.
 * @returns {Date[]} créneaux croissants
 */
function planSlots(n, { par_jour = 15, heure_debut = 9, heure_fin = 18, espacement_min = 20, jours_ouvres = true } = {}, now = new Date()) {
  const slots = [];
  const parJour = Math.max(1, Math.min(200, par_jour | 0));
  const debut = Math.max(0, Math.min(23, heure_debut | 0));
  const fin = Math.max(debut + 1, Math.min(24, heure_fin | 0));
  const pas = Math.max(1, espacement_min | 0);
  // Espacement effectif : au moins `pas`, et au plus ce qui permet de caser par_jour dans la plage.
  const fenetreMin = (fin - debut) * 60;
  const pasEffectif = Math.max(pas, Math.floor(fenetreMin / parJour));
  let cursor = new Date(now.getTime() + 2 * 60000); // jamais « tout de suite » : 2 min de marge
  cursor.setUTCSeconds(0, 0);
  let guard = 0;
  while (slots.length < n && guard++ < 10000) {
    const p = parisParts(cursor);
    if ((jours_ouvres && isWeekend(cursor)) || p.hour >= fin) {
      // Jour suivant à l'heure de début.
      const next = new Date(cursor.getTime() + 24 * 3600000);
      cursor = atParisHour(new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), 0, 0)), debut);
      continue;
    }
    if (p.hour < debut) { cursor = atParisHour(cursor, debut); continue; }
    // Envois du jour : on remplit la journée courante.
    let dansLaJournee = 0;
    while (slots.length < n && dansLaJournee < parJour) {
      const q = parisParts(cursor);
      if (q.hour >= fin) break;
      slots.push(new Date(cursor));
      dansLaJournee++;
      cursor = new Date(cursor.getTime() + pasEffectif * 60000);
    }
    if (slots.length < n) {
      const next = new Date(cursor.getTime() + 24 * 3600000);
      cursor = atParisHour(new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), 0, 0)), debut);
    }
  }
  return slots;
}

module.exports = { classifyItem, planSlots, isWeekend, parisParts };
