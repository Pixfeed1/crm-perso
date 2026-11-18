/* Essai de la relecture économe sur un vrai dépôt, sans rien écrire dans WordPress (appels réels à l'API) :
     node scripts/essai-relecture.js <numéro de dépôt>
   1. relecture du dépôt tel quel ;
   2. même contenu une seconde fois : doit coûter 0 $ (rapport enregistré, aucun appel) ;
   3. une phrase ajoutée au premier paragraphe : relecture incrémentale de ce seul paragraphe.
   Affiche pour chaque passage les jetons (entrée, sortie, cache lu, cache écrit), les recherches et le coût. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const depots = require('../services/wpBrouillon/depot');
const charte = require('../services/charteService');
const R = require('../services/wpBrouillon/relecture');

const pool = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'mcrm_dev', password: process.env.DB_PASSWORD || 'postgres', port: process.env.DB_PORT || 5432 });
const db = { pool };

(async () => {
  const id = Number(process.argv[2]);
  if (!id) throw new Error('numéro de dépôt attendu : node scripts/essai-relecture.js 187');
  const d = await depots.ouvrir(db, id);
  const m = JSON.parse(fs.readFileSync(d.manifeste, 'utf8'));
  if (!m.contenu) throw new Error('ce dépôt n\'a pas de fichier HTML (contenu) : prendre un dépôt avec un article complet');
  const html = fs.readFileSync(depots.resoudre(d.dossier, path.posix.join(d.base, m.contenu)), 'utf8');
  const site = (await pool.query('SELECT domain FROM seo_sites WHERE id = $1', [d.site_id])).rows[0];
  const fiche = await charte.courante(db, d.site_id).catch(() => null);
  const y = m.yoast || {};
  const champs = { titre: m.titre, titre_seo: y.titre, meta: y.meta, contenu: html };
  const repere = m.mode === 'mise_a_jour' ? `url:${String(m.url_origine).replace(/[?#].*$/, '').replace(/\/+$/, '')}` : m.brouillon_id ? `brouillon:${m.brouillon_id}` : m.slug ? `slug:${m.slug}` : `titre:${m.titre}`;
  const base = { db, domaine: site.domain, charte: fiche, site_id: d.site_id, depot_id: d.id, repere, manifeste: m };
  const passage = async (titre, ch) => {
    const t0 = Date.now();
    const r = await R.relire({ ...base, champs: ch });
    const c = r.rapport.consommation;
    console.log(`\n${titre} (${Math.round((Date.now() - t0) / 1000)} s)\n  ${r.rapport.cout}\n  faits : ${r.rapport.complete ? 'COMPLET' : 'INCOMPLET'}${r.rapport.non_verifiees ? ` (${r.rapport.non_verifiees.length} non vérifiée(s))` : ''} · ${r.rapport.corrections_appliquees.length} correction(s) · relecture n° ${c.relecture_id}`);
    return c;
  };
  console.log(`Dépôt ${d.id} · ${site.domain} · « ${m.titre} » · repère ${repere}${fiche ? ` · charte v${fiche.version}` : ''}`);
  const c1 = await passage('1. Dépôt tel quel', champs);
  const c2 = await passage('2. Même contenu, une seconde fois', champs);
  const modifie = html.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/i, (t, a, b, f) => `${a}${b} Cette phrase est ajoutée pour un essai de relecture.${f}`);
  if (modifie === html) throw new Error('aucun paragraphe <p> trouvé pour l\'essai de modification');
  const c3 = await passage('3. Une phrase ajoutée au premier paragraphe', { ...champs, contenu: modifie });
  const total = c1.cout_usd + c2.cout_usd + c3.cout_usd;
  console.log(`\nTotal des trois passages : ${total.toFixed(2).replace('.', ',')} $ · détail : node scripts/relectures.js`);
})().catch((e) => { console.error('Erreur :', e.message); process.exitCode = 1; })
  .finally(async () => { await pool.end().catch(() => {}); process.exit(process.exitCode || 0); });
