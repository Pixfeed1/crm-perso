// Signaux d'intention (nouveaux .fr AFNIC) : lecture du fichier, filtre sur le nom, statut du
// site, score d'intention (fondé sur l'entreprise, pas sur l'âge du domaine), échéances, email
// « création de site ». Sans réseau ni base.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../utils/domainSignals');
const { buildCreationEmail } = require('../services/creationEmailService');
const { csvToObjects } = require('../utils/csvParse');

const J = (n) => new Date(Date.now() - n * 86400000);

test('fichier AFNIC : en-têtes # ignorés, .fr seulement, doublons et www retirés', () => {
  const txt = '#BOF\n#Date 2026-09-25\nDupont-Plomberie.fr\nwww.dupont-plomberie.fr\nexemple.re\nautre.fr;OVH;2026-09-25\n\n#EOF\n';
  assert.deepEqual(S.parseAfnicList(txt), ['dupont-plomberie.fr', 'autre.fr']);
});

test('filtre sur le nom : chiffres, sigles, aléatoire, marques rejetés ; noms lisibles gardés', () => {
  assert.equal(S.filterDomain('dupont-plomberie.fr').ok, true);
  assert.equal(S.filterDomain('lesjardinsdemarie.fr').ok, true);
  assert.match(S.filterDomain('123456.fr').raison, /chiffres/);
  assert.match(S.filterDomain('xk7q9z.fr').raison, /voyelle/);
  assert.match(S.filterDomain('bnp-paribas-client.fr').raison, /marque/);
  assert.match(S.filterDomain('mon-compte-orange.fr').raison, /marque/);
  assert.match(S.filterDomain('xn--caf-dma.fr').raison, /IDN/);
  assert.equal(S.filterDomain('exemple.com').ok, false);
});

test('mot de métier : radicaux au début d\'un mot, mots courts au mot entier', () => {
  assert.equal(S.metierHint('dupont-plomberie'), 'plomb');
  assert.equal(S.metierHint('coiffure-lea'), 'coiff');
  assert.equal(S.metierHint('anatim-elec'), 'elec');
  assert.equal(S.metierHint('toiture-protech'), 'toiture');
  assert.equal(S.metierHint('zorglub'), null);
  // Faux positifs vus sur un vrai fichier AFNIC.
  for (const r of ['bernaudeau', 'ariane-barot', 'lamotte-brebiere', 'pegase-aeromodels', 'plan-de-prevention', 'modernlov', 'autolosange']) assert.equal(S.metierHint(r), null, r);
});

test('hors cible : association, syndic de copro, junior-entreprise, commune', () => {
  assert.match(S.horsCible({ company_name: "ASSOCIATION DE N'DALAO POUR LE DEVELOPPEMENT" }), /association/);
  assert.match(S.horsCible({ nature_juridique: '9220', company_name: 'X' }), /association/);
  assert.match(S.horsCible({ company_name: 'SYND COPRO BEAUSEJOUR' }), /copropriété/);
  assert.match(S.horsCible({ company_name: '"JUNIOR ESIEA" "NEXIEA"' }), /association/);
  assert.match(S.horsCible({ company_name: 'COMMUNE DE LAMOTTE BREBIERE' }), /collectivité/);
  assert.equal(S.horsCible({ company_name: 'GBEA' }), null);
  const q = S.qualify({ registered_at: J(1), website_status: 'parking', match_confidence: 'sur', company_name: 'ASSOCIATION X', company_created_at: J(10) });
  assert.equal(q.statut, 'rejete');
});

test('statut du site : sans DNS, parking, vide, redirection, protégé, erreur, actif', () => {
  assert.equal(S.websiteStatus({ http_status: '', error: '[Errno -2] Name or service not known' }), 'sans_dns');
  assert.equal(S.websiteStatus({ http_status: '', error: 'timeout' }), 'injoignable');
  assert.equal(S.websiteStatus({ http_status: '200', parked: 'oui', title: 'Site en construction' }), 'parking');
  assert.equal(S.websiteStatus({ http_status: '200', title: '', platform: 'Inconnu', poids_ko: '1' }), 'vide');
  assert.equal(S.websiteStatus({ http_status: '200', title: 'WordPress', platform: 'WordPress' }), 'vide');
  assert.equal(S.websiteStatus({ http_status: '200', final_url: 'https://autre-societe.com/', title: 'X' }, 'a.fr'), 'redirection');
  assert.equal(S.websiteStatus({ http_status: '200', final_url: 'https://www.a.fr/fr/', title: 'X' }, 'a.fr'), 'actif');
  assert.equal(S.websiteStatus({ http_status: '403', protected: 'oui' }), 'protege');
  assert.equal(S.websiteStatus({ http_status: '500', title: 'Erreur' }), 'erreur');
  assert.equal(S.websiteStatus({ http_status: '200', title: 'Dupont Plomberie - Bourg', platform: 'WordPress' }), 'actif');
});

