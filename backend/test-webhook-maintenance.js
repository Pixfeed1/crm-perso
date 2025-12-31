// backend/test-webhook-maintenance.js
// Script de test pour le webhook maintenance WordPress

const axios = require('axios');

const API_URL = 'http://localhost:5000/api/webhooks/maintenance';

// Données de test simulant un paiement Stripe via WordPress
const testData = {
  name: 'Jean Dupont',
  email: 'jean.dupont@test.com',
  phone: '0612345678',
  company: 'Agence XYZ',
  source: 'stripe_maintenance_wordpress',
  notes: 'Forfait Pro - 99€/mois - Souscription du 29/12/2024',
  tags: 'maintenance,wordpress,forfait-pro',
  status: 'active',
  lifetime_value: 99,
  contract_start_date: new Date().toISOString(),
  type: 'company',
  plan: 'Pro',
  plan_price: 99
};

console.log('🧪 TEST DU WEBHOOK MAINTENANCE');
console.log('=====================================\n');
console.log('URL:', API_URL);
console.log('\nDonnées envoyées:');
console.log(JSON.stringify(testData, null, 2));
console.log('\n=====================================\n');

async function testWebhook() {
  try {
    console.log('📤 Envoi de la requête...\n');

    const response = await axios.post(API_URL, testData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ SUCCÈS !');
    console.log('Status:', response.status);
    console.log('\nRéponse:');
    console.log(JSON.stringify(response.data, null, 2));

    if (response.data.success) {
      console.log('\n✅ Client créé avec ID:', response.data.client_id);
      console.log('✅ Projet créé avec ID:', response.data.project_id);
    }

  } catch (error) {
    console.error('\n❌ ERREUR !');

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Réponse:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('Aucune réponse reçue du serveur');
      console.error('Le serveur est-il démarré ? (node server.js)');
    } else {
      console.error('Erreur:', error.message);
    }

    process.exit(1);
  }
}

// Vérifier si le serveur est accessible
console.log('🔍 Vérification que le serveur est accessible...\n');

axios.get('http://localhost:5000/api/debug')
  .then(() => {
    console.log('✅ Serveur accessible\n');
    return testWebhook();
  })
  .catch(() => {
    console.error('❌ Le serveur n\'est pas accessible sur http://localhost:5000');
    console.error('💡 Démarrez le serveur avec: cd backend && node server.js');
    process.exit(1);
  });
