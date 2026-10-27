// Contrat de maintenance complet : préremplissage depuis la fiche client, texte par formule,
// aucune variable brute, échappement, champs vides en pointillés.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const K = require('../services/contratMaintenance');

const notesLofloral = [
  'Raison sociale : LOFLORAL PROVENCE (nom commercial LOFLORAL)',
  'SARL unipersonnelle au capital de 1 000 €, créée le 02/01/2015',
  'SIREN 808 861 884, SIRET siège 808 861 884 00019, RCS Chambéry',
  'TVA intracommunautaire FR05808861884, APE 4729Z',
  'Représentante : Patricia Dalmas, gérante',
  "Adresse : Rue du Grand Verger, La Côte d'Aime, 73210 La Plagne Tarentaise"
].join('\n');
const contrat = { plan: 'Professionnel', site_name: 'LOFLORAL', site_url: 'https://lofloral.fr', monthly_amount: '300.00', contract_start_date: '2026-10-27', billing_day: 27, hosting_provider: 'Inconnu, à demander' };
const company = { company_name: 'PixFeed', siret: '85239373500018', address: '1 rue des Morillons', postal_code: '95130', city: 'Franconville' };

test('préremplissage depuis les notes de la fiche client', () => {
  const p = K.prefill(contrat, { name: 'LOFLORAL', notes: notesLofloral });
  assert.equal(p.client_raison_sociale, 'LOFLORAL PROVENCE');
  assert.equal(p.client_representant, 'Patricia Dalmas, gérante');
  assert.equal(p.client_adresse, "Rue du Grand Verger, La Côte d'Aime, 73210 La Plagne Tarentaise");
  assert.equal(p.client_forme_siret, 'SARL unipersonnelle au capital de 1 000 €, SIRET 808 861 884 00019');
  assert.equal(p.service_type, 'la boutique en ligne');
  const vide = K.prefill({ plan: 'Essentiel' }, { name: 'Client X', address: '2 rue Y', siret: '12345678900011' });
  assert.equal(vide.client_raison_sociale, 'Client X'); assert.equal(vide.client_forme_siret, 'SIRET 12345678900011'); assert.equal(vide.service_type, 'le site');
});

