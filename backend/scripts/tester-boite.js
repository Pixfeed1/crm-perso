/* Lot 7 : essai de la lecture de la boîte d'envoi, SANS RIEN ÉCRIRE (ni dans la boîte, ni dans le CRM).
   Se connecte avec IMAP_* de backend/.env, ouvre le dossier en lecture seule et montre comment les
   derniers messages seraient triés et à quel prospect ils seraient rattachés.
   Usage, depuis backend/ :  node scripts/tester-boite.js [--derniers 20] */
require('dotenv').config();
const { Pool } = require('pg');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { classer } = require('../utils/boiteClassement');
const { rattacher, configuree } = require('../services/boiteService');

const arg = (n, def) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : def; };
const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };
const LIB = { rebond: 'REBOND', rebond_temporaire: 'non-remise temporaire', auto: 'réponse automatique', refus_probable: 'REFUS PROBABLE (à confirmer)', reponse: 'RÉPONSE' };

(async () => {
  if (!configuree()) { console.log('IMAP_HOST, IMAP_USER et IMAP_PASSWORD manquent dans backend/.env.'); process.exit(1); }
  const dossier = process.env.IMAP_DOSSIER || 'INBOX';
  const imap = new ImapFlow({ host: process.env.IMAP_HOST, port: Number(process.env.IMAP_PORT || 993), secure: process.env.IMAP_SECURE !== 'false', auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD }, logger: false });
  await imap.connect();
  console.log(`Connexion OK à ${process.env.IMAP_HOST} (${process.env.IMAP_USER}).`);
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