test('score : entreprise récente identifiée du métier, dans la zone, sans site -> très haut ; inconnue -> bas', () => {
  const chaud = S.intentScore({ match_confidence: 'sur', company_name: 'DUPONT PLOMBERIE', company_created_at: J(12), metier: 'plomb', department: '01', website_status: 'parking' });
  assert.ok(chaud.score >= 80, String(chaud.score));
  assert.ok(chaud.signaux.some((x) => /12 jours/.test(x)));
  const froid = S.intentScore({ match_confidence: 'aucun', website_status: 'parking' });
  assert.ok(froid.score < 20, String(froid.score));
  // Vieille entreprise identifiée, domaine parké dans la zone : pas une création, sous le seuil.
  const vieille = S.intentScore({ match_confidence: 'sur', company_name: 'GBEA', company_created_at: J(5270), department: '38', website_status: 'parking' });
  assert.ok(vieille.score < 50, String(vieille.score));
  // Site en ligne d'une entreprise établie : l'intérêt vient des défauts visibles (preuve).
  const sansDefaut = S.intentScore({ match_confidence: 'sur', company_name: 'X', company_created_at: J(3000), department: '69', website_status: 'actif', audit: {} });
  const avecPreuve = S.intentScore({ match_confidence: 'sur', company_name: 'X', company_created_at: J(3000), department: '69', website_status: 'actif', audit: { mentions_legales: false, https_final: false } });
  assert.ok(sansDefaut.score < 50 && avecPreuve.score >= 50, `${sansDefaut.score} / ${avecPreuve.score}`);
  assert.ok(avecPreuve.signaux.some((x) => /Défauts visibles/.test(x)));
});

test('qualification : seuil 50, alias rejeté, sans indice on surveille puis on classe après 90 j', () => {
  const now = new Date();
  assert.equal(S.qualify({ registered_at: J(1), website_status: 'redirection', match_confidence: 'sur' }, now).statut, 'rejete');
  const q = S.qualify({ registered_at: J(1), website_status: 'parking', match_confidence: 'aucun' }, now);
  assert.equal(q.statut, 'a_surveiller');
  assert.ok(q.next_check_at && q.next_check_at > now);
  // Sans indice : deux contrôles seulement (J+30, J+90), pas cinq.
  assert.equal(Math.round((q.next_check_at - now) / 86400000), 29);
  const fin = S.qualify({ registered_at: J(91), website_status: 'parking', match_confidence: 'aucun' }, now);
  assert.equal(fin.statut, 'rejete');
  // Site en ligne, entreprise établie, rien à montrer : classé, pas laissé en surveillance.
  const etabli = S.qualify({ registered_at: J(1), website_status: 'actif', match_confidence: 'sur', company_name: 'ECRAM', company_created_at: J(10131), department: '38', audit: {} }, now);
  assert.equal(etabli.statut, 'rejete');
  const ok = S.qualify({ registered_at: J(1), website_status: 'parking', match_confidence: 'sur', company_name: 'X', company_created_at: J(10), department: '01' }, now);
  assert.equal(ok.statut, 'qualifie');
  assert.ok(ok.next_check_at, 'un qualifié sans site reste surveillé (le site va apparaître)');
  assert.equal(S.qualify({ registered_at: J(1), website_status: 'actif', match_confidence: 'sur', company_name: 'X', company_created_at: J(10), department: '01' }, now).next_check_at, null);
  assert.equal(S.qualify({ registered_at: J(1), website_status: 'parking', match_confidence: 'sur', effectif: '250-499' }, now).raison_rejet.includes('grande'), true);
});

test('échéances J+7/15/30/60/90 depuis la création du domaine', () => {
  const now = new Date('2026-09-26T10:00:00Z');
  assert.equal(S.nextCheckDate('2026-09-25', now).toISOString().slice(0, 10), '2026-10-02');
  assert.equal(S.nextCheckDate('2026-09-10', now).toISOString().slice(0, 10), '2026-10-10');
  assert.equal(S.nextCheckDate('2026-06-01', now), null);
});

test('email création : présentation, constat vrai, question, sortie ; nom remis en casse', () => {
  const e = buildCreationEmail({ domain: 'dupont-plomberie.fr', match_confidence: 'sur', company_name: 'DUPONT PLOMBERIE SARL', dirigeant: 'Jean Dupont', city: 'Bourg-en-Bresse', website_status: 'parking', company_created_at: J(12) }, { company: 'dupont-plomberie.fr' });
  assert.equal(e.subject, 'Le site de Dupont Plomberie');
  assert.match(e.body, /^Bonjour Jean Dupont,/);
  assert.match(e.body, /Dupont Plomberie vient de se lancer/);
  assert.match(e.body, /page d'attente de l'hébergeur/);
  assert.match(e.body, /Bonne journée à vous,$/);
  assert.doesNotMatch(e.body, /SARL/);
  const anonyme = buildCreationEmail({ domain: 'x-y.fr', website_status: 'sans_dns' }, { company: 'x-y.fr', name: 'x-y.fr' });
  assert.match(anonyme.body, /^Bonjour,/);
  assert.match(anonyme.body, /x-y\.fr vient d'être réservé/);
});

test('csvToObjects : en-tête en minuscules, guillemets et virgules internes', () => {
  const rows = csvToObjects('Domain,Title\na.fr,"Dupont, plomberie ""Bourg"""\n');
  assert.deepEqual(rows, [{ domain: 'a.fr', title: 'Dupont, plomberie "Bourg"' }]);
});
