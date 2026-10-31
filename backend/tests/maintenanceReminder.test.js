// Rappels de rapports de maintenance : seulement pour les contrats réellement prélevés.
// Un contrat dont le prélèvement n'est pas en place (lien de paiement non signé, rien de configuré, résilié)
// ne déclenche aucun rappel.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const worker = require('../services/maintenanceReminderWorker');

test('rappels : uniquement les contrats prélevés (actif, impayé en relance, résiliation programmée)', async () => {
  const requetes = [];
  worker.initialize({ query: async (q) => { requetes.push(q.replace(/\s+/g, ' ')); return { rows: [] }; } });
  await worker.getContractsNeedingReport(1);
  await worker.getOverdueContracts();
  assert.equal(requetes.length, 2);
  for (const q of requetes) assert.match(q, /COALESCE\(mc\.billing_status, 'none'\) IN \('active', 'past_due', 'canceling'\)/);
});
