// backend/scripts/initAllTables.js
const { Pool } = require('pg');
const dotenv = require('dotenv');

// Charger les variables d'environnement
dotenv.config();

// Paramètres PostgreSQL
const pgConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'postgres',
  password: process.env.DB_PASSWORD || 'root',
  port: process.env.DB_PORT || 5432,
};

// Connexion à PostgreSQL
const pgPool = new Pool(pgConfig);

/**
 * Vérifie si une table existe
 */
async function tableExists(client, tableName) {
  const query = `
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = $1
    );
  `;
  const result = await client.query(query, [tableName]);
  return result.rows[0].exists;
}

/**
 * Crée toutes les tables nécessaires pour l'application
 */
async function initAllTables() {
  const client = await pgPool.connect();

  try {
    console.log('🔄 Initialisation de toutes les tables de la base de données...');

    // 1. Table users
    if (!(await tableExists(client, 'users'))) {
      console.log('Création de la table users...');
      await client.query(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          email TEXT UNIQUE,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          reset_token TEXT,
          reset_token_expires TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await client.query(`CREATE INDEX idx_users_email ON users(email);`);
      await client.query(`CREATE INDEX idx_users_username ON users(username);`);
      console.log('✅ Table users créée');
    } else {
      console.log('✓ Table users existe déjà');
    }

    // 2. Table leads
    if (!(await tableExists(client, 'leads'))) {
      console.log('Création de la table leads...');
      await client.query(`
        CREATE TABLE leads (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          company TEXT,
          email TEXT,
          phone TEXT,
          source TEXT,
          status TEXT DEFAULT 'new',
          score INTEGER DEFAULT 0,
          type TEXT DEFAULT 'individual',
          notes TEXT,
          tags TEXT,
          assigned_to INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
        );
      `);
      await client.query(`CREATE INDEX idx_leads_status ON leads(status);`);
      await client.query(`CREATE INDEX idx_leads_email ON leads(email);`);
      await client.query(`CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);`);
      console.log('✅ Table leads créée');
    } else {
      console.log('✓ Table leads existe déjà');
    }

    // 3. Table contacts
    if (!(await tableExists(client, 'contacts'))) {
      console.log('Création de la table contacts...');
      await client.query(`
        CREATE TABLE contacts (
          id SERIAL PRIMARY KEY,
          lead_id INTEGER,
          name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          position TEXT,
          is_primary BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
        );
      `);
      await client.query(`CREATE INDEX idx_contacts_lead_id ON contacts(lead_id);`);
      console.log('✅ Table contacts créée');
    } else {
      console.log('✓ Table contacts existe déjà');
    }

    // 4. Table crm_clients
    if (!(await tableExists(client, 'crm_clients'))) {
      console.log('Création de la table crm_clients...');
      await client.query(`
        CREATE TABLE crm_clients (
          id SERIAL PRIMARY KEY,
          lead_id INTEGER,
          name TEXT NOT NULL,
          company TEXT,
          type TEXT DEFAULT 'individual',
          email TEXT,
          phone TEXT,
          address TEXT,
          website TEXT,
          industry TEXT,
          source TEXT,
          contract_start_date TIMESTAMP,
          lifetime_value NUMERIC DEFAULT 0,
          notes TEXT,
          tags TEXT,
          status TEXT DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
        );
      `);
      await client.query(`CREATE INDEX idx_clients_status ON crm_clients(status);`);
      await client.query(`CREATE INDEX idx_clients_lead_id ON crm_clients(lead_id);`);
      await client.query(`CREATE INDEX idx_clients_email ON crm_clients(email);`);
      console.log('✅ Table crm_clients créée');
    } else {
      console.log('✓ Table crm_clients existe déjà');
    }

    // 5. Table projects
    if (!(await tableExists(client, 'projects'))) {
      console.log('Création de la table projects...');
      await client.query(`
        CREATE TABLE projects (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          lead_id INTEGER,
          client_id INTEGER,
          status TEXT DEFAULT 'pending',
          priority TEXT DEFAULT 'medium',
          start_date TIMESTAMP,
          end_date TIMESTAMP,
          budget NUMERIC,
          progress INTEGER DEFAULT 0,
          tags TEXT,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
          FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL
        );
      `);
      await client.query(`CREATE INDEX idx_projects_status ON projects(status);`);
      await client.query(`CREATE INDEX idx_projects_lead_id ON projects(lead_id);`);
      await client.query(`CREATE INDEX idx_projects_client_id ON projects(client_id);`);
      console.log('✅ Table projects créée');
    } else {
      console.log('✓ Table projects existe déjà');
    }

    // 6. Table tasks
    if (!(await tableExists(client, 'tasks'))) {
      console.log('Création de la table tasks...');
      await client.query(`
        CREATE TABLE tasks (
          id SERIAL PRIMARY KEY,
          project_id INTEGER,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'pending',
          priority TEXT DEFAULT 'medium',
          assigned_to INTEGER,
          due_date TIMESTAMP,
          completed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
        );
      `);
      await client.query(`CREATE INDEX idx_tasks_project_id ON tasks(project_id);`);
      await client.query(`CREATE INDEX idx_tasks_status ON tasks(status);`);
      console.log('✅ Table tasks créée');
    } else {
      console.log('✓ Table tasks existe déjà');
    }

    // 7. Table activities
    if (!(await tableExists(client, 'activities'))) {
      console.log('Création de la table activities...');
      await client.query(`
        CREATE TABLE activities (
          id SERIAL PRIMARY KEY,
          type TEXT NOT NULL,
          description TEXT,
          lead_id INTEGER,
          lead_name TEXT,
          project_id INTEGER,
          status TEXT DEFAULT 'pending',
          date TIMESTAMP,
          duration INTEGER,
          notes TEXT,
          outcome TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );
      `);
      await client.query(`CREATE INDEX idx_activities_lead_id ON activities(lead_id);`);
      await client.query(`CREATE INDEX idx_activities_project_id ON activities(project_id);`);
      await client.query(`CREATE INDEX idx_activities_date ON activities(date);`);
      console.log('✅ Table activities créée');
    } else {
      console.log('✓ Table activities existe déjà');
    }

    // 8. Table events
    if (!(await tableExists(client, 'events'))) {
      console.log('Création de la table events...');
      await client.query(`
        CREATE TABLE events (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          start_datetime TIMESTAMP NOT NULL,
          end_datetime TIMESTAMP NOT NULL,
          location TEXT,
          type TEXT DEFAULT 'meeting',
          status TEXT DEFAULT 'scheduled',
          activity_id INTEGER,
          lead_id INTEGER,
          project_id INTEGER,
          reminder_minutes INTEGER,
          attendees TEXT,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
          FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
        );
      `);
      await client.query(`CREATE INDEX idx_events_start_datetime ON events(start_datetime);`);
      await client.query(`CREATE INDEX idx_events_lead_id ON events(lead_id);`);
      await client.query(`CREATE INDEX idx_events_project_id ON events(project_id);`);
      console.log('✅ Table events créée');
    } else {
      console.log('✓ Table events existe déjà');
    }

    // 9. Table revenues
    if (!(await tableExists(client, 'revenues'))) {
      console.log('Création de la table revenues...');
      await client.query(`
        CREATE TABLE revenues (
          id SERIAL PRIMARY KEY,
          source TEXT NOT NULL,
          amount NUMERIC NOT NULL,
          date TIMESTAMP NOT NULL,
          category TEXT,
          status TEXT DEFAULT 'pending',
          lead_id INTEGER,
          project_id INTEGER,
          client_id INTEGER,
          payment_method TEXT,
          invoice_number TEXT,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
          FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL
        );
      `);
      await client.query(`CREATE INDEX idx_revenues_date ON revenues(date);`);
      await client.query(`CREATE INDEX idx_revenues_status ON revenues(status);`);
      await client.query(`CREATE INDEX idx_revenues_lead_id ON revenues(lead_id);`);
      console.log('✅ Table revenues créée');
    } else {
      console.log('✓ Table revenues existe déjà');
    }

    // 10. Table goals
    if (!(await tableExists(client, 'goals'))) {
      console.log('Création de la table goals...');
      await client.query(`
        CREATE TABLE goals (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          target_value NUMERIC NOT NULL,
          current_value NUMERIC DEFAULT 0,
          category TEXT NOT NULL,
          period TEXT NOT NULL,
          start_date TIMESTAMP NOT NULL,
          end_date TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await client.query(`CREATE INDEX idx_goals_category ON goals(category);`);
      await client.query(`CREATE INDEX idx_goals_period ON goals(period);`);
      console.log('✅ Table goals créée');
    } else {
      console.log('✓ Table goals existe déjà');
    }

    // 11. Table milestones
    if (!(await tableExists(client, 'milestones'))) {
      console.log('Création de la table milestones...');
      await client.query(`
        CREATE TABLE milestones (
          id SERIAL PRIMARY KEY,
          goal_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          target NUMERIC NOT NULL,
          achieved BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
        );
      `);
      await client.query(`CREATE INDEX idx_milestones_goal_id ON milestones(goal_id);`);
      console.log('✅ Table milestones créée');
    } else {
      console.log('✓ Table milestones existe déjà');
    }

    // 12. Table reminders
    if (!(await tableExists(client, 'reminders'))) {
      console.log('Création de la table reminders...');
      await client.query(`
        CREATE TABLE reminders (
          id SERIAL PRIMARY KEY,
          entity_type TEXT NOT NULL,
          entity_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          due_date TIMESTAMP NOT NULL,
          priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
          status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'dismissed')),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP,
          dismissed_at TIMESTAMP
        );
      `);
      await client.query(`CREATE INDEX idx_reminders_status ON reminders(status);`);
      await client.query(`CREATE INDEX idx_reminders_due_date ON reminders(due_date);`);
      await client.query(`CREATE INDEX idx_reminders_entity ON reminders(entity_type, entity_id);`);
      console.log('✅ Table reminders créée');
    } else {
      console.log('✓ Table reminders existe déjà');
    }

    // 13. Table lead_interactions
    if (!(await tableExists(client, 'lead_interactions'))) {
      console.log('Création de la table lead_interactions...');
      await client.query(`
        CREATE TABLE lead_interactions (
          id SERIAL PRIMARY KEY,
          lead_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          date TIMESTAMP NOT NULL,
          notes TEXT,
          outcome TEXT,
          next_action TEXT,
          next_action_date TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
        );
      `);
      await client.query(`CREATE INDEX idx_lead_interactions_lead_id ON lead_interactions(lead_id);`);
      await client.query(`CREATE INDEX idx_lead_interactions_date ON lead_interactions(date);`);
      console.log('✅ Table lead_interactions créée');
    } else {
      console.log('✓ Table lead_interactions existe déjà');
    }

    // 14. Table quotes (devis)
    if (!(await tableExists(client, 'quotes'))) {
      console.log('Création de la table quotes...');
      await client.query(`
        CREATE TABLE quotes (
          id SERIAL PRIMARY KEY,
          quote_number TEXT NOT NULL UNIQUE,
          client_id INTEGER,
          client_name TEXT NOT NULL,
          client_email TEXT,
          client_address TEXT,
          client_siret TEXT,
          status TEXT DEFAULT 'draft',
          total_ht NUMERIC DEFAULT 0,
          total_ttc NUMERIC DEFAULT 0,
          tva_rate DECIMAL(5,2) DEFAULT 20.00,
          tva_amount NUMERIC DEFAULT 0,
          tva_applicable BOOLEAN DEFAULT true,
          items JSONB DEFAULT '[]',
          cgv TEXT,
          acompte_type VARCHAR(10) DEFAULT 'none',
          acompte_value DECIMAL(10,2) DEFAULT 0,
          acompte_amount NUMERIC DEFAULT 0,
          escompte_percent DECIMAL(5,2) DEFAULT 0,
          escompte_days INT DEFAULT 0,
          validity_days INT DEFAULT 30,
          notes TEXT,
          issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          expiry_date TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL
        );
      `);
      await client.query(`CREATE INDEX idx_quotes_client_id ON quotes(client_id);`);
      await client.query(`CREATE INDEX idx_quotes_status ON quotes(status);`);
      await client.query(`CREATE INDEX idx_quotes_issue_date ON quotes(issue_date);`);
      await client.query(`CREATE UNIQUE INDEX idx_quotes_number ON quotes(quote_number);`);
      console.log('✅ Table quotes créée');
    } else {
      console.log('✓ Table quotes existe déjà');
    }

    // 15. Table invoices (factures)
    if (!(await tableExists(client, 'invoices'))) {
      console.log('Création de la table invoices...');
      await client.query(`
        CREATE TABLE invoices (
          id SERIAL PRIMARY KEY,
          invoice_number TEXT NOT NULL UNIQUE,
          quote_id INTEGER,
          client_id INTEGER,
          client_name TEXT NOT NULL,
          client_email TEXT,
          client_address TEXT,
          client_siret TEXT,
          status TEXT DEFAULT 'draft',
          payment_status TEXT DEFAULT 'pending',
          total_ht NUMERIC DEFAULT 0,
          total_ttc NUMERIC DEFAULT 0,
          tva_rate DECIMAL(5,2) DEFAULT 20.00,
          tva_amount NUMERIC DEFAULT 0,
          tva_applicable BOOLEAN DEFAULT true,
          items JSONB DEFAULT '[]',
          cgv TEXT,
          acompte_type VARCHAR(10) DEFAULT 'none',
          acompte_value DECIMAL(10,2) DEFAULT 0,
          acompte_amount NUMERIC DEFAULT 0,
          escompte_percent DECIMAL(5,2) DEFAULT 0,
          escompte_days INT DEFAULT 0,
          payment_terms_days INT DEFAULT 30,
          notes TEXT,
          issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          due_date DATE,
          paid_date TIMESTAMP,
          last_reminder_date DATE,
          reminder_count INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE SET NULL,
          FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL
        );
      `);
      await client.query(`CREATE INDEX idx_invoices_client_id ON invoices(client_id);`);
      await client.query(`CREATE INDEX idx_invoices_quote_id ON invoices(quote_id);`);
      await client.query(`CREATE INDEX idx_invoices_status ON invoices(status);`);
      await client.query(`CREATE INDEX idx_invoices_payment_status ON invoices(payment_status);`);
      await client.query(`CREATE INDEX idx_invoices_issue_date ON invoices(issue_date);`);
      await client.query(`CREATE INDEX idx_invoices_due_date ON invoices(due_date);`);
      await client.query(`CREATE UNIQUE INDEX idx_invoices_number ON invoices(invoice_number);`);
      console.log('✅ Table invoices créée');
    } else {
      console.log('✓ Table invoices existe déjà');
    }

    // 16. Table company_settings (paramètres entreprise)
    if (!(await tableExists(client, 'company_settings'))) {
      console.log('Création de la table company_settings...');
      await client.query(`
        CREATE TABLE company_settings (
          id SERIAL PRIMARY KEY,
          company_name TEXT,
          address TEXT,
          postal_code TEXT,
          city TEXT,
          country TEXT DEFAULT 'France',
          siret TEXT,
          email TEXT,
          phone TEXT,
          logo_url TEXT,
          email_signature TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      // Insérer un enregistrement par défaut
      await client.query(`
        INSERT INTO company_settings (company_name, country)
        VALUES ('Mon Entreprise', 'France');
      `);
      console.log('✅ Table company_settings créée avec enregistrement par défaut');
    } else {
      console.log('✓ Table company_settings existe déjà');
    }

    console.log('🎉 Toutes les tables ont été initialisées avec succès !');

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation des tables:', error);
    throw error;
  } finally {
    client.release();
    // Ne fermer le pool que si le script est exécuté directement (pas en tant que module)
    if (require.main === module) {
      await pgPool.end();
      console.log('Connexion PostgreSQL fermée.');
    }
  }
}

// Exécuter la migration
if (require.main === module) {
  initAllTables()
    .then(() => {
      console.log('✅ Script d\'initialisation terminé.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erreur fatale:', error);
      process.exit(1);
    });
}

module.exports = { initAllTables };
