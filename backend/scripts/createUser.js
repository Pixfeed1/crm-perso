// scripts/createUser.js
const userModel = require('../models/userModel');
const bcrypt = require('bcrypt');

async function createTestUser() {
  try {
    // Vérifie d'abord si l'utilisateur existe déjà
    const existingUser = await userModel.getUserByUsername('moosyne@gmail.com');
    if (existingUser) {
      console.log('L\'utilisateur moosyne@gmail.com existe déjà');
      return;
    }

    // Hache le mot de passe
    const hashedPassword = await bcrypt.hash('Vashthestampede2a.', 10);

    // Crée l'utilisateur
    const newUser = await userModel.createUser({
      username: 'moosyne@gmail.com',
      password: hashedPassword,
      role: 'user'
    });

    console.log('Utilisateur créé avec succès:', newUser);
  } catch (error) {
    console.error('Erreur lors de la création de l\'utilisateur:', error);
  }
}

createTestUser();