// Diagnostic France Travail : teste l'authentification et une recherche, sans exposer
// les secrets. Dit si le problème vient de l'AUTH (scope/app) ou du FILTRE de la veille.
//   node backend/scripts/testFranceTravail.js
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const pe = require('../services/poleEmploiService');

(async () => {
  const id = (process.env.POLE_EMPLOI_CLIENT_ID || '').trim();
  const secret = (process.env.POLE_EMPLOI_CLIENT_SECRET || '').trim();
  const scope = (process.env.POLE_EMPLOI_SCOPE || 'api_offresdemploiv2 o2dsoffre').trim();
  console.log('--- Config (.env) ---');
  console.log('  CLIENT_ID     :', id ? `présent (${id.length} car.)` : 'MANQUANT');
  console.log('  CLIENT_SECRET :', secret ? `présent (${secret.length} car.)` : 'MANQUANT');
  console.log('  SCOPE         :', scope);
  console.log('  isConfigured  :', pe.isConfigured());

  console.log('\n--- 1) Authentification (obtention du token) ---');
  try {
    const token = await pe.getAccessToken();
    console.log('  ✅ Token obtenu (' + String(token).slice(0, 6) + '…)');
  } catch (e) {
    console.log('  ❌ ÉCHEC AUTH :', e.message);
    console.log('\n  => Cause probable : l\'application francetravail.io n\'a pas souscrit à');
    console.log('     l\'API "Offres d\'emploi v2" ou les scopes api_offresdemploiv2 / o2dsoffre');
    console.log('     ne sont pas cochés. Rien à corriger dans le code.');
    process.exit(1);
  }

  console.log('\n--- 2) Recherche test ("développeur", 0-149) ---');
  try {
    const { offers } = await pe.searchOffers({ motsCles: 'développeur', range: '0-149' });
    console.log('  ✅ Offres renvoyées par France Travail :', (offers || []).length);
    if ((offers || []).length) {
      console.log('  Exemple :', offers[0].intitule || offers[0].intituleOffre || '(sans titre)');
      console.log('\n  => L\'API marche. Si la veille ne les garde pas, c\'est le PRÉ-FILTRE');
      console.log('     (mots_requis/mots_exclus, scoring mission) qui est trop strict.');
    } else {
      console.log('\n  => Auth OK mais 0 offre : mots-clés trop précis, ou périmètre restreint.');
    }
  } catch (e) {
    console.log('  ❌ ÉCHEC RECHERCHE :', e.message);
  }
})();
