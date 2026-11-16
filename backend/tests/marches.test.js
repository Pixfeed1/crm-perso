// Veille des marchés publics (BOAMP) : classement des annonces au format de l'API open data (DILA, Opendatasoft
// v2.1), relevé sans doublon, mail des nouveaux marchés pertinents, suivi, réglages, connecteur.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const M = require('../services/marchesService');

const futur = new Date(Date.now() + 20 * 86400000).toISOString();
const avis = (idweb, objet, extra = {}) => ({
  idweb, objet, nomacheteur: 'Commune de Test', code_departement: ['95'], dateparution: new Date().toISOString().slice(0, 10), datelimitereponse: futur,
  nature_categorise_libelle: 'Avis de marché', procedure_libelle: 'Procédure adaptée', famille_libelle: 'Marchés entre 90 k€ et seuils européens', type_marche: ['SERVICES'], descripteur_libelle: [], donnees: null, url_avis: `https://www.boamp.fr/pages/avis/?q=idweb:${idweb}`, ...extra,
});
const ANNONCES = [
  avis('26-1', 'Refonte du site internet de la commune', { descripteur_libelle: ['Informatique (prestations de services)', 'Site internet'], donnees: JSON.stringify({ EFORMS: { ContractNotice: { 'cbc:ItemClassificationCode': '72413000', 'cbc:EstimatedOverallContractAmount': '40000' } } }) }),
  avis('26-2', 'Maintenance des ascenseurs des bâtiments communaux', { descripteur_libelle: ['Ascenseur'] }),
  avis('26-3', 'Tierce maintenance applicative et hébergement du portail famille', { code_departement: ['78'], descripteur_libelle: ['Informatique (prestations de services)'] }),
  avis('26-4', 'Travaux de voirie et réseaux divers', { type_marche: ['TRAVAUX'] }),
  avis('26-5', 'Création du site internet de l\'office de tourisme', { nature_categorise_libelle: 'Avis d\'attribution' }),
  avis('26-6', 'Refonte du site web du syndicat', { datelimitereponse: new Date(Date.now() - 86400000).toISOString() }),
  avis('26-7', 'Refonte et maintenance du portail web régional', { donnees: JSON.stringify({ lot: { valeur_estimee: 900000 } }) }),
  avis('26-8', 'Accompagnement en référencement naturel et marketing digital', { code_departement: ['13'] }),
  avis('26-9', 'Fourniture de matériel informatique pour les écoles', { type_marche: ['FOURNITURES'], donnees: JSON.stringify({ texte: 'Les offres sont déposées sur le site internet de la plateforme.' }) }),
  avis('26-10', 'Boutique en ligne et billetterie du musée', { descripteur_libelle: ['Commerce électronique'] }),
  avis('26-11', 'Audit d\'accessibilité numérique (RGAA) des sites de la ville', {}),
  // Texte complet typique d'un avis : adresses, « site internet » de l'acheteur, plateforme en ligne, maintenance.
  avis('26-14', 'Maintenance des installations de chauffage et de ventilation', { type_marche: ['SERVICES'], donnees: JSON.stringify({ acheteur: { adresse_internet: 'https://www.ville.fr', url_profil: 'https://marches.ville.fr' }, texte: "Les documents sont disponibles sur le site internet de l'acheteur et sur la plateforme en ligne. Maintenance préventive et corrective, application des normes, mises à jour des registres, support technique." }) }),
  avis('26-15', 'Prestations de nettoyage des locaux', { type_marche: ['SERVICES'], donnees: JSON.stringify({ t: 'Refonte du site internet de la ville en cours ; dépôt des offres en ligne.' }) }),
];

