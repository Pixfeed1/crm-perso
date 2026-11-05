// Lot 2.1 — identité de l'exploitant : SIREN lu sur le site transmis à la recherche, identité « certaine »
// seule utilisée pour nommer quelqu'un, correction manuelle jamais écrasée, « aucune identité ».
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { hasDb, withSchema } = require('./helpers/db');
const sireneEnrich = require('../services/sireneEnrich');
const identite = require('../services/identiteService');
const { buildProofEmail } = require('../services/proofEmailService');

const opts = { skip: !hasDb() && 'TEST_DATABASE_URL absent' };

test('clé de Luhn des SIREN', () => {
  assert.equal(sireneEnrich.sirenValide('538644550'), true);
  assert.equal(sireneEnrich.sirenValide('538 644 550'), true);
  assert.equal(sireneEnrich.sirenValide('538644551'), false);
  assert.equal(sireneEnrich.sirenValide('12345'), false);
});

test('WEB-TENNIS : une correspondance « sûre » par le nom ne nomme personne ; une identité certaine, si', () => {
  const base = { domain: 'web-tennis.fr', title: 'Web-tennis.fr', platform: 'PrestaShop', http_status: 200, https_final: true, analyse_le: '2026-11-05T10:00:00Z', mobile_ok: false, raison_sociale: 'TENNIS WEB', gerant: 'Philippe Beal', gerant_nom: 'BEAL', gerant_prenom: 'PHILIPPE' };
  const sur = buildProofEmail({ ...base, sirene_match: 'sur' }, {});
  assert.match(sur.body, /^Bonjour,\n/);
  assert.doesNotMatch(sur.body, /Beal|Philippe|Tennis Web/i);
  const certain = buildProofEmail({ ...base, sirene_match: 'certain', raison_sociale: 'JACQUES RUGGIERO', gerant: 'Jacques Ruggiero', gerant_nom: 'RUGGIERO', gerant_prenom: 'JACQUES', identite_source: 'SIREN lu sur le site' }, {});
  assert.match(certain.body, /^Bonjour Jacques Ruggiero,\n/);
});

async function table(pool) {
  await pool.query(`CREATE TABLE crawl_results (id SERIAL PRIMARY KEY, domain TEXT, title TEXT, code_postal_site TEXT, siren_site TEXT,
    identite_manuelle BOOLEAN DEFAULT FALSE, identite_source TEXT, sirene_match TEXT, raison_sociale TEXT, gerant TEXT, gerant_nom TEXT, gerant_prenom TEXT,
    siren TEXT, naf TEXT, naf_label TEXT, effectif TEXT, adresse TEXT, code_postal TEXT, ville TEXT)`);
}

test('identifier : SIREN du site transmis, identité écrite avec sa source ; manuelle jamais écrasée', opts, async () => {
  await withSchema('identite1', async ({ pool }) => {
    await table(pool);
    const db = { pool };
    const id = (await pool.query("INSERT INTO crawl_results (domain, title, siren_site) VALUES ('web-tennis.fr', 'Web-tennis.fr', '538644550') RETURNING id")).rows[0].id;
    let recu = null;
    const faux = async (p) => { recu = p; return { found: true, match: 'certain', match_score: 100, source: 'SIREN lu sur le site', raison_sociale: 'JACQUES RUGGIERO', dirigeant: 'Jacques Ruggiero', dirigeant_nom: 'RUGGIERO', dirigeant_prenom: 'JACQUES', siren: '538644550', ville: 'Marseille' }; };
    const out = await identite.identifier(db, id, { sirene: faux });
    assert.equal(recu.siren_site, '538644550');
    assert.equal(out.match, 'certain');
    let r = (await pool.query('SELECT * FROM crawl_results WHERE id = $1', [id])).rows[0];
    assert.equal(r.sirene_match, 'certain'); assert.equal(r.gerant, 'Jacques Ruggiero'); assert.equal(r.identite_source, 'SIREN lu sur le site');
    // correction à la main : « aucune identité » ; une réanalyse ne la touche plus
    await identite.corriger(db, id, { aucune: true });
    r = (await pool.query('SELECT * FROM crawl_results WHERE id = $1', [id])).rows[0];
    assert.equal(r.sirene_match, 'aucune'); assert.equal(r.gerant, null); assert.equal(r.identite_manuelle, true);
    const apres = await identite.identifier(db, id, { sirene: faux });
    assert.equal(apres.manuelle, true);
    assert.equal((await pool.query('SELECT sirene_match FROM crawl_results WHERE id = $1', [id])).rows[0].sirene_match, 'aucune');
    // correction par SIREN : recherche par numéro, identité certaine et manuelle
    const orig = sireneEnrich.parSiren;
    sireneEnrich.parSiren = async (s) => (s === '538644550' ? { found: true, match: 'certain', match_score: 100, siren: s, raison_sociale: 'JACQUES RUGGIERO', dirigeant: 'Jacques Ruggiero', dirigeant_nom: 'RUGGIERO', dirigeant_prenom: 'JACQUES' } : { found: false, error: 'SIREN invalide' });
    try {
      const c = await identite.corriger(db, id, { siren: '538644550' });
      assert.equal(c.match, 'certain');
      r = (await pool.query('SELECT * FROM crawl_results WHERE id = $1', [id])).rows[0];
      assert.equal(r.sirene_match, 'certain'); assert.equal(r.identite_manuelle, true); assert.match(r.identite_source, /saisi à la main/);
      await assert.rejects(identite.corriger(db, id, { siren: '123' }), /SIREN invalide/);
    } finally { sireneEnrich.parSiren = orig; }
  });
});
