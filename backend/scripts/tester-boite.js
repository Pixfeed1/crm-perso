/* Lot 7 : essai de la lecture de la boîte d'envoi, SANS RIEN ÉCRIRE (ni dans la boîte, ni dans le CRM).
   Se connecte en lecture seule et montre comment les derniers messages seraient triés et à quel
   prospect ils seraient rattachés. Identifiant et mot de passe : IMAP_USER / IMAP_PASSWORD, sinon ceux
   de l'envoi (EMAIL_USER / EMAIL_PASSWORD). Serveur : IMAP_HOST ; s'il est vide, l'essai tente le
   serveur d'envoi (EMAIL_HOST) puis imap.<domaine> et mail.<domaine>, et dit lequel répond.
   Usage, depuis backend/ :  node scripts/tester-boite.js [--derniers 20] [--serveur imap.exemple.fr] */
require('dotenv').config();
const { Pool } = require('pg');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { classer } = require('../utils/boiteClassement');
const { rattacher, acces } = require('../services/boiteService');

const arg = (n, def) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : def; };
const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };
const LIB = { rebond: 'REBOND', rebond_temporaire: 'non-remise temporaire', auto: 'réponse automatique', refus_probable: 'REFUS PROBABLE (à confirmer)', reponse: 'RÉPONSE' };

(async () => {
  const dossier = process.env.IMAP_DOSSIER || 'INBOX';
  const base = acces();
  if (!base.auth.user || !base.auth.pass) { console.log('Identifiant ou mot de passe introuvable (ni IMAP_USER / IMAP_PASSWORD, ni EMAIL_USER / EMAIL_PASSWORD dans backend/.env).'); process.exit(1); }
  // Serveurs à essayer : celui demandé, sinon IMAP_HOST, sinon le serveur d'envoi et les noms habituels.
  const dom = String(base.auth.user).split('@')[1] || '';
  const candidats = [...new Set([arg('serveur', null), process.env.IMAP_HOST, process.env.EMAIL_HOST, dom && `imap.${dom}`, dom && `mail.${dom}`].filter(Boolean))];
  let imap = null, hote = null;
  for (const h of candidats) {
    const essai = new ImapFlow(acces(h));
    essai.on('error', () => {});
    try { await essai.connect(); imap = essai; hote = h; break; } catch (e) { console.log(`  ${h} : ${e.authenticationFailed ? 'identifiant ou mot de passe refusé' : e.code || e.message}`); }
  }
  if (!imap) { console.log('\nAucun serveur de lecture n\'a répondu. Demandez à votre hébergeur le « serveur IMAP » de la boîte, puis relancez avec --serveur <nom>.'); await pool.end(); process.exit(1); }
  console.log(`Connexion OK à ${hote} (lecture seule).${process.env.IMAP_HOST ? '' : `\nPour activer la lecture automatique, ajoutez dans backend/.env : IMAP_HOST=${hote}`}`);
  const lock = await imap.getMailboxLock(dossier, { readOnly: true });
  try {
    const total = imap.mailbox.exists;
    const n = Math.min(Number(arg('derniers', 20)), total);
    console.log(`Dossier ${dossier} ouvert en lecture seule : ${total} message(s). Les ${n} derniers :\n`);
    let rattaches = 0;
    if (n > 0) {
      for await (const msg of imap.fetch(`${total - n + 1}:*`, { uid: true, source: true })) {
        const p = await simpleParser(msg.source);
        const c = classer(p);
        const lien = await rattacher(db, c.adresse);
        const qui = lien.lead_id ? `prospect #${lien.lead_id}` : lien.item ? `ligne de campagne #${lien.item.id}` : 'pas un prospect contacté : ignoré';
        if (lien.lead_id || lien.item) rattaches++;
        console.log(`  ${new Date(p.date || Date.now()).toLocaleString('fr-FR')}  ${(LIB[c.type] || c.type).padEnd(28)} ${c.adresse || '?'} -> ${qui}${c.raison ? ` (${c.raison})` : ''}`);
      }
    }
    console.log(`\n${rattaches} message(s) concernent des prospects. ESSAI : rien n'a été écrit, aucun message marqué lu.`);
  } finally { lock.release(); await imap.logout().catch(() => {}); await pool.end(); }
})().catch(async (e) => { console.error('Erreur :', e.message); await pool.end().catch(() => {}); process.exit(1); });