test('classement : thèmes, maintenance seulement avec le web, exclusions, attribution et date passée écartées, montant', () => {
  const r = { montant_max: 200000, departements: ['95'], exclusions: [] };
  const a = Object.fromEntries(ANNONCES.map((x) => [x.idweb, M.analyser(x, r)]));
  assert.deepEqual([a['26-1'].cible, a['26-1'].themes.includes('site'), a['26-1'].cpv, a['26-1'].montant], ['pertinent', true, ['72413000'], 40000]);
  assert.ok(a['26-1'].raisons.includes('département suivi'));
  assert.equal(a['26-2'].cible, 'non_pertinent', 'maintenance d\'ascenseurs : pas du web');
  assert.ok(!a['26-2'].themes.includes('maintenance'));
  assert.equal(a['26-3'].cible, 'pertinent');
  assert.ok(a['26-3'].themes.includes('maintenance') && a['26-3'].themes.includes('site'));
  assert.equal(a['26-4'].cible, 'non_pertinent');
  assert.equal(a['26-5'], null, 'avis d\'attribution');
  assert.equal(a['26-6'], null, 'date limite passée');
  assert.deepEqual([a['26-7'].cible, a['26-7'].montant], ['hors_cible', 900000]);
  assert.deepEqual([a['26-8'].cible, a['26-8'].themes], ['pertinent', ['referencement']]);
  assert.equal(a['26-9'].cible, 'non_pertinent', 'matériel informatique, « site internet » seulement pour le dépôt');
  assert.ok(a['26-10'].themes.includes('ecommerce') && a['26-10'].cible === 'pertinent');
  assert.ok(a['26-11'].themes.includes('accessibilite') && a['26-11'].cible === 'pertinent');
  assert.equal(a['26-14'].cible, 'non_pertinent', 'chauffage : le « site internet » et la « maintenance » du texte complet ne suffisent pas');
  assert.ok(!a['26-14'].themes.includes('maintenance'));
  assert.equal(a['26-15'].cible, 'non_pertinent', 'jamais retenu sur le seul texte de l\'avis');
  // Champs en camelCase (autre version de l'API) : lus pareil.
  const camel = M.analyser({ idWeb: '26-12', objet: 'Création d\'un site internet', dateLimiteReponse: futur, typeMarche: ['SERVICES'], nomAcheteur: 'CCAS' }, r);
  assert.deepEqual([camel.idweb, camel.acheteur, camel.cible], ['26-12', 'CCAS', 'pertinent']);
  // Mot écarté par Marc.
  assert.equal(M.analyser(ANNONCES[9], { ...r, exclusions: ['billetterie'] }).cible, 'pertinent', 'thème web dans l\'objet : gardé');
  assert.equal(M.analyser(avis('26-13', 'Billetterie des piscines', { donnees: JSON.stringify({ t: 'vente en ligne des entrées' }) }), { ...r, exclusions: ['billetterie'] }).cible, 'non_pertinent');
});

