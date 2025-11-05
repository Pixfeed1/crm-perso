# 📦 Système de Migrations Automatiques

## Vue d'ensemble

Ce dossier contient les migrations de base de données qui s'exécutent **automatiquement au démarrage du serveur**.

✅ **Aucune commande manuelle requise** - Les migrations se font toutes seules !

## Comment ça fonctionne ?

1. **Au démarrage du serveur**, le système :
   - Crée une table `migrations` (si elle n'existe pas)
   - Vérifie quelles migrations ont déjà été exécutées
   - Exécute **uniquement les nouvelles migrations** dans l'ordre alphabétique
   - Enregistre les migrations exécutées

2. **Lors des redémarrages suivants** :
   - Les migrations déjà exécutées sont **ignorées**
   - Seules les nouvelles migrations sont exécutées

## 📝 Créer une nouvelle migration

### 1. Nommage du fichier

Utilisez le format : `YYYY-MM-DD-nomDescriptif.js`

Exemples :
- `2025-01-15-addContactClientRelation.js`
- `2025-01-20-addUserRoles.js`
- `2025-02-01-createNotificationsTable.js`

**Important** : L'ordre alphabétique = ordre d'exécution !

### 2. Structure du fichier

```javascript
// backend/scripts/migrations/2025-01-15-exemple.js

const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'crm_db',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5432,
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🚀 Démarrage de la migration: exemple');

    // VÉRIFIER si la modification existe déjà (idempotence)
    const checkColumn = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'ma_table'
      AND column_name = 'ma_colonne';
    `);

    if (checkColumn.rows.length > 0) {
      console.log('✓ Migration déjà appliquée');
      return;
    }

    // APPLIQUER les modifications
    await client.query(`
      ALTER TABLE ma_table
      ADD COLUMN ma_colonne VARCHAR(255);
    `);

    console.log('✅ Migration terminée avec succès !');

  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Permettre l'exécution manuelle si besoin
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('Migration complète.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Échec de la migration:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };
```

### 3. Règles importantes

✅ **À FAIRE** :
- Toujours exporter `runMigration` via `module.exports`
- Vérifier si la modification existe déjà (idempotence)
- Utiliser `console.log()` pour indiquer la progression
- Gérer les erreurs avec try/catch
- Fermer la connexion dans `finally`

❌ **À ÉVITER** :
- Ne PAS modifier le nom d'un fichier déjà déployé
- Ne PAS supprimer de migrations (elles sont historiques)
- Ne PAS faire de rollback automatique (créer une nouvelle migration à la place)

## 📋 Exemples de migrations courantes

### Ajouter une colonne

```javascript
await client.query(`
  ALTER TABLE users
  ADD COLUMN avatar_url VARCHAR(255);
`);
```

### Créer une table

```javascript
await client.query(`
  CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);
```

### Ajouter un index

```javascript
await client.query(`
  CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON notifications(user_id);
`);
```

### Modifier une colonne

```javascript
await client.query(`
  ALTER TABLE users
  ALTER COLUMN email SET NOT NULL;
`);
```

### Ajouter une contrainte

```javascript
await client.query(`
  ALTER TABLE quotes
  ADD CONSTRAINT fk_quotes_client
  FOREIGN KEY (client_id) REFERENCES crm_clients(id)
  ON DELETE SET NULL;
`);
```

## 🔍 Vérifier l'état des migrations

### Via la base de données

```sql
SELECT * FROM migrations ORDER BY executed_at;
```

### Via les logs du serveur

Au démarrage, tu verras :

```
🚀 Vérification des migrations...

✓ Table migrations prête
📋 Migrations déjà exécutées: 3
📁 Migrations disponibles: 4

⏳ 1 migration(s) en attente:
   - 2025-01-20-addUserRoles.js

🔄 Exécution de la migration: 2025-01-20-addUserRoles.js
✅ Migration 2025-01-20-addUserRoles.js exécutée avec succès

✅ Toutes les migrations ont été exécutées avec succès!
```

## 🛠️ Exécution manuelle (optionnel)

Tu peux aussi exécuter une migration manuellement si besoin :

```bash
cd backend
node scripts/migrations/2025-01-15-exemple.js
```

Mais **ce n'est pas nécessaire** car elles s'exécutent automatiquement !

## 🚨 Dépannage

### Erreur : "Migration déjà exécutée mais modifications non appliquées"

Si une migration a échoué à moitié :
1. Vérifier manuellement l'état de la base de données
2. Supprimer l'entrée dans la table `migrations` :
   ```sql
   DELETE FROM migrations WHERE name = 'nom-de-la-migration.js';
   ```
3. Redémarrer le serveur

### Erreur : "Pool has already been drained"

C'est normal si tu exécutes une migration manuellement puis redémarres le serveur.
Le système gère automatiquement les connexions.

## 📚 Ressources

- [Documentation PostgreSQL](https://www.postgresql.org/docs/)
- [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
- [CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html)
