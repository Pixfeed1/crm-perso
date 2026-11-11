/* Essais réels de modifier_seo, sans toucher aux vraies pages :
     node scripts/essai-modifier-seo.js 15                    SIMULATION sur https://pixfeed.net/decouvrir/ (rien écrit)
     node scripts/essai-modifier-seo.js 15 --brouillon        crée une page BROUILLON d'essai, y écrit titre SEO, méta,
                                                              phrase clé et titre, contrôle, puis la met à la corbeille
   N'affiche aucun accès. Les vrais titres se posent avec l'outil modifier_seo, en simulation d'abord. */
require('dotenv').config();
const { Pool } = require('pg');
const { client } = require('../services/wpBrouillon/wp');
const { modifierSeo } = require('../services/wpBrouillon/modifierSeo');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };
const siteId = Number(process.argv[2] || 15);
const URL_SIMULATION = process.argv.find((a) => /^https?:\/\//.test(a)) || 'https://pixfeed.net/decouvrir/';

function afficher(r) {
  console.log(`Statut : ${r.statut}`);
  if (r.page) console.log(`Contenu : #${r.page.id} (${r.page.type}, ${r.page.statut}) ${r.page.lien}`);
  if (r.avant) {
    console.log(`Avant : titre « ${r.avant.titre} » · titre SEO « ${r.avant.titre_seo} » · méta « ${r.avant.meta_description} » · phrase clé « ${r.avant.phrase_cle} »`);
    console.log(`        contenu : ${r.avant.contenu_longueur} caractères, sha256 ${r.avant.contenu_sha256}`);
    console.log(`        page publique : ${typeof r.avant.page_publique === 'string' ? r.avant.page_publique : JSON.stringify(r.avant.page_publique)}`);
  }
  for (const a of r.actions) console.log(`  · ${a.quoi} : « ${a.avant} » -> « ${a.apres} » (${a.longueur} caractères)`);
  if (r.date_modification) console.log(`Date : ${r.date_modification.wordpress}${r.date_modification.page ? ` ; ${r.date_modification.page}` : ''}`);
  if (r.contenu) console.log(`Contenu après écriture : ${r.contenu.identique ? 'IDENTIQUE (même sha256)' : 'DIFFÉRENT (anormal)'}`);
  if (r.modifie_le) console.log(`Date de modification : ${r.modifie_le.avant} -> ${r.modifie_le.apres}`);
  if (r.controle_yoast) for (const c of r.controle_yoast) console.log(`  Yoast ${c.champ} : ${c.ok ? 'OK' : `« ${c.affiche} » au lieu de « ${c.attendu} »`}`);
  if (r.page_publique && r.page_publique.controle) for (const c of r.page_publique.controle) console.log(`  Page publique ${c.champ} : ${c.ok ? 'OK' : `« ${c.affiche} » au lieu de « ${c.attendu} »`}`);
  for (const e of r.erreurs) console.log(`  BLOQUANT ${e.source} : ${e.message}`);
  for (const a of r.avertissements) console.log(`  attention ${a.source} : ${a.message}`);
}

(async () => {
  if (!process.argv.includes('--brouillon')) {
    console.log(`SIMULATION sur ${URL_SIMULATION} (valeurs d'essai, rien n'est écrit)\n`);
    afficher(await modifierSeo(db, { site_id: siteId, url: URL_SIMULATION, titre_seo: 'ESSAI simulation, ne sera pas écrit', meta_description: 'Méta description d\'essai pour la simulation : rien n\'est écrit sur la page.', simulation: true }));
    return;
  }
  const s = (await pool.query('SELECT domain, wp_base_url FROM seo_sites WHERE id = $1', [siteId])).rows[0];
  const wp = client(siteId, String(s.wp_base_url || `https://${s.domain}`));
  const page = await wp('wp/v2/pages', { methode: 'POST', corps: { title: 'Essai modifier_seo (CRM, à supprimer)', status: 'draft', content: '' } });
  console.log(`Page brouillon d'essai créée : #${page.id}\n`);
  try {
    console.log('1. Simulation :');
    afficher(await modifierSeo(db, { site_id: siteId, id: page.id, titre_seo: 'Essai CRM : titre SEO', meta_description: 'Essai CRM : méta description écrite par modifier_seo.', phrase_cle: 'essai crm', titre: 'Essai modifier_seo (renommé)', simulation: true }));
    console.log('\n2. Écriture :');
    afficher(await modifierSeo(db, { site_id: siteId, id: page.id, titre_seo: 'Essai CRM : titre SEO', meta_description: 'Essai CRM : méta description écrite par modifier_seo.', phrase_cle: 'essai crm', titre: 'Essai modifier_seo (renommé)', simulation: false }));
  } finally {
    await wp(`wp/v2/pages/${page.id}`, { methode: 'DELETE' }).catch((e) => console.log(`Corbeille impossible : ${e.message} (supprimer #${page.id} à la main)`));
    console.log(`\nPage d'essai #${page.id} mise à la corbeille.`);
  }
})().catch((e) => { console.error('Erreur :', e.message); process.exitCode = 1; }).finally(() => pool.end());
