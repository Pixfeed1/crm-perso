// Conditions de maintenance : la formule du contrat choisit le bon modèle (Sur mesure n'est plus
// envoyé avec les conditions Essentiel), et le modèle Sur mesure se remplit correctement.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../services/conditionsService');

test('formule -> modèle de conditions', () => {
  assert.deepEqual(C.maintenanceConditions('Sur mesure'), { type: 'maintenance-sur-mesure', label: 'Sur_mesure' });
  assert.equal(C.maintenanceConditions('sur-mesure').type, 'maintenance-sur-mesure');
  assert.equal(C.maintenanceConditions('Professionnel').type, 'maintenance-pro');
  assert.equal(C.maintenanceConditions('Essentiel').type, 'maintenance-essentiel');
  assert.equal(C.maintenanceConditions('').type, 'maintenance-essentiel');
  assert.equal(C.maintenanceConditions(null).type, 'maintenance-essentiel');
});

test('modèle Sur mesure : titre, contenu de l\'offre, variables remplies et échappées', async () => {
  const html = await C.renderConditionsHtml('maintenance-sur-mesure', { client_name: 'Ravive <SAS>', site_url: 'https://ravive.example', price: '450,00 €', date: '27/10/2026' });
  assert.match(html, /Formule Sur mesure/);
  assert.match(html, /Infogérance serveur complète/);
  assert.match(html, /CI\/CD et déploiement automatisé/);
  assert.match(html, /Interlocuteur dédié/);
  assert.match(html, /fixé au devis/);
  assert.match(html, /450,00 € \/ mois/);
  assert.match(html, /Ravive &lt;SAS&gt;/);
  assert.doesNotMatch(html, /\{\{[a-z_]+\}\}/, 'aucune variable laissée vide');
  assert.doesNotMatch(html, /Formule Essentiel|Formule Professionnel/);
});

test('les modèles Essentiel et Professionnel sont inchangés', async () => {
  assert.match(await C.renderConditionsHtml('maintenance-pro', { price: '300,00 €' }), /Formule Professionnel/);
  assert.match(await C.renderConditionsHtml('maintenance-essentiel', { price: '150,00 €' }), /Formule Essentiel/);
});
