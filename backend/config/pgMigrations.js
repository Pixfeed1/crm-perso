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
      ensureActivitiesLeadNameColumn,
      createContactsTable,
      addUserIdColumns,
      addLeadConversionTracking,
      addEventInterconnections,
      createProjectContactsTable,
      createQuotesTables,
      createPasswordResetTokensTable
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

// Migration 5: Création de la table contacts (précédemment créée dynamiquement dans leadsRoutes.js)
async function createContactsTable(pool) {
  console.log('[PGMigrations] Création de la table contacts...');

  // Vérifier si la table existe déjà
  const tableCheck = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contacts'
  `);

  if (tableCheck.rowCount === 0) {
    await pool.query(`
      CREATE TABLE contacts (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        position TEXT,
        email TEXT,
        phone TEXT,
        is_primary BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[PGMigrations] Table contacts créée avec succès');
  } else {
    console.log('[PGMigrations] La table contacts existe déjà');

    // Vérifier et ajouter les colonnes manquantes si nécessaire
    const columnsCheck = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'contacts'
    `);

    const existingColumns = columnsCheck.rows.map(row => row.column_name);

    if (!existingColumns.includes('updated_at')) {
      await pool.query(`ALTER TABLE contacts ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
      console.log('[PGMigrations] Colonne updated_at ajoutée à la table contacts');
    }
  }
}

// Migration 6: Ajout de la colonne user_id à toutes les tables pour le multi-utilisateurs
async function addUserIdColumns(pool) {
  console.log('[PGMigrations] Ajout des colonnes user_id pour le support multi-utilisateurs...');

  const tables = ['leads', 'projects', 'activities', 'goals', 'revenues', 'events', 'contacts'];

  for (const tableName of tables) {
    // Vérifier si la colonne user_id existe déjà
    const columnCheck = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1 AND column_name = 'user_id'
    `, [tableName]);

    if (columnCheck.rowCount === 0) {
      await pool.query(`
        ALTER TABLE ${tableName}
        ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      `);
      console.log(`[PGMigrations] Colonne user_id ajoutée à la table ${tableName}`);

      // Mettre à jour les enregistrements existants avec le premier utilisateur
      const firstUser = await pool.query('SELECT id FROM users ORDER BY id LIMIT 1');

      if (firstUser.rowCount > 0) {
        const userId = firstUser.rows[0].id;
        await pool.query(`
          UPDATE ${tableName}
          SET user_id = $1
          WHERE user_id IS NULL
        `, [userId]);
        console.log(`[PGMigrations] Enregistrements existants de ${tableName} assignés à l'utilisateur ${userId}`);
      }
    } else {
      console.log(`[PGMigrations] La colonne user_id existe déjà dans la table ${tableName}`);
    }
  }

  console.log('[PGMigrations] Support multi-utilisateurs ajouté avec succès');
}

// Migration 7: Ajout du tracking de conversion Lead → Project
async function addLeadConversionTracking(pool) {
  console.log('[PGMigrations] Ajout du tracking de conversion Lead → Project...');

  const columns = ['converted_at', 'converted_to_project_id'];

  for (const columnName of columns) {
    // Vérifier si la colonne existe déjà
    const columnCheck = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'leads' AND column_name = $1
    `, [columnName]);

    if (columnCheck.rowCount === 0) {
      if (columnName === 'converted_at') {
        await pool.query(`ALTER TABLE leads ADD COLUMN converted_at TIMESTAMP`);
        console.log('[PGMigrations] Colonne converted_at ajoutée à la table leads');
      } else if (columnName === 'converted_to_project_id') {
        await pool.query(`
          ALTER TABLE leads
          ADD COLUMN converted_to_project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL
        `);
        console.log('[PGMigrations] Colonne converted_to_project_id ajoutée à la table leads');
      }
    } else {
      console.log(`[PGMigrations] La colonne ${columnName} existe déjà dans la table leads`);
    }
  }

  console.log('[PGMigrations] Tracking de conversion Lead → Project ajouté avec succès');
}

// Migration 8: Ajout de project_id et lead_id aux events pour les interconnexions
async function addEventInterconnections(pool) {
  console.log('[PGMigrations] Ajout des interconnexions aux events (project_id, lead_id)...');

  const columns = [
    { name: 'project_id', type: 'INTEGER REFERENCES projects(id) ON DELETE SET NULL' },
    { name: 'lead_id', type: 'INTEGER REFERENCES leads(id) ON DELETE SET NULL' }
  ];

  for (const column of columns) {
    // Vérifier si la colonne existe déjà
    const columnCheck = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'events' AND column_name = $1
    `, [column.name]);

    if (columnCheck.rowCount === 0) {
      await pool.query(`ALTER TABLE events ADD COLUMN ${column.name} ${column.type}`);
      console.log(`[PGMigrations] Colonne ${column.name} ajoutée à la table events`);
    } else {
      console.log(`[PGMigrations] La colonne ${column.name} existe déjà dans la table events`);
    }
  }

  console.log('[PGMigrations] Interconnexions events ajoutées avec succès');
}

