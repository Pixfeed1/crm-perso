#!/usr/bin/env node
// Prévisualise les emails « par la preuve » à partir d'un CSV du crawler (sortie de
// `cc_prospector detect` ou export du panneau Crawl), SANS base ni envoi. Sert à tester les
// règles sur des prospects déjà examinés avant toute mise en production.
//
//   node scripts/previewProofEmails.js resultats.csv            # tous les domaines
//   node scripts/previewProofEmails.js resultats.csv agrigom.fr # un seul
//   node scripts/previewProofEmails.js resultats.csv --sirene   # + recherche de l'entreprise
//                                                               #   (API publique, réseau requis)
//
// Variables utiles : OUTREACH_SENDER_NAME, OUTREACH_SENDER_COMPANY, OUTREACH_OFFER_URL.
const fs = require('fs');
const path = require('path');
const { csvToObjects } = require('../utils/csvParse');
const { typedResult } = require('../controllers/crawlController');
const { auditFlags, niveauFlag, promotionBlocker } = require('../utils/prospectScore');
const { buildProofEmail } = require('../services/proofEmailService');

const args = process.argv.slice(2);
const withSirene = args.includes('--sirene');
const positional = args.filter((a) => !a.startsWith('--'));
const file = positional[0];
const only = (positional[1] || '').toLowerCase().replace(/^www\./, '');
const sireneEnrich = withSirene ? require('../services/sireneEnrich') : null;
const { decodeHtml } = require('../utils/decodeHtml');
if (!file || !fs.existsSync(file)) {
  console.error('Usage : node scripts/previewProofEmails.js <fichier.csv> [domaine]');
  process.exit(1);
}
const rows = csvToObjects(fs.readFileSync(path.resolve(file), 'utf8'));
(async () => {
let n = 0;
for (const raw of rows) {
  const r = typedResult(raw);
  if (!r.domain) continue;
  if (only && r.domain.toLowerCase().replace(/^www\./, '') !== only) continue;
  // Colonnes d'enrichissement SIRENE si présentes dans l'export (panneau Crawl).
  for (const k of ['raison_sociale', 'gerant', 'gerant_nom', 'gerant_prenom', 'sirene_match', 'ville', 'siren', 'naf_label']) {
    if (raw[k] != null && raw[k] !== '') r[k] = raw[k];
  }
  n++;
  if (sireneEnrich) {
    // Même logique que le bouton « Enrichir SIRENE » du panneau Crawl, avec le code postal du site.
    const title = (decodeHtml(r.title) || '').trim();
    const data = await sireneEnrich.enrichMatch({ query: title || r.domain.replace(/^www\./, '').split('.')[0], domain: r.domain, title, code_postal_site: r.code_postal_site || '' });
    if (data.found) {
      r.sirene_match = data.match;
      if (data.match !== 'douteux') Object.assign(r, { raison_sociale: data.raison_sociale, gerant: data.dirigeant, gerant_nom: data.dirigeant_nom, gerant_prenom: data.dirigeant_prenom, ville: data.ville, code_postal: data.code_postal, siren: data.siren, naf_label: data.naf_label });
      console.log(`SIRENE : ${data.match} (score ${data.match_score}${data.match_second != null ? `, second ${data.match_second}` : ''}) ${data.raison_sociale || ''} ${data.code_postal || ''} ${data.ville || ''}`);
    } else console.log('SIRENE : aucune entreprise trouvée');
    await new Promise((res) => setTimeout(res, 250));
  }
  const flags = auditFlags(r);
  console.log('═'.repeat(78));
  console.log(`${r.domain}  [${r.platform || '?'}${r.platform_version ? ' ' + r.platform_version : ''}]  HTTP ${r.http_status ?? '?'}  ${r.final_url || ''}`);
  console.log(`analysé le : ${r.analyse_le || 'inconnu'} · ssl_ok=${r.ssl_ok} ssl_erreur=${r.ssl_erreur || '-'} https_final=${r.https_final} · sitemap=${r.sitemap} (${r.sitemap_detail || '-'}) · php=${r.serveur_php || '-'} (${r.php_source || '-'}) · cp site=${r.code_postal_site || '-'}`);
  const blocker = promotionBlocker(r);
  if (blocker) console.log(`BLOQUÉ à la promotion : ${blocker}`);
  console.log(`signaux : ${flags.map((f) => `${f.key}${niveauFlag && niveauFlag(f.key) === 'preuve' ? '*' : ''}`).join(', ') || 'aucun'}   (* = preuve)`);
  const d = buildProofEmail(r, {});
  if (!d.ok) { console.log(`-> PAS D'EMAIL : ${d.raison}`); continue; }
  console.log(`-> preuve retenue : ${d.preuve} | brut : ${d.detail.brut} | identité : ${d.detail.identite}`);
  console.log(`\nObjet : ${d.subject}\n`);
  console.log(d.body);
  console.log('');
}
if (n === 0) console.log(only ? `Domaine ${only} absent du fichier.` : 'Aucune ligne.');
})();
