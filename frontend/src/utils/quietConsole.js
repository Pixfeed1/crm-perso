// Coupe les journaux de debogage en production.
//
// Le front contient ~290 console.log qui affichent les donnees echangees avec
// l'API (corps des requetes, reponses). En developpement c'est utile ; en
// production, n'importe qui ouvrant la console du navigateur lit tout ce qui
// transite. Plutot que de retoucher 19 fichiers et d'oublier le prochain
// console.log ajoute, on neutralise ces methodes une fois pour toutes ici.
//
// console.warn et console.error sont CONSERVES : ils signalent des anomalies
// reelles et servent au diagnostic sur le poste d'un utilisateur.
//
// A importer EN PREMIER dans index.js : les imports s'executent dans l'ordre,
// et certains modules loguent des leur chargement.
if (process.env.NODE_ENV === 'production') {
  const rien = () => {};
  // eslint-disable-next-line no-console
  console.log = rien;
  // eslint-disable-next-line no-console
  console.debug = rien;
  // eslint-disable-next-line no-console
  console.info = rien;
}
