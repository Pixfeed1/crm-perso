/* Remplissage initial de la charte de rédaction (v1 de jurojin.net et de pixfeed.net), UNE SEULE FOIS.
     node scripts/charte-initiale.js            aperçu : ce qui sera créé (rien écrit)
     node scripts/charte-initiale.js --ecrire   crée la v1 des deux sites (refusé si une charte existe déjà)
   Données : scripts/donnees/charte-initiale.json, tirées telles quelles de charte-redaction-et-controles-crm.md et de
   controle_style.py (15/11/2026). Une fois la v1 créée, ce fichier est retiré du dépôt : la charte ne vit plus
   qu'en base (onglet SEO > Charte, outils get_charte / modifier_charte). */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const C = require('../services/charteService');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const fichier = path.join(__dirname, 'donnees', 'charte-initiale.json');

(async () => {
  if (!fs.existsSync(fichier)) { console.log(`Fichier ${fichier} absent : la charte a déjà été remplie, elle se modifie dans le CRM.`); return; }
  const ecrire = process.argv.includes('--ecrire');
  const r = await C.remplir({ pool }, JSON.parse(fs.readFileSync(fichier, 'utf8')), { auteur: 'Marc', simulation: !ecrire });
  for (const s of r.sites) console.log(`${s.domaine} (site ${s.site_id}) : v1, ${s.regles} règles communes, registre ${s.registre}, passages ${s.passages.join(', ') || 'aucun'}`);
  console.log(ecrire ? '\nÉcrit. Vérifier dans le CRM : SEO > Charte.' : '\nAperçu seulement. Pour créer la v1 : node scripts/charte-initiale.js --ecrire');
})().catch((e) => { console.error('Refusé :', e.message); process.exitCode = 1; }).finally(() => pool.end());
