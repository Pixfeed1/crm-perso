/* Essai réel du relecteur de prepare_draft, sur un court texte contenant des erreurs volontaires.
   Ne touche à aucun site WordPress ; un seul appel à l'API (quelques recherches web).
   Usage, depuis backend/ : node scripts/essai-relecture.js */
require('dotenv').config();
const { relire } = require('../services/wpBrouillon/relecture');

const champs = {
  titre: 'Blender 4.2 LTS : les nouveautées pour la motion capture',
  titre_seo: 'Blender 4.2 LTS et motion capture',
  meta: "Blender 4.2 LTS, sorti en 2019, et ce qu'il change pour la motion capture.",
  contenu: [
    '<!-- wp:paragraph -->',
    "<p>Blender 4.2 LTS est sorti en juillet 2019. Il est maintenu pendant dix ans et il n'importe plus les fichiers FBX.</p>",
    '<!-- /wp:paragraph -->',
    '<!-- wp:paragraph -->',
    "<p>Nous avons testé tout les addons de retargeting sur trois combinaisons, et le meilleur reste <a href=\"https://jurojin.net/\">Rokoko</a>.</p>",
    '<!-- /wp:paragraph -->',
  ].join('\n'),
};

(async () => {
  const debut = Date.now();
  const { champs: c, rapport: r } = await relire({ domaine: 'jurojin.net', champs, dossier: null });
  console.log(`modèle : ${r.modele} ; ${Math.round((Date.now() - debut) / 1000)} s ; recherches web : ${r.recherches_web ?? '?'}${r.erreurs_recherche ? ` (erreurs : ${r.erreurs_recherche.join(', ')})` : ''}`);
  console.log(`résumé : ${r.resume || '-'}`);
  console.log(`affirmations : ${JSON.stringify(r.affirmations || {})}`);
  for (const x of r.corrections_appliquees) console.log(`  CORRIGÉ [${x.type}] ${x.champ} : « ${x.avant} » → « ${x.apres} »${x.source ? ` (${x.source})` : ''}`);
  for (const x of r.corrections_non_appliquees || []) console.log(`  non appliqué [${x.type}] « ${x.avant} » → « ${x.apres} » : ${x.pourquoi}`);
  for (const x of r.signalements || []) console.log(`  signalé [${x.type}] « ${x.extrait} » : ${x.remarque}`);
  console.log(`\ntitre corrigé : ${c.titre}\ncontenu corrigé :\n${c.contenu}`);
})().catch((e) => { console.error('Erreur :', e.message); process.exit(1); });