test('Professionnel : texte complet, valeurs remplies, aucune variable brute', () => {
  const infos = { ...K.prefill(contrat, { notes: notesLofloral }), technologie: 'PrestaShop 1.7', prestataire_forme: 'Entreprise individuelle' };
  const html = K.renderHtml(contrat, infos, company);
  assert.doesNotMatch(html, /\{\{|undefined|null|NaN/);
  assert.match(html, /Formule Professionnel/);
  assert.match(html, /<strong>PixFeed, Entreprise individuelle, SIRET 852 393 735 00018, 1 rue des Morillons, 95130 Franconville<\/strong>/);
  assert.match(html, /hébergé chez <span class="blank">/, 'hébergeur inconnu : ligne à compléter');
  assert.match(html, /<strong>LOFLORAL PROVENCE<\/strong>, SARL unipersonnelle/);
  assert.match(html, /représentée par Patricia Dalmas, gérante/);
  assert.match(html, /la boutique en ligne LOFLORAL, accessible à l’adresse https:\/\/lofloral\.fr, développé avec PrestaShop 1\.7/);
  assert.match(html, /<strong>300,00 € HT par mois<\/strong>/);
  assert.match(html, /le 27 de chaque mois/);
  assert.match(html, /à compter du 27\/10\/2026/);
  assert.match(html, /Sous 4 heures ouvrées/);
  assert.match(html, /article 28 du règlement général/);
  const nums = [...html.matchAll(/Article (\d+)\./g)].map((m) => +m[1]);
  assert.deepEqual(nums, Array.from({ length: nums.length }, (_, i) => i + 1), 'articles numérotés à la suite');
  assert.equal(nums.length, 15);
  assert.equal(K.nomFichier(contrat, infos), 'Contrat_Maintenance_Professionnel_LOFLORAL_PROVENCE.pdf');
});

test('Essentiel et Sur mesure : texte propre à chaque formule, champs manquants en pointillés', () => {
  const ess = K.renderHtml({ ...contrat, plan: 'Essentiel', monthly_amount: 150 }, {}, company);
  assert.match(ess, /Formule Essentiel/); assert.match(ess, /Sous 1 jour ouvré/); assert.match(ess, /1 par année contractuelle/);
  assert.doesNotMatch(ess, /Sous 4 heures|Infogérance/);
  assert.match(ess, /class="blank"/, 'raison sociale absente : ligne à compléter');
  const sm = K.renderHtml({ ...contrat, plan: 'Sur mesure', monthly_amount: 900 }, { perimetre: 'lofloral.fr et son serveur', heures_incluses: '4 heures', taux_horaire_ht: '60 €' }, company);
  assert.match(sm, /Formule Sur mesure/); assert.match(sm, /Infogérance serveur complète/); assert.match(sm, /Réversibilité/);
  assert.match(sm, /Annexe 1\. Devis accepté/); assert.match(sm, /4 heures par mois/);
  assert.equal([...sm.matchAll(/Article (\d+)\./g)].length, 16);
  assert.doesNotMatch(sm, /\{\{/);
});

test('échappement : une valeur saisie ne peut pas injecter de HTML', () => {
  const html = K.renderHtml(contrat, { client_raison_sociale: '<script>alert(1)</script> & Cie' }, company);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; Cie/);
});

const { hasDb, withSchema, fakeReq, fakeRes } = require('./helpers/db');
const { DATABASE_SCHEMA } = require('../scripts/autoInitDatabase');

test('routes : préremplissage depuis la fiche, enregistrement sur le contrat, réglages du prestataire partagés', { skip: !hasDb() && 'TEST_DATABASE_URL absent' }, async () => {
  await withSchema('contrat', async ({ pool }) => {
    const db = { pool };
    const mk = async (name) => {
      const cols = Object.entries(DATABASE_SCHEMA[name].columns).map(([c, d]) => `${c} ${String(d).replace(/REFERENCES \w+\(id\)( ON DELETE \w+( \w+)?)?/, '')}`).join(', ');
      await pool.query(`CREATE TABLE ${name} (${cols})`);
    };
    for (const t of ['crm_clients', 'maintenance_contracts', 'company_settings', 'settings']) await mk(t);
    await pool.query("INSERT INTO company_settings (company_name, siret, address, postal_code, city) VALUES ('PixFeed', '85239373500018', '1 rue des Morillons', '95130', 'Franconville')");
    const cl = (await pool.query('INSERT INTO crm_clients (name, email, notes) VALUES ($1, $2, $3) RETURNING id', ['LOFLORAL', 'lofloral73@gmail.com', notesLofloral])).rows[0].id;
    const mc = (await pool.query("INSERT INTO maintenance_contracts (client_id, site_name, site_url, plan, monthly_amount, contract_start_date, billing_day) VALUES ($1, 'LOFLORAL', 'https://lofloral.fr', 'Professionnel', 300, '2026-10-27', 27) RETURNING id", [cl])).rows[0].id;
    const ctrl = require('../controllers/maintenanceContractController');

    let res = fakeRes();
    await ctrl.getContrat(fakeReq(db, { params: { id: mc } }), res);
    assert.equal(res.code, 200);
    assert.equal(res.body.infos.client_raison_sociale, 'LOFLORAL PROVENCE');
    assert.equal(res.body.formule.type, 'maintenance-pro');
    assert.equal(res.body.enregistre, false);

    res = fakeRes();
    await ctrl.saveContrat(fakeReq(db, { params: { id: mc }, body: { technologie: 'PrestaShop 1.7', client_representant: 'Patricia Dalmas, gérante', prestataire_forme: 'Entreprise individuelle', mention_tva: 'TVA non applicable, article 293 B du CGI', champ_inconnu: 'ignoré' } }), res);
    assert.equal(res.code, 200);
    assert.equal(res.body.infos.technologie, 'PrestaShop 1.7');
    const saved = (await pool.query('SELECT contrat_infos FROM maintenance_contracts WHERE id = $1', [mc])).rows[0].contrat_infos;
    assert.equal(saved.technologie, 'PrestaShop 1.7'); assert.equal(saved.champ_inconnu, undefined); assert.equal(saved.prestataire_forme, undefined, 'le prestataire va dans les réglages');
    const presta = (await pool.query("SELECT value FROM settings WHERE key = 'contrat_prestataire'")).rows[0].value;
    assert.equal(presta.prestataire_forme, 'Entreprise individuelle');

    // Un second contrat reprend les réglages du prestataire.
    const mc2 = (await pool.query("INSERT INTO maintenance_contracts (client_id, site_name, plan) VALUES ($1, 'Autre', 'Sur mesure') RETURNING id", [cl])).rows[0].id;
    res = fakeRes();
    await ctrl.getContrat(fakeReq(db, { params: { id: mc2 } }), res);
    assert.equal(res.body.infos.mention_tva, 'TVA non applicable, article 293 B du CGI');
    assert.equal(res.body.formule.type, 'maintenance-sur-mesure');

    res = fakeRes();
    await ctrl.getContrat(fakeReq(db, { params: { id: 99999 } }), res);
    assert.equal(res.code, 404);
  });
});
