// scripts/createUser.js
require('dotenv').config();
const userModel = require('../models/userModel');
const bcrypt = require('bcrypt');

async function createTestUser() {
  const username = process.env.NEW_USER_EMAIL;
  const password = process.env.NEW_USER_PASSWORD;

  if (!username || !password) {
    console.error('Erreur: Définissez NEW_USER_EMAIL et NEW_USER_PASSWORD dans .env');
    process.exit(1);
  }

  try {
    // Vérifie d'abord si l'utilisateur existe déjà
    const existingUser = await userModel.getUserByUsername(username);
    if (existingUser) {
      console.log(`L'utilisateur ${username} existe déjà`);
      return;
    }

    // Hache le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crée l'utilisateur
    const newUser = await userModel.createUser({
      username: username,
      password: hashedPassword,
      role: 'user'
    });

    console.log('Utilisateur créé avec succès:', newUser);
  } catch (error) {
    console.error('Erreur lors de la création de l\'utilisateur:', error);
  }
}

createTestUser();