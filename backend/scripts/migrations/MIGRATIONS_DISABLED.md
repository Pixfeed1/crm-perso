# ⚠️ MIGRATIONS DÉSACTIVÉES

**Date:** 2025-10-27
**Raison:** Conflit avec autoInitDatabase.js

---

## 🔍 Problème identifié

Les migrations SQL classiques entraient en **CONFLIT** avec le système `autoInitDatabase.js`, causant des erreurs critiques :

```
Erreur : "current transaction is aborted"
```

### Pourquoi ?

Deux systèmes différents essayaient de gérer la structure de la base de données :

1. **pgMigrations.js** (ancien système)
   - Appelé depuis `pgConfig.js` ligne 59
   - Exécutait les migrations de base (users, leads, projects, etc.)

2. **MigrationRunner.js** (système intermédiaire)
   - Lisait tous les fichiers `.js` dans `/scripts/migrations/`
   - Exécutait automatiquement les migrations au démarrage

3. **autoInitDatabase.js** (nouveau système - ACTIF)
   - Appelé depuis `server.js` ligne 182
   - Gère TOUTE la structure de la BDD automatiquement

**Résultat:** Les 3 systèmes se marchaient dessus et créaient des erreurs SQL qui cassaient les transactions.

---

## ✅ Solution appliquée

### Option A choisie : Désactiver les migrations, garder uniquement autoInitDatabase.js

**Modifications effectuées :**

1. **backend/config/pgConfig.js**
   - Ligne 70 : Commenté `await runMigrations(this.pool);`
   - Ajout de commentaires expliquant la désactivation

2. **backend/scripts/migrations/**
   - Fichiers `.js` renommés en `.disabled` pour les désactiver
   - Ce README ajouté pour documenter la décision

---

## 🚀 Système actuel : autoInitDatabase.js

**Emplacement:** `/backend/scripts/autoInitDatabase.js`
**Appelé depuis:** `server.js` ligne 182

### Pourquoi ce système est meilleur ?

✅ **Idempotent** : Peut tourner plusieurs fois sans erreur
✅ **Auto-réparation** : Crée automatiquement les tables/colonnes manquantes
✅ **Pas de fichiers manuels** : Tout est défini dans un seul fichier JavaScript
✅ **Gestion des dépendances** : Vérifie et crée les foreign keys automatiquement
✅ **Robuste** : Vérifie l'existence avant toute opération

### Comment ça marche ?

```javascript
// 1. Définition du schéma complet
const DATABASE_SCHEMA = {
  users: {
    columns: { id: 'SERIAL PRIMARY KEY', username: 'VARCHAR(255) UNIQUE NOT NULL', ... },
    indexes: [...]
  },
  quotes: { ... },
  invoices: { ... },
  // ... 8 tables au total
};

// 2. Pour chaque table : ensureTable()
// - Vérifie si la table existe
// - Crée la table si manquante
// - Ajoute les colonnes manquantes
// - Crée les index

// 3. Insère les données de référence
// - tva_regimes
// - payment_methods
```

---

## 📚 Documentation complète

Voir : `/AUTO_INIT_DATABASE.md`

---

## 🔧 Pour ajouter une nouvelle colonne

**PLUS BESOIN de créer une migration !**

Modifiez simplement `autoInitDatabase.js` :

```javascript
const DATABASE_SCHEMA = {
  quotes: {
    columns: {
      // ... colonnes existantes
      new_column: 'TEXT', // ← Ajoutez votre colonne ici
    }
  }
};
```

Au prochain démarrage du serveur, la colonne sera automatiquement créée.

---

## 🚨 Si vous devez réactiver les migrations

**NE LE FAITES PAS** sans d'abord :

1. Désactiver complètement `autoInitDatabase.js` dans `server.js`
2. Supprimer la ligne 182 : `await autoInitDatabase(db.pool);`
3. Réactiver les migrations dans `pgConfig.js`
4. Réécrire TOUTES les migrations pour qu'elles soient idempotentes
5. Tester sur une base de données vide

**Recommandation:** Gardez `autoInitDatabase.js`, c'est plus simple et plus robuste.

---

## 📝 Historique

- **2025-10-27** : Désactivation des migrations (conflit détecté)
- **2025-10-26** : Création de autoInitDatabase.js
- **2025-10-25** : Migrations causant des erreurs SQL

---

**Créé par:** Claude Code
**Commit:** Voir git log pour les détails