test('relevé, mail, suivi, réglages, connecteur', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('marches', async ({ pool }) => {
    const db = { pool };
    const appels = [];
    // Un jour à 150 annonces (deux pages), les autres vides : lecture jour par jour.
    const jourPlein = new Date().toISOString().slice(0, 10);
    const bourrage = Array.from({ length: 139 }, (_, i) => avis(`26-b${i}`, 'Fourniture de denrées alimentaires', { type_marche: ['FOURNITURES'] }));
    const page = async (jour, offset) => { appels.push([jour, offset]); const l = jour === jourPlein ? [...ANNONCES, ...bourrage] : []; return { total: l.length, records: l.slice(offset, offset + 100) }; };
    const mails = [];
    const deps = { page, mail: async (l) => { mails.push(l); } };
    await M.regler(db, { departements: '95, 78' });
    // Deux annonces retenues à tort par un ancien tri ; la seconde est déjà suivie.
    await pool.query("INSERT INTO marches_publics (idweb, objet, cible, statut, themes) VALUES ('26-14', 'Maintenance chauffage', 'pertinent', 'nouveau', '{maintenance}'), ('26-15', 'Nettoyage', 'pertinent', 'a_etudier', '{site}')");
    const jours = [];
    let r = await M.relever(db, { surJour: (x) => jours.push(x) }, deps);
    assert.equal(r.statut, 'OK');
    assert.deepEqual([r.lues, r.nouveaux, r.pertinents_nouveaux.sort(), r.declasses], [152, 6, ['26-1', '26-10', '26-11', '26-3', '26-8'], 1]);
    assert.equal((await pool.query("SELECT cible, statut FROM marches_publics WHERE idweb = '26-14'")).rows[0].cible, 'non_pertinent', 'retenu à tort par l\'ancien tri : déclassé');
    assert.equal((await pool.query("SELECT cible FROM marches_publics WHERE idweb = '26-15'")).rows[0].cible, 'pertinent', 'déjà suivi par Marc : jamais déclassé');
    await pool.query("DELETE FROM marches_publics WHERE idweb = '26-15'");   // donnée de test retirée pour la suite
    assert.equal(appels[0][0], new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), 'premier relevé : 7 jours');
    assert.deepEqual([r.jours, jours.length, jours[jours.length - 1]], [8, 8, { jour: jourPlein, lues: 152, nouveaux: 6 }], 'un jour après l\'autre, aujourd\'hui compris');
    assert.deepEqual(appels.filter((a) => a[0] === jourPlein).map((a) => a[1]), [0, 100], 'deux pages pour le jour plein');
    appels.length = 0;
    assert.equal(mails.length, 1);
    assert.equal(mails[0].length, 5);
    // Second relevé : aucun doublon, aucun mail, depuis la veille du dernier relevé.
    r = await M.relever(db, {}, deps);
    assert.deepEqual([r.nouveaux, r.mis_a_jour], [0, 6]);
    assert.equal(mails.length, 1);
    assert.deepEqual(appels.map((a) => a[0]), [new Date(Date.now() - 86400000).toISOString().slice(0, 10), jourPlein, jourPlein], 'depuis la veille du dernier relevé');
    let l = await M.lister(db);
    assert.equal(l.marches.length, 5);
    assert.deepEqual(l.totaux, { ouverts: 5, nouveaux: 5, maintenance: 1, en_reponse: 0, hors_cible: 1 });
    assert.deepEqual((await M.lister(db, { theme: 'maintenance' })).marches.map((m) => m.idweb), ['26-3']);
    assert.deepEqual((await M.lister(db, { cible: 'hors_cible' })).marches.map((m) => m.idweb), ['26-7']);
    assert.deepEqual((await M.lister(db, { departement: '78' })).marches.map((m) => m.idweb), ['26-3']);
    await assert.rejects(M.lister(db, { theme: 'inconnu' }), /thème inconnu/);
    // Suivi.
    const s = await M.suivre(db, '26-3', { statut: 'je_reponds', note: 'Demander le cahier des charges' });
    assert.deepEqual([s.statut, s.note], ['je_reponds', 'Demander le cahier des charges']);
    assert.equal((await M.suivre(db, '26-3', { statut: 'repondu' })).note, 'Demander le cahier des charges', 'la note reste');
    await assert.rejects(M.suivre(db, '26-3', { statut: 'signe' }), /statut/);
    await assert.rejects(M.suivre(db, '99-9', { statut: 'ecarte' }), (x) => x.status === 404);
    l = await M.lister(db);
    assert.deepEqual([l.totaux.en_reponse, l.totaux.nouveaux], [1, 4]);
    // Réglages.
    await assert.rejects(M.regler(db, { montant_max: 'beaucoup' }), /entier/);
    await assert.rejects(M.regler(db, { departements: 'Val-d\'Oise' }), /numéros/);
    const g = await M.regler(db, { montant_max: 1000000, exclusions: 'billetterie, ab' , alerte_mail: false });
    assert.deepEqual([g.montant_max, g.exclusions, g.alerte_mail], [1000000, ['billetterie'], false]);
    r = await M.relever(db, {}, deps);
    assert.equal((await M.lister(db, { cible: 'tous' })).marches.find((m) => m.idweb === '26-7').cible, 'pertinent', 'montant maximal relevé');
    // Échec de l'API : enregistré, relevé suivant reparti du dernier succès.
    await assert.rejects(M.relever(db, {}, { page: async () => { throw new Error('BOAMP a répondu 503'); } }), /503/);
    assert.equal((await M.lister(db)).releve.statut, 'ÉCHEC');
    // Connecteur Claude.ai.
    const C = require('../services/campagneConnecteur');
    const c = await C.marches(db, { theme: 'maintenance', ouverts: false });
    assert.deepEqual(c.marches.map((m) => [m.idweb, m.statut]), [['26-3', 'repondu'], ['26-7', 'nouveau']], 'le grand portail entre dans la cible avec le nouveau montant maximal');
    const d1 = await C.marches(db, { idweb: '26-1' });
    assert.deepEqual([d1.cpv[0], d1.tranche], ['72413000', 'Marchés entre 90 k€ et seuils européens']);
    assert.equal((await C.marcheSuivre(db, { idweb: '26-8', statut: 'a_etudier' })).statut, 'a_etudier');
    await assert.rejects(C.marcheSuivre(db, {}), /idweb requis/);
  });
});
