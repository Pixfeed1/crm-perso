#!/usr/bin/env node
/* Relire une copie chiffrée du CRM sans le CRM (serveur perdu, par exemple), sur n'importe quelle machine avec Node.
     node dechiffrer-sauvegarde.js crm-20261116-0341.dump.chiffre
   La clé (celle rangée dans le gestionnaire de mots de passe, espaces compris ou non) est demandée sans s'afficher.
   Résultat : crm-20261116-0341.dump, à restaurer avec  pg_restore -d <base> crm-20261116-0341.dump
   Aucune dépendance : seulement Node (crypto). */
const fs = require('fs');
const path = require('path');
const { dechiffrer, cleDepuisTexte } = require('../services/sauvegardeDrive');

const source = process.argv[2];
if (!source || !fs.existsSync(source)) { console.error('Usage : node dechiffrer-sauvegarde.js <copie .dump.chiffre>'); process.exit(1); }
const cible = source.replace(/\.chiffre$/, '') + (source.endsWith('.chiffre') ? '' : '.dump');

function demanderCle() {
  if (process.env.CLE_SAUVEGARDE) return Promise.resolve(process.env.CLE_SAUVEGARDE);
  return new Promise((ok) => {
    process.stdout.write('Clé de chiffrement (ne s\'affiche pas) : ');
    const entree = process.stdin;
    let cle = '';
    if (entree.isTTY) entree.setRawMode(true);
    entree.resume(); entree.setEncoding('utf8');
    entree.on('data', function lire(c) {
      for (const ch of c) {
        if (ch === '\r' || ch === '\n') { if (entree.isTTY) entree.setRawMode(false); entree.pause(); entree.removeListener('data', lire); process.stdout.write('\n'); return ok(cle); }
        if (ch === '\u0003') process.exit(1);
        cle += ch;
      }
    });
  });
}

(async () => {
  const cle = cleDepuisTexte(await demanderCle());
  await dechiffrer(source, cible, cle);
  console.log(`Déchiffrée : ${path.resolve(cible)}\nRestaurer : pg_restore -d <base> "${cible}"`);
})().catch((e) => { console.error('Échec :', e.message); process.exit(1); });