// Migration 9: Création de la table de liaison project_contacts
async function createProjectContactsTable(pool) {
  console.log('[PGMigrations] Création de la table project_contacts...');

  // Vérifier si la table existe déjà
  const tableCheck = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'project_contacts'
  `);

  if (tableCheck.rowCount === 0) {
    await pool.query(`
      CREATE TABLE project_contacts (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        role TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, contact_id)
      )
    `);
    console.log('[PGMigrations] Table project_contacts créée avec succès');
  } else {
    console.log('[PGMigrations] La table project_contacts existe déjà');
  }
}

module.exports = runMigrations;
// Migration 10: Création des tables quotes et quote_items pour le module de devis
async function createQuotesTables(pool) {
  console.log('[PGMigrations] Création des tables quotes et quote_items...');

  // Table quotes
  const quotesTableCheck = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'quotes'
  `);

  if (quotesTableCheck.rowCount === 0) {
    await pool.query(`
      CREATE TABLE quotes (
        id SERIAL PRIMARY KEY,
        quote_number TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'draft',
        subtotal DECIMAL(15,2) DEFAULT 0,
        tax_rate DECIMAL(5,2) DEFAULT 20,
        tax_amount DECIMAL(15,2) DEFAULT 0,
        total_amount DECIMAL(15,2) DEFAULT 0,
        notes TEXT,
        terms TEXT,
        valid_until DATE,
        sent_at TIMESTAMP,
        accepted_at TIMESTAMP,
        rejected_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[PGMigrations] Table quotes créée avec succès');
  } else {
    console.log('[PGMigrations] La table quotes existe déjà');
  }

  // Table quote_items
  const quoteItemsTableCheck = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'quote_items'
  `);

  if (quoteItemsTableCheck.rowCount === 0) {
    await pool.query(`
      CREATE TABLE quote_items (
        id SERIAL PRIMARY KEY,
        quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        quantity DECIMAL(10,2) DEFAULT 1,
        unit_price DECIMAL(15,2) NOT NULL,
        total_price DECIMAL(15,2) NOT NULL,
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('[PGMigrations] Table quote_items créée avec succès');
  } else {
    console.log('[PGMigrations] La table quote_items existe déjà');
  }

  console.log('[PGMigrations] Tables de devis créées avec succès');
}

// Migration 11: Création de la table password_reset_tokens pour la récupération de mot de passe
async function createPasswordResetTokensTable(pool) {
  console.log('[PGMigrations] Création de la table password_reset_tokens...');

  // Vérifier si la table existe déjà
  const tableCheck = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'password_reset_tokens'
  `);

  if (tableCheck.rowCount === 0) {
    await pool.query(`
      CREATE TABLE password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT false,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Index pour améliorer les performances des recherches par token
    await pool.query(`
      CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token)
    `);

    // Index pour nettoyer les tokens expirés
    await pool.query(`
      CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at)
    `);

    console.log('[PGMigrations] Table password_reset_tokens créée avec succès');
  } else {
    console.log('[PGMigrations] La table password_reset_tokens existe déjà');
  }

  console.log('[PGMigrations] Table de récupération de mot de passe créée avec succès');
}
