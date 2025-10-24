// backend/config/pgMigrations.js
/**
 * Migrations pour PostgreSQL
 */

const runMigrations = async (pool) => {
  console.log('[PGMigrations] Démarrage des migrations PostgreSQL');

  try {
    // Créer une table pour suivre les migrations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS db_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    
    // Vérifier la version actuelle
    let currentVersion = 0;
    const versionResult = await pool.query("SELECT value FROM db_metadata WHERE key = 'version'");
    
    if (versionResult.rowCount > 0) {
      currentVersion = parseInt(versionResult.rows[0].value, 10);
    } else {
      await pool.query("INSERT INTO db_metadata (key, value) VALUES ('version', '0')");
    }
    
    console.log(`[PGMigrations] Version actuelle de la base de données: ${currentVersion}`);
    
    // Liste des migrations à exécuter
    const migrations = [
      createInitialTables,
      addGoalsTables,
      addProgressToProjects,
      ensureActivitiesLeadNameColumn
    ];
    
    // Exécuter les migrations manquantes
    for (let i = currentVersion; i < migrations.length; i++) {
      const migrationVersion = i + 1;
      console.log(`[PGMigrations] Exécution de la migration vers la version ${migrationVersion}...`);
      
      await migrations[i](pool);
      await pool.query("UPDATE db_metadata SET value = $1 WHERE key = 'version'", [migrationVersion.toString()]);
      
      console.log(`[PGMigrations] Migration ${migrationVersion} terminée avec succès`);
    }
    
    console.log('[PGMigrations] Toutes les migrations ont été exécutées avec succès');
  } catch (error) {
    console.error('[PGMigrations] Erreur lors des migrations:', error);
    throw error;
  }
};

// Migration 1: Création des tables initiales
async function createInitialTables(pool) {
  console.log('[PGMigrations] Création des tables initiales...');
  
  // Table des utilisateurs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Table des leads (prospects)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT,
      email TEXT,
      phone TEXT,
      type TEXT DEFAULT 'individual',
      status TEXT DEFAULT 'new',
      source TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Table des projets
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      description TEXT,
      start_date TIMESTAMP,
      end_date TIMESTAMP,
      status TEXT DEFAULT 'active',
      amount DECIMAL(15,2),
      lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Table des activités
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activities (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      planned_time INTEGER DEFAULT 0,
      actual_time INTEGER DEFAULT 0,
      date TIMESTAMP NOT NULL,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'planned',
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      lead_name TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Table des tâches
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      deadline TIMESTAMP,
      completed BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Table des événements
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      start_datetime TIMESTAMP NOT NULL,
      end_datetime TIMESTAMP NOT NULL,
      all_day BOOLEAN DEFAULT false,
      location TEXT,
      category TEXT,
      priority TEXT DEFAULT 'medium',
      color TEXT,
      reminder_time TEXT,
      activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Table des revenus
  await pool.query(`
    CREATE TABLE IF NOT EXISTS revenues (
      id SERIAL PRIMARY KEY,
      amount DECIMAL(15,2) NOT NULL,
      date TIMESTAMP NOT NULL,
      description TEXT,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      type TEXT DEFAULT 'invoice',
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log('[PGMigrations] Tables initiales créées avec succès');
}

// Migration 2: Ajout des tables pour les objectifs
async function addGoalsTables(pool) {
  console.log('[PGMigrations] Ajout des tables pour les objectifs...');
  
  // Table des objectifs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS goals (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      target_value DECIMAL(15,2) NOT NULL,
      current_value DECIMAL(15,2) DEFAULT 0,
      category TEXT NOT NULL,
      period TEXT NOT NULL,
      start_date TIMESTAMP NOT NULL,
      end_date TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Table des étapes d'objectifs (milestones)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS milestones (
      id SERIAL PRIMARY KEY,
      goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      target DECIMAL(15,2) NOT NULL,
      achieved BOOLEAN DEFAULT false
    )
  `);
  
  console.log('[PGMigrations] Tables des objectifs créées avec succès');
}

// Migration 3: Ajout de la colonne progress à la table projects
async function addProgressToProjects(pool) {
  console.log('[PGMigrations] Ajout de la colonne progress à la table projects...');
  
  // Vérifier si la colonne progress existe déjà
  const columnCheck = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'projects' AND column_name = 'progress'
  `);
  
  if (columnCheck.rowCount === 0) {
    await pool.query(`ALTER TABLE projects ADD COLUMN progress DECIMAL(5,2) DEFAULT 0`);
    console.log('[PGMigrations] Colonne progress ajoutée à la table projects');
  } else {
    console.log('[PGMigrations] La colonne progress existe déjà dans la table projects');
  }
}

// Migration 4: Vérification et correction de la table activities pour le lead_name
async function ensureActivitiesLeadNameColumn(pool) {
  console.log('[PGMigrations] Vérification de la colonne lead_name dans la table activities...');
  
  // Vérifier si la colonne lead_name existe déjà
  const columnCheck = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'activities' AND column_name = 'lead_name'
  `);
  
  if (columnCheck.rowCount === 0) {
    await pool.query(`ALTER TABLE activities ADD COLUMN lead_name TEXT`);
    
    // Mettre à jour les valeurs de lead_name à partir des leads existants
    await pool.query(`
      UPDATE activities 
      SET lead_name = (
        SELECT name 
        FROM leads 
        WHERE leads.id = activities.lead_id
      )
      WHERE lead_id IS NOT NULL AND (lead_name IS NULL OR lead_name = '')
    `);
    
    console.log('[PGMigrations] Colonne lead_name ajoutée et mise à jour dans la table activities');
  } else {
    console.log('[PGMigrations] La colonne lead_name existe déjà dans la table activities');
  }
}

module.exports = runMigrations;