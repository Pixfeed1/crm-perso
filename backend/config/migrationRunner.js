// backend/config/migrationRunner.js

/**
 * Gestionnaire de migrations automatiques
 *
 * S'exécute au démarrage du serveur pour :
 * - Créer la table migrations si elle n'existe pas
 * - Vérifier quelles migrations ont été exécutées
 * - Exécuter les nouvelles migrations uniquement
 * - Enregistrer les migrations exécutées
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class MigrationRunner {
  constructor() {
    this.pool = new Pool({
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'crm_db',
      password: process.env.DB_PASSWORD || 'postgres',
      port: process.env.DB_PORT || 5432,
    });
  }

  /**
   * Crée la table migrations si elle n'existe pas
   */
  async ensureMigrationsTable() {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✓ Table migrations prête');
    } catch (error) {
      console.error('❌ Erreur lors de la création de la table migrations:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Récupère la liste des migrations déjà exécutées
   */
  async getExecutedMigrations() {
    const client = await this.pool.connect();
    try {
      const result = await client.query('SELECT name FROM migrations ORDER BY executed_at');
      return result.rows.map(row => row.name);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des migrations:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Enregistre une migration comme exécutée
   */
  async recordMigration(migrationName) {
    const client = await this.pool.connect();
    try {
      await client.query(
        'INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [migrationName]
      );
    } catch (error) {
      console.error(`❌ Erreur lors de l'enregistrement de la migration ${migrationName}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Récupère tous les fichiers de migration disponibles
   */
  getMigrationFiles() {
    const migrationsDir = path.join(__dirname, '../scripts/migrations');

    // Vérifier si le dossier existe
    if (!fs.existsSync(migrationsDir)) {
      console.log('ℹ️  Aucun dossier de migrations trouvé');
      return [];
    }

    // Lire tous les fichiers .js du dossier
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.js'))
      .sort(); // Trier par ordre alphabétique (important pour l'ordre d'exécution)

    return files;
  }

  /**
   * Exécute une migration spécifique
   */
  async executeMigration(migrationFile) {
    const migrationPath = path.join(__dirname, '../scripts/migrations', migrationFile);

    try {
      console.log(`🔄 Exécution de la migration: ${migrationFile}`);

      // Charger et exécuter la migration
      const migration = require(migrationPath);

      if (typeof migration.runMigration === 'function') {
        await migration.runMigration();
      } else {
        console.warn(`⚠️  La migration ${migrationFile} n'a pas de fonction runMigration()`);
        return false;
      }

      // Enregistrer la migration
      await this.recordMigration(migrationFile);
      console.log(`✅ Migration ${migrationFile} exécutée avec succès`);

      return true;
    } catch (error) {
      console.error(`❌ Erreur lors de l'exécution de la migration ${migrationFile}:`, error);
      throw error;
    }
  }

  /**
   * Exécute toutes les migrations manquantes
   */
  async runPendingMigrations() {
    try {
      console.log('\n🚀 Vérification des migrations...\n');

      // S'assurer que la table migrations existe
      await this.ensureMigrationsTable();

      // Récupérer les migrations déjà exécutées
      const executedMigrations = await this.getExecutedMigrations();
      console.log(`📋 Migrations déjà exécutées: ${executedMigrations.length}`);

      // Récupérer tous les fichiers de migration disponibles
      const migrationFiles = this.getMigrationFiles();
      console.log(`📁 Migrations disponibles: ${migrationFiles.length}`);

      // Filtrer les migrations non exécutées
      const pendingMigrations = migrationFiles.filter(
        file => !executedMigrations.includes(file)
      );

      if (pendingMigrations.length === 0) {
        console.log('✅ Toutes les migrations sont à jour\n');
        return;
      }

      console.log(`\n⏳ ${pendingMigrations.length} migration(s) en attente:\n`);
      pendingMigrations.forEach(file => console.log(`   - ${file}`));
      console.log('');

      // Exécuter chaque migration en attente
      for (const migrationFile of pendingMigrations) {
        await this.executeMigration(migrationFile);
      }

      console.log(`\n✅ Toutes les migrations ont été exécutées avec succès!\n`);

    } catch (error) {
      console.error('\n❌ Erreur lors de l\'exécution des migrations:', error);
      throw error;
    } finally {
      await this.pool.end();
    }
  }
}

/**
 * Fonction principale à appeler au démarrage du serveur
 */
async function runMigrations() {
  const runner = new MigrationRunner();
  await runner.runPendingMigrations();
}

module.exports = { runMigrations, MigrationRunner };
