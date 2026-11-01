// Mail de bienvenue : contenu (abonnement et contrat de maintenance), envoi automatique une seule fois,
// renvoi manuel depuis la fiche, refus propre sans adresse email, trace de l'envoi.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const emailService = require('../services/emailService');
const conditionsService = require('../services/conditionsService');
const bienvenue = require('../services/bienvenueService');

let envois, majs;
beforeEach(() => {
  envois = []; majs = [];
  emailService.sendEmail = async (m) => { envois.push(m); return { success: true }; };
  conditionsService.renderConditionsPdf = async () => Buffer.from('%PDF-1.4 test');
});

function fausseBase(row) {
  return {
    query: async () => ({ rows: [] }),               // signature : celle par défaut
    pool: {
      query: async (sql, params) => {
        if (/^\s*SELECT/i.test(sql)) return { rows: row ? [{ ...row }] : [] };
        if (/^\s*UPDATE/i.test(sql)) { majs.push({ sql, params }); row.welcome_sent_at = new Date().toISOString(); row.welcome_sent_to = params[0]; return { rows: [] }; }
        throw new Error('requête inattendue : ' + sql);
      }
    }
  };
}

const contrat = () => ({
  id: 7, plan: 'essentiel', site_url: 'https://exemple.fr', monthly_amount: '49.00', billing_day: 5,
  report_frequency: 'mensuel', client_name: 'Boulangerie Martin', client_email: 'contact@exemple.fr',
  welcome_sent_at: null, welcome_sent_to: null
});
const abo = (premier) => ({
  id: 3, label: 'Hébergement et suivi', amount_eur: '120.00', billing_interval: 'year', interval_count: 1,
  first_billing: premier, client_name: 'Atelier Dupont', client_email: 'atelier@exemple.fr',
  welcome_sent_at: null, welcome_sent_to: null
});

test('contenu : contrat de maintenance (formule, site, montant, jour de prélèvement, rapport)', () => {
  const c = bienvenue.contenu('maintenance_contracts', contrat());
  assert.match(c.label, /^Maintenance /);
  assert.equal(c.site, 'https://exemple.fr');
  assert.match(c.montant, /49,00\s€ par mois/);
  assert.equal(c.prelevement, 'chaque mois, le 5');
  assert.ok(c.suite.some((l) => /rapport mensuel/.test(l)));
});

test('contenu : pas de ligne de rapport quand la périodicité est « aucun »', () => {
  const c = bienvenue.contenu('maintenance_contracts', { ...contrat(), report_frequency: 'aucun' });
  assert.ok(!c.suite.some((l) => /rapport/.test(l)));
});

test('contenu : abonnement, premier prélèvement futur ou déjà passé', () => {
  assert.match(bienvenue.contenu('subscriptions', abo('2999-03-01')).prelevement, /^le premier prélèvement aura lieu le 1 mars 2999/);
  assert.equal(bienvenue.contenu('subscriptions', abo('2020-01-01')).prelevement, 'automatique, à chaque échéance');
  assert.match(bienvenue.contenu('subscriptions', abo(null)).montant, /120,00\s€ par an/);
});

test('envoi automatique : une seule fois, avec les conditions en pièce jointe, et trace en base', async () => {
  const row = contrat();
  const db = fausseBase(row);
  const r1 = await bienvenue.envoyer(db, 'maintenance_contracts', 7, { auto: true });
  assert.equal(r1.sentTo, 'contact@exemple.fr');
  assert.equal(envois.length, 1);
  assert.equal(envois[0].to, 'contact@exemple.fr');
  assert.match(envois[0].subject, /^Bienvenue/);
  assert.match(envois[0].html, /Boulangerie Martin/);
  assert.equal(envois[0].attachments.length, 1);
  assert.match(envois[0].attachments[0].filename, /^Conditions_Maintenance_.*\.pdf$/);
  assert.equal(majs.length, 1);
  assert.match(majs[0].sql, /UPDATE maintenance_contracts SET welcome_sent_at = NOW\(\), welcome_sent_to = \$1/);

  // la confirmation Stripe peut arriver deux fois : pas de second mail
  const r2 = await bienvenue.envoyer(db, 'maintenance_contracts', 7, { auto: true });
  assert.deepEqual(r2, { skipped: 'deja_envoye' });
  assert.equal(envois.length, 1);

  // depuis la fiche, le renvoi est toujours possible
  await bienvenue.envoyer(db, 'maintenance_contracts', 7);
  assert.equal(envois.length, 2);
});

test('sans adresse email : rien en automatique, erreur 400 lisible depuis la fiche', async () => {
  const db = fausseBase({ ...abo('2999-01-01'), client_email: null });
  assert.deepEqual(await bienvenue.envoyer(db, 'subscriptions', 3, { auto: true }), { skipped: 'sans_email' });
  await assert.rejects(bienvenue.envoyer(db, 'subscriptions', 3), (e) => e.status === 400 && /adresse email/.test(e.message));
  assert.equal(envois.length, 0);
  assert.equal(majs.length, 0);
});

test('aperçu : destinataire, objet, corps et dernier envoi, sans rien envoyer', async () => {
  const db = fausseBase({ ...abo('2999-01-01'), welcome_sent_at: '2026-10-30T10:00:00Z', welcome_sent_to: 'atelier@exemple.fr' });
  const a = await bienvenue.apercu(db, 'subscriptions', 3);
  assert.equal(a.recipient, 'atelier@exemple.fr');
  assert.equal(a.hasEmail, true);
  assert.match(a.subject, /Hébergement et suivi/);
  assert.match(a.html, /Atelier Dupont/);
  assert.deepEqual(a.documents, ['les conditions de votre abonnement']);
  assert.equal(a.sentTo, 'atelier@exemple.fr');
  assert.equal(envois.length, 0);
});

test('fiche introuvable ou type inconnu : 404 et 400', async () => {
  await assert.rejects(bienvenue.envoyer(fausseBase(null), 'subscriptions', 99), (e) => e.status === 404);
  await assert.rejects(bienvenue.envoyer(fausseBase(null), 'clients', 1), (e) => e.status === 400);
});
