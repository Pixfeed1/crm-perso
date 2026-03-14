// test-goals-api.js
require('dotenv').config();
const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_TEST_URL || `http://localhost:${process.env.PORT || 5000}`;
const API_URL = `${BASE_URL}/api/goals`;
const TOKEN = process.env.TEST_JWT_TOKEN || 'REMPLACEZ_PAR_UN_TOKEN_VALIDE';

// Données de test pour un nouvel objectif
const goalData = {
  // Test avec différentes variantes de noms
  title: 'Objectif de test',
  name: 'Objectif de test',
  nom: 'Objectif de test',
  
  description: 'Description de test',
  target_value: 100,
  current_value: 0,
  category: 'productivity',
  period: 'monthly',
  start_date: '2025-04-01',
  end_date: '2025-04-30'
};

// Headers avec autorisation
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${TOKEN}`
};

// Fonction pour tester la création d'un objectif
async function testCreateGoal() {
  try {
    console.log('Test de création d\'un objectif...');
    console.log('Données envoyées:', goalData);
    
    const response = await axios.post(API_URL, goalData, { headers });
    
    console.log('Statut:', response.status);
    console.log('Réponse:', response.data);
    console.log('Création réussie!');
    
    return response.data;
  } catch (error) {
    console.error('Erreur lors de la création de l\'objectif:');
    if (error.response) {
      // La requête a été faite et le serveur a répondu avec un code d'état
      console.error('Statut de l\'erreur:', error.response.status);
      console.error('Données de l\'erreur:', error.response.data);
      console.error('En-têtes de l\'erreur:', error.response.headers);
    } else if (error.request) {
      // La requête a été faite mais aucune réponse n'a été reçue
      console.error('Aucune réponse reçue. La requête a été envoyée mais le serveur n\'a pas répondu.');
      console.error(error.request);
    } else {
      // Une erreur s'est produite lors de la configuration de la requête
      console.error('Erreur de configuration de la requête:', error.message);
    }
  }
}

// Exécuter le test
testCreateGoal();