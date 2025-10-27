# 🚀 Système d'Auto-Initialisation de la Base de Données

## ✨ Qu'est-ce que c'est ?

Le système d'auto-initialisation vérifie et crée **automatiquement** toutes les tables et colonnes manquantes au démarrage du serveur backend.

**Plus besoin de lancer des migrations manuelles !**

## 🎯 Avantages

✅ **Automatique** : Tout se crée au démarrage du serveur
✅ **Robuste** : Gère les tables existantes et les nouvelles
✅ **Idempotent** : Peut tourner plusieurs fois sans erreur
✅ **Synchronisé** : Toujours cohérent avec le code
✅ **Simple** : Pas de commandes à lancer

## 📁 Fichiers Concernés

### 1. Script d'auto-initialisation
**Fichier :** `backend/scripts/autoInitDatabase.js`

Ce fichier contient :
- Le schéma complet de toutes les tables
- La logique de vérification et création
- L'insertion des données de référence

### 2. Intégration au serveur
**Fichier :** `backend/server.js` (ligne 10 et 183)

```javascript
const { autoInitDatabase } = require('./scripts/autoInitDatabase');

// Au démarrage :
async function initializeDatabase() {
  await autoInitDatabase(db.pool);
}
```

## 🔧 Comment ça fonctionne ?

### Au démarrage du serveur :

1. **Connexion à PostgreSQL**
2. **Pour chaque table :**
   - ✓ Vérifie si la table existe
   - ✓ Crée la table si elle n'existe pas
   - ✓ Vérifie chaque colonne
   - ✓ Ajoute les colonnes manquantes
   - ✓ Crée les index
3. **Données de référence :**
   - ✓ Insère les régimes de TVA
   - ✓ Insère les moyens de paiement
4. **Serveur prêt !**

### Logs au démarrage :

```
═══════════════════════════════════════════════════════════
🚀 AUTO-INITIALISATION DE LA BASE DE DONNÉES
═══════════════════════════════════════════════════════════

📋 Vérification table users...
  ✓ Table users existe déjà
  ✓ Index vérifiés

📋 Vérification table crm_clients...
  ✓ Table crm_clients existe déjà
  → Ajout colonne estimated_value...
  ✓ Colonne estimated_value ajoutée
  ✓ Index vérifiés

📋 Vérification table tva_regimes...
  → Table tva_regimes n'existe pas, création...
  ✓ Table tva_regimes créée
  ✓ Index vérifiés

📊 Vérification régimes de TVA...
  ✓ 5 régimes de TVA insérés/mis à jour

═══════════════════════════════════════════════════════════
✅ BASE DE DONNÉES PRÊTE
═══════════════════════════════════════════════════════════
```

## 🆕 Ajouter une Nouvelle Table

### Étape 1 : Modifier le schéma

Éditez `backend/scripts/autoInitDatabase.js` et ajoutez votre table dans `DATABASE_SCHEMA` :

```javascript
const DATABASE_SCHEMA = {
  // ... tables existantes ...

  // Nouvelle table
  ma_nouvelle_table: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      nom: 'VARCHAR(255) NOT NULL',
      description: 'TEXT',
      actif: 'BOOLEAN DEFAULT true',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_ma_table_actif ON ma_nouvelle_table(actif)'
    ],
    data: [] // Données de référence optionnelles
  }
};
```

### Étape 2 : Redémarrer le serveur

```bash
cd backend
npm start
```

**C'est tout !** La table sera créée automatiquement.

## 🔄 Ajouter une Nouvelle Colonne

### Étape 1 : Modifier le schéma

Dans `DATABASE_SCHEMA`, ajoutez la colonne à la table existante :

```javascript
crm_clients: {
  columns: {
    id: 'SERIAL PRIMARY KEY',
    name: 'VARCHAR(255) NOT NULL',
    // ... colonnes existantes ...
    nouvelle_colonne: 'VARCHAR(100)', // ← NOUVELLE COLONNE
  }
}
```

### Étape 2 : Redémarrer le serveur

```bash
npm start
```

**La colonne sera ajoutée automatiquement** aux tables existantes !

## ⚠️ Important

### Ce qui est géré automatiquement :

✅ Création de tables manquantes
✅ Ajout de colonnes manquantes
✅ Création d'index
✅ Insertion de données de référence
✅ Renommage de colonnes (si logique définie)

### Ce qui N'est PAS géré :

❌ Modification du type d'une colonne existante
❌ Suppression de colonnes
❌ Modifications complexes de schéma
❌ Migration de données existantes

Pour ces cas, créer une migration manuelle dans `backend/scripts/migrations/`.

## 🐛 En cas d'erreur

### PostgreSQL non accessible

```
❌ PostgreSQL n'est pas accessible
   Port: 5432
   Host: localhost
```

**Solution :**
```bash
# Linux
sudo service postgresql start

# macOS
brew services start postgresql

# Docker
docker-compose up -d postgres
```

### Colonne existante avec type différent

Si une colonne existe déjà avec un type différent, l'auto-init ne la modifiera pas.

**Solution :** Créer une migration manuelle pour changer le type.

## 📊 Tables Actuelles

Voici toutes les tables gérées automatiquement :

1. **users** - Utilisateurs du CRM
2. **crm_clients** - Clients / Prospects
3. **projects** - Projets
4. **tva_regimes** - Régimes de TVA (données de référence)
5. **payment_methods** - Moyens de paiement (données de référence)
6. **quotes** - Devis
7. **invoices** - Factures
8. **events** - Calendrier et événements

## 🚀 Pour Aller Plus Loin

### Ajouter des données de référence

Pour une table avec des données par défaut :

```javascript
ma_table: {
  columns: { ... },
  indexes: [ ... ],
  data: [
    { code: 'VALEUR1', label: 'Première valeur' },
    { code: 'VALEUR2', label: 'Deuxième valeur' }
  ]
}
```

Les données seront insérées avec `ON CONFLICT DO NOTHING` pour éviter les doublons.

### Désactiver l'auto-init (non recommandé)

Si vraiment nécessaire, commentez l'appel dans `server.js` :

```javascript
async function initializeDatabase() {
  // await autoInitDatabase(db.pool); // ← Commenté
}
```

**Note :** Cela désactivera la vérification automatique. Vous devrez gérer manuellement la base.

---

**Créé le :** 27 octobre 2025
**Auteur :** Claude Code
**Version :** 1.0
