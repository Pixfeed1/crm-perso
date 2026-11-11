/* Essai de l'envoi de netlinking d'un site (jurojin.net : site 2), sans toucher aux vraies cibles.
     node scripts/essai-outreach.js 2                         réglages + connexion au serveur de mail (RIEN envoyé)
     node scripts/essai-outreach.js 2 --envoyer moi@exemple.fr  vrai mail d'essai à VOTRE adresse, par l'endpoint
                                                                 (tous les contrôles), puis nettoyage : niche et cible
                                                                 d'essai supprimées, plafond et délai du jour rendus
   N'affiche ni mot de passe ni signature. */
require('dotenv').config();
const { Pool } = require('pg');
const site = require('../services/outreachSite');
const S = require('../services/outreachService');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };
const siteId = Number(process.argv[2] || 2);
const i = process.argv.indexOf('--envoyer');
const destinataire = i > 0 ? process.argv[i + 1] : null;

(async () => {
  const c = site.config(siteId);
  if (!c) { console.log(`Réglages OUTREACH_*_${siteId} incomplets dans backend/.env.`); process.exitCode = 1; return; }
  console.log(`1. Réglages : expéditeur ${c.adresse}, serveur ${c.host}:${c.port}, plafond ${c.plafond} par jour.`);
  console.log(`2. Signature : ${site.signature(c) ? 'trouvée' : `ABSENTE (${c.fichierSignature})`}.`);
  try {
    await require('nodemailer').createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass } }).verify();
    console.log('3. Connexion au serveur de mail : OK (identifiant et mot de passe acceptés). Rien envoyé.');
  } catch (e) { console.log(`3. Connexion au serveur de mail : ÉCHEC (${e.message}).`); process.exitCode = 1; return; }
  if (!destinataire) { console.log('\nPour un vrai mail d\'essai à votre adresse : ajouter --envoyer votre@adresse.fr'); return; }

  // Niche et cible d'essai, le temps de l'envoi.
  const etat = (await pool.query('SELECT prochain_envoi_le FROM outreach_etat WHERE site = $1', [siteId])).rows[0];
  const niche = (await pool.query("INSERT INTO seo_niches (name, site_cible, site_id, statut) VALUES ('Essai envoi (à supprimer)', $1, $2, 'archivee') RETURNING id", [c.domaine, siteId])).rows[0].id;
  const cible = (await pool.query("INSERT INTO seo_link_targets (niche_id, domain, via, statut, notes) VALUES ($1, 'essai-envoi-crm.invalid', 'manuel', 'nouveau', 'cible d''essai') RETURNING id", [niche])).rows[0].id;
  try {
    // Cadence : on libère le délai pour l'essai, il est rendu ensuite.
    await pool.query('UPDATE outreach_etat SET prochain_envoi_le = NULL WHERE site = $1', [siteId]);
    const r = await S.envoyerMail(db, { site_id: siteId, target_id: cible, destinataire, objet: 'Essai d\'envoi depuis le CRM', corps: 'Bonjour,\n\nCeci est un mail d\'essai envoyé par le CRM, avec la signature du site.\n\nRien à faire.', simulation: false });
    console.log(`4. Mail d'essai envoyé à ${destinataire} depuis ${c.adresse} (Message-ID ${r.mail.message_id}).`);
    for (const x of r.controles) console.log(`   ✓ ${x.texte}`);
    console.log('   Vérifiez dans votre boîte : expéditeur, signature, et qu\'il n\'est pas arrivé en spam.');
  } catch (e) {
    console.log(`4. Envoi refusé : ${e.message}`);
    process.exitCode = 1;
  } finally {
    await pool.query('DELETE FROM outreach_mails WHERE target_id = $1', [cible]);
    await pool.query('DELETE FROM seo_link_targets WHERE id = $1', [cible]);
    await pool.query('DELETE FROM seo_niches WHERE id = $1', [niche]);
    await pool.query('INSERT INTO outreach_etat (site, prochain_envoi_le) VALUES ($1, $2) ON CONFLICT (site) DO UPDATE SET prochain_envoi_le = $2', [siteId, etat ? etat.prochain_envoi_le : null]);
    console.log('   Nettoyage : niche, cible et ligne d\'essai supprimées ; plafond et délai du jour inchangés.');
  }
})().catch((e) => { console.error('Erreur :', e.message); process.exitCode = 1; }).finally(() => pool.end());
