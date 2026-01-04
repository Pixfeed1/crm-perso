/**
 * AUTO-INITIALISATION DE LA BASE DE DONNÉES
 *
 * Ce script s'exécute automatiquement au démarrage du backend.
 * Il vérifie que toutes les tables et colonnes existent, et les crée si nécessaire.
 *
 * Avantages :
 * - Pas besoin de migrations manuelles
 * - Toujours cohérent avec le code
 * - Ajoute automatiquement les nouvelles colonnes
 * - Idempotent (peut tourner plusieurs fois sans erreur)
 */

const { Pool } = require('pg');

// Schéma complet de la base de données
const DATABASE_SCHEMA = {
  // Table users
  users: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      username: 'VARCHAR(255) UNIQUE NOT NULL',
      email: 'VARCHAR(255) UNIQUE NOT NULL',
      password: 'VARCHAR(255) NOT NULL',
      company_name: 'VARCHAR(255)',
      address: 'TEXT',
      postal_code: 'VARCHAR(20)',
      city: 'VARCHAR(100)',
      siret: 'VARCHAR(14)',
      phone: 'VARCHAR(20)',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: []
  },

  // Table crm_clients
  crm_clients: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      name: 'VARCHAR(255) NOT NULL',
      email: 'VARCHAR(255)',
      phone: 'VARCHAR(50)',
      address: 'TEXT',
      siret: 'VARCHAR(14)',
      notes: 'TEXT',
      status: "VARCHAR(50) DEFAULT 'active'",
      category: 'VARCHAR(50)',
      source: 'VARCHAR(100)',
      assigned_to: 'INTEGER',
      estimated_value: 'DECIMAL(10,2)',
      last_contact: 'TIMESTAMP',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_crm_clients_status ON crm_clients(status)',
      'CREATE INDEX IF NOT EXISTS idx_crm_clients_email ON crm_clients(email)'
    ]
  },

  // Table projects
  projects: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      name: 'TEXT NOT NULL',
      description: 'TEXT',
      client_id: 'INTEGER REFERENCES crm_clients(id) ON DELETE SET NULL',
      lead_id: 'INTEGER',
      status: "VARCHAR(50) DEFAULT 'active'",
      start_date: 'DATE',
      end_date: 'DATE',
      budget: 'NUMERIC DEFAULT 0',
      color: "VARCHAR(20) DEFAULT '#6366F1'",
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id)',
      'CREATE INDEX IF NOT EXISTS idx_projects_lead_id ON projects(lead_id)',
      'CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)'
    ]
  },

  // Table project_payments (paiements des projets)
  project_payments: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      project_id: 'INTEGER REFERENCES projects(id) ON DELETE CASCADE',
      amount: 'NUMERIC NOT NULL CHECK (amount > 0)',
      payment_date: 'DATE NOT NULL DEFAULT CURRENT_DATE',
      payment_method: 'VARCHAR(50)',
      reference: 'VARCHAR(255)',
      notes: 'TEXT',
      revenue_id: 'INTEGER',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_project_payments_project_id ON project_payments(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_project_payments_payment_date ON project_payments(payment_date)'
    ]
  },

  // Table revenues (revenus)
  revenues: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      amount: 'NUMERIC NOT NULL',
      date: 'DATE NOT NULL',
      description: 'TEXT',
      type: 'VARCHAR(50)',
      status: 'VARCHAR(50) DEFAULT \'pending\'',
      project_id: 'INTEGER REFERENCES projects(id) ON DELETE SET NULL',
      lead_id: 'INTEGER',
      client_id: 'INTEGER REFERENCES crm_clients(id) ON DELETE SET NULL',
      payment_method: 'VARCHAR(50)',
      invoice_number: 'VARCHAR(100)',
      notes: 'TEXT',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_revenues_date ON revenues(date)',
      'CREATE INDEX IF NOT EXISTS idx_revenues_status ON revenues(status)',
      'CREATE INDEX IF NOT EXISTS idx_revenues_project_id ON revenues(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_revenues_client_id ON revenues(client_id)'
    ]
  },

  // Table tasks (tâches des projets)
  tasks: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      project_id: 'INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE',
      title: 'TEXT NOT NULL',
      description: 'TEXT',
      deadline: 'DATE',
      completed: 'BOOLEAN DEFAULT false',
      priority: 'VARCHAR(20) DEFAULT \'medium\'',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed)',
      'CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline)'
    ]
  },

  // Table tva_regimes
  tva_regimes: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      code: 'VARCHAR(50) UNIQUE NOT NULL',
      label: 'TEXT NOT NULL',
      rate: 'DECIMAL(5,2)',
      category: "VARCHAR(50) NOT NULL DEFAULT 'taux_normal'",
      article_cgi: 'TEXT',
      description: 'TEXT',
      mention_legale: 'TEXT',
      calcul_type: "VARCHAR(20) DEFAULT 'normal'",
      ordre: 'INTEGER DEFAULT 0',
      active: 'BOOLEAN DEFAULT true',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_tva_regimes_category ON tva_regimes(category)',
      'CREATE INDEX IF NOT EXISTS idx_tva_regimes_active ON tva_regimes(active)',
      'CREATE INDEX IF NOT EXISTS idx_tva_regimes_ordre ON tva_regimes(ordre)'
    ],
    data: [] // Données insérées plus tard via fonction dédiée
  },

  // Table payment_methods
  payment_methods: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      code: 'VARCHAR(50) UNIQUE NOT NULL',
      label: 'TEXT NOT NULL',
      description: 'TEXT',
      is_active: 'BOOLEAN DEFAULT true',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [],
    data: [
      { code: 'VIREMENT', label: 'Virement bancaire', description: 'Paiement par virement bancaire' },
      { code: 'CHEQUE', label: 'Chèque', description: 'Paiement par chèque' },
      { code: 'CARTE', label: 'Carte bancaire', description: 'Paiement par carte bancaire' },
      { code: 'ESPECES', label: 'Espèces', description: 'Paiement en espèces' },
      { code: 'PRELEVEMENT', label: 'Prélèvement automatique', description: 'Prélèvement SEPA' },
      { code: 'PAYPAL', label: 'PayPal', description: 'Paiement via PayPal' },
      { code: 'STRIPE', label: 'Stripe', description: 'Paiement via Stripe' },
      { code: 'TRAITE', label: 'Lettre de change / Traite', description: 'Paiement par traite' },
      { code: 'AUTRE', label: 'Autre', description: 'Autre moyen de paiement' }
    ]
  },

  // Table quotes
  quotes: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      quote_number: 'VARCHAR(50) UNIQUE NOT NULL',
      title: 'TEXT',
      client_id: 'INTEGER REFERENCES crm_clients(id)',
      client_name: 'TEXT',
      client_email: 'VARCHAR(255)',
      client_address: 'TEXT',
      client_siret: 'VARCHAR(14)',
      project_id: 'INTEGER REFERENCES projects(id) ON DELETE SET NULL',
      status: "VARCHAR(50) DEFAULT 'draft'",
      total_ht: 'NUMERIC DEFAULT 0',
      total_ttc: 'NUMERIC DEFAULT 0',
      tva_rate: 'DECIMAL(5,2) DEFAULT 20.00',
      tva_amount: 'NUMERIC DEFAULT 0',
      tva_applicable: 'BOOLEAN DEFAULT true',
      tva_regime: "VARCHAR(50) DEFAULT 'NORMAL'",
      discount_type: "VARCHAR(10) DEFAULT 'none'",
      discount_value: 'DECIMAL(10,2) DEFAULT 0',
      discount_amount: 'NUMERIC DEFAULT 0',
      items: 'JSONB DEFAULT \'[]\'',
      payment_methods: 'JSONB DEFAULT \'[]\'',
      payment_details: "JSONB DEFAULT '{}'",
      cgv: 'TEXT',
      cgv_type: "VARCHAR(10) DEFAULT 'text'",
      cgv_pdf: 'TEXT',
      acompte_type: "VARCHAR(10) DEFAULT 'none'",
      acompte_value: 'DECIMAL(10,2) DEFAULT 0',
      acompte_amount: 'NUMERIC DEFAULT 0',
      escompte_percent: 'DECIMAL(5,2) DEFAULT 0',
      escompte_days: 'INT DEFAULT 0',
      validity_days: 'INT DEFAULT 30',
      additional_info: 'TEXT',
      additional_files: 'JSONB DEFAULT \'[]\'',
      notes: 'TEXT',
      issue_date: 'DATE DEFAULT CURRENT_DATE',
      expiry_date: 'DATE',
      sent_at: 'TIMESTAMP',
      sent_to: 'TEXT',
      sent_count: 'INT DEFAULT 0',
      signed_at: 'TIMESTAMP',
      signed_by: 'TEXT',
      signature_data: 'TEXT',
      show_logo: 'BOOLEAN DEFAULT true',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON quotes(client_id)',
      'CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status)',
      'CREATE INDEX IF NOT EXISTS idx_quotes_project_id ON quotes(project_id)'
    ]
  },

  // Table invoices
  invoices: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      invoice_number: 'VARCHAR(50) UNIQUE NOT NULL',
      title: 'TEXT',
      quote_id: 'INTEGER REFERENCES quotes(id)',
      client_id: 'INTEGER REFERENCES crm_clients(id)',
      client_name: 'TEXT',
      client_email: 'VARCHAR(255)',
      client_address: 'TEXT',
      client_siret: 'VARCHAR(14)',
      project_id: 'INTEGER REFERENCES projects(id) ON DELETE SET NULL',
      status: "VARCHAR(50) DEFAULT 'draft'",
      payment_status: "VARCHAR(50) DEFAULT 'pending'",
      amount_paid: 'NUMERIC DEFAULT 0',
      amount_remaining: 'NUMERIC DEFAULT 0',
      total_ht: 'NUMERIC DEFAULT 0',
      total_ttc: 'NUMERIC DEFAULT 0',
      tva_rate: 'DECIMAL(5,2) DEFAULT 20.00',
      tva_amount: 'NUMERIC DEFAULT 0',
      tva_applicable: 'BOOLEAN DEFAULT true',
      tva_regime: "VARCHAR(50) DEFAULT 'NORMAL'",
      discount_type: "VARCHAR(10) DEFAULT 'none'",
      discount_value: 'DECIMAL(10,2) DEFAULT 0',
      discount_amount: 'NUMERIC DEFAULT 0',
      items: 'JSONB DEFAULT \'[]\'',
      payment_methods: 'JSONB DEFAULT \'[]\'',
      payment_details: "JSONB DEFAULT '{}'",
      cgv: 'TEXT',
      cgv_type: "VARCHAR(10) DEFAULT 'text'",
      cgv_pdf: 'TEXT',
      acompte_type: "VARCHAR(10) DEFAULT 'none'",
      acompte_value: 'DECIMAL(10,2) DEFAULT 0',
      acompte_amount: 'NUMERIC DEFAULT 0',
      escompte_percent: 'DECIMAL(5,2) DEFAULT 0',
      escompte_days: 'INT DEFAULT 0',
      payment_terms_days: 'INT DEFAULT 30',
      additional_info: 'TEXT',
      additional_files: 'JSONB DEFAULT \'[]\'',
      notes: 'TEXT',
      issue_date: 'DATE DEFAULT CURRENT_DATE',
      due_date: 'DATE',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON invoices(project_id)'
    ]
  },

  // Table payments (paiements des factures)
  payments: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      invoice_id: 'INTEGER REFERENCES invoices(id) ON DELETE CASCADE',
      amount: 'NUMERIC NOT NULL CHECK (amount > 0)',
      payment_date: 'DATE NOT NULL DEFAULT CURRENT_DATE',
      payment_method: 'VARCHAR(50)',
      reference: 'VARCHAR(255)',
      status: "VARCHAR(50) DEFAULT 'completed'",
      notes: 'TEXT',
      created_by: 'INTEGER',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id)',
      'CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date)',
      'CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)'
    ]
  },

  // Table events (calendrier)
  events: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      title: 'TEXT NOT NULL',
      description: 'TEXT',
      start_datetime: 'TIMESTAMP NOT NULL',
      end_datetime: 'TIMESTAMP NOT NULL',
      all_day: 'BOOLEAN DEFAULT false',
      location: 'TEXT',
      color: 'VARCHAR(20)',
      category: 'VARCHAR(50)',
      related_to_type: 'VARCHAR(50)',
      related_to_id: 'INTEGER',
      reminder_minutes: 'INTEGER',
      recurrence_type: 'VARCHAR(20)',
      recurrence_interval: 'INTEGER',
      recurrence_end_date: 'DATE',
      recurrence_count: 'INTEGER',
      recurrence_days: 'JSONB',
      parent_event_id: 'INTEGER',
      is_deleted: 'BOOLEAN DEFAULT false',
      project_id: 'INTEGER REFERENCES projects(id) ON DELETE SET NULL',
      completion_percentage: 'INTEGER CHECK (completion_percentage >= 0 AND completion_percentage <= 100)',
      swimlane: 'VARCHAR(100)',
      timeline_color: 'VARCHAR(7)',
      is_milestone: 'BOOLEAN DEFAULT false',
      video_link: 'TEXT',
      video_provider: 'VARCHAR(20)',
      video_meeting_id: 'VARCHAR(255)',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_events_start_datetime ON events(start_datetime)',
      'CREATE INDEX IF NOT EXISTS idx_events_related ON events(related_to_type, related_to_id)',
      'CREATE INDEX IF NOT EXISTS idx_events_project_id ON events(project_id)'
    ]
  },

  // Table settings (paramètres système)
  settings: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      key: 'VARCHAR(100) UNIQUE NOT NULL',
      value: 'JSONB NOT NULL',
      description: 'TEXT',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key)'
    ],
    data: [
      {
        key: 'reminders_enabled',
        value: JSON.stringify(false),
        description: 'Activer/désactiver le système de relances automatiques'
      },
      {
        key: 'reminder_config',
        value: JSON.stringify({
          reminder_1_days: 7,
          reminder_2_days: 14,
          reminder_3_days: 21,
          email_subject_1: 'Rappel - Facture {invoice_number} en attente de paiement',
          email_subject_2: '2ème rappel - Facture {invoice_number} en retard',
          email_subject_3: 'Dernier rappel - Facture {invoice_number} impayée'
        }),
        description: 'Configuration des intervalles et templates de relances'
      }
    ]
  },

  // Table company_settings (paramètres de l'entreprise)
  company_settings: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      company_name: 'VARCHAR(255)',
      address: 'TEXT',
      postal_code: 'VARCHAR(20)',
      city: 'VARCHAR(100)',
      country: 'VARCHAR(100) DEFAULT \'France\'',
      siret: 'VARCHAR(14)',
      email: 'VARCHAR(255)',
      phone: 'VARCHAR(20)',
      logo_url: 'TEXT',
      email_signature: 'TEXT',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [],
    data: [
      {
        id: 1,
        company_name: 'Mon Entreprise',
        country: 'France'
      }
    ]
  },

  // Table invoice_reminders (historique des relances)
  invoice_reminders: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      invoice_id: 'INTEGER REFERENCES invoices(id) ON DELETE CASCADE',
      reminder_level: 'INTEGER NOT NULL CHECK (reminder_level >= 1 AND reminder_level <= 3)',
      sent_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      email_sent_to: 'VARCHAR(255)',
      days_overdue: 'INTEGER',
      status: "VARCHAR(50) DEFAULT 'sent'",
      error_message: 'TEXT',
      notes: 'TEXT',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice_id ON invoice_reminders(invoice_id)',
      'CREATE INDEX IF NOT EXISTS idx_invoice_reminders_sent_at ON invoice_reminders(sent_at)',
      'CREATE INDEX IF NOT EXISTS idx_invoice_reminders_status ON invoice_reminders(status)'
    ]
  },

  // Table video_conference_settings
  video_conference_settings: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      user_id: 'INTEGER REFERENCES users(id) ON DELETE CASCADE',
      default_provider: "VARCHAR(50) DEFAULT 'google_meet'",
      auto_generate: 'BOOLEAN DEFAULT false',
      google_meet_enabled: 'BOOLEAN DEFAULT false',
      google_calendar_id: 'VARCHAR(255)',
      zoom_enabled: 'BOOLEAN DEFAULT false',
      zoom_api_key: 'VARCHAR(255)',
      zoom_api_secret: 'VARCHAR(255)',
      zoom_user_id: 'VARCHAR(255)',
      teams_enabled: 'BOOLEAN DEFAULT false',
      teams_tenant_id: 'VARCHAR(255)',
      teams_user_id: 'VARCHAR(255)',
      default_duration: 'INTEGER DEFAULT 60',
      default_join_before_host: 'BOOLEAN DEFAULT true',
      default_waiting_room: 'BOOLEAN DEFAULT false',
      default_recording: 'BOOLEAN DEFAULT false',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_video_conference_settings_user_id ON video_conference_settings(user_id)'
    ]
  },

  // Table maintenance_reports (rapports de maintenance envoyés aux clients)
  maintenance_reports: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      project_id: 'INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE',
      client_id: 'INTEGER REFERENCES crm_clients(id) ON DELETE SET NULL',
      period_start: 'DATE NOT NULL',
      period_end: 'DATE NOT NULL',
      interventions_count: 'INTEGER DEFAULT 0',
      total_duration_minutes: 'INTEGER DEFAULT 0',
      report_data: 'JSONB', // Contenu du rapport (interventions, stats, etc.)
      status: "VARCHAR(50) DEFAULT 'draft'", // draft, sent, viewed
      sent_at: 'TIMESTAMP',
      sent_to: 'VARCHAR(255)',
      viewed_at: 'TIMESTAMP',
      notes: 'TEXT',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_maintenance_reports_project_id ON maintenance_reports(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_maintenance_reports_client_id ON maintenance_reports(client_id)',
      'CREATE INDEX IF NOT EXISTS idx_maintenance_reports_status ON maintenance_reports(status)',
      'CREATE INDEX IF NOT EXISTS idx_maintenance_reports_period ON maintenance_reports(period_start, period_end)'
    ]
  },

  // Table interventions (suivi des interventions de maintenance)
  interventions: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      project_id: 'INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE',
      title: 'TEXT NOT NULL',
      description: 'TEXT',
      type: "VARCHAR(50) DEFAULT 'maintenance'", // maintenance, update, backup, security, support, other
      status: "VARCHAR(50) DEFAULT 'planned'", // planned, in_progress, completed, cancelled
      priority: "VARCHAR(20) DEFAULT 'normal'", // low, normal, high, urgent
      scheduled_date: 'TIMESTAMP',
      completed_date: 'TIMESTAMP',
      duration_minutes: 'INTEGER',
      technician: 'VARCHAR(255)',
      notes: 'TEXT',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_interventions_project_id ON interventions(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_interventions_status ON interventions(status)',
      'CREATE INDEX IF NOT EXISTS idx_interventions_scheduled_date ON interventions(scheduled_date)',
      'CREATE INDEX IF NOT EXISTS idx_interventions_type ON interventions(type)'
    ]
  },

  // Table review_requests
  review_requests: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      client_id: 'INTEGER REFERENCES crm_clients(id) ON DELETE CASCADE',
      contact_name: 'VARCHAR(255)',
      contact_email: 'VARCHAR(255) NOT NULL',
      platforms: 'TEXT[]', // ['google', 'facebook', 'instagram']
      email_subject: 'TEXT NOT NULL',
      email_body: 'TEXT NOT NULL',
      sent_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      status: "VARCHAR(50) DEFAULT 'sent'", // 'sent', 'opened', 'clicked', 'reviewed'
      google_url: 'TEXT',
      facebook_url: 'TEXT',
      instagram_url: 'TEXT',
      notes: 'TEXT',
      user_id: 'INTEGER REFERENCES users(id)',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_review_requests_client_id ON review_requests(client_id)',
      'CREATE INDEX IF NOT EXISTS idx_review_requests_user_id ON review_requests(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_review_requests_status ON review_requests(status)',
      'CREATE INDEX IF NOT EXISTS idx_review_requests_sent_at ON review_requests(sent_at)'
    ]
  }
};

/**
 * Vérifie et crée une table si elle n'existe pas
 */
async function ensureTable(client, tableName, schema) {
  console.log(`\n📋 Vérification table ${tableName}...`);

  // Vérifier si la table existe
  const tableExists = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = $1
    );
  `, [tableName]);

  if (!tableExists.rows[0].exists) {
    // Créer la table avec toutes les colonnes
    console.log(`  → Table ${tableName} n'existe pas, création...`);

    const columns = Object.entries(schema.columns)
      .map(([name, definition]) => `${name} ${definition}`)
      .join(',\n      ');

    await client.query(`CREATE TABLE ${tableName} (${columns});`);
    console.log(`  ✓ Table ${tableName} créée`);
  } else {
    console.log(`  ✓ Table ${tableName} existe déjà`);
  }

  // Vérifier et ajouter les colonnes manquantes
  for (const [columnName, columnDef] of Object.entries(schema.columns)) {
    // Ignorer les colonnes avec PRIMARY KEY, REFERENCES, etc. dans la définition
    // car elles sont gérées à la création de la table
    if (columnDef.includes('PRIMARY KEY') || columnDef.includes('SERIAL')) {
      continue;
    }

    const columnExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = $1
        AND column_name = $2
      );
    `, [tableName, columnName]);

    if (!columnExists.rows[0].exists) {
      console.log(`  → Ajout colonne ${columnName}...`);

      // Nettoyer la définition pour ALTER TABLE
      // Supprimer complètement les clauses REFERENCES avec leurs parenthèses et clauses ON DELETE/UPDATE
      let cleanDef = columnDef
        .replace(/REFERENCES\s+\w+\([^)]+\)(\s+ON\s+(DELETE|UPDATE)\s+\w+(\s+\w+)?)?/gi, '')
        .trim();

      // Pour les colonnes NOT NULL, on enlève NOT NULL lors de l'ajout initial
      // car la table peut avoir des données existantes
      const hasNotNull = cleanDef.includes('NOT NULL');
      let alterDef = cleanDef.replace(/NOT NULL/g, '').trim();

      try {
        await client.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${alterDef};`);
        console.log(`  ✓ Colonne ${columnName} ajoutée`);

        // Si la colonne a DEFAULT, mettre à jour les lignes existantes NULL
        if (alterDef.includes('DEFAULT')) {
          const defaultMatch = alterDef.match(/DEFAULT\s+([^,\s]+(?:\s+'[^']*')?)/i);
          if (defaultMatch) {
            const defaultValue = defaultMatch[1];
            await client.query(`UPDATE ${tableName} SET ${columnName} = ${defaultValue} WHERE ${columnName} IS NULL;`);
            console.log(`  ✓ Valeurs par défaut appliquées pour ${columnName}`);
          }
        }

        // Ajouter NOT NULL après si c'était dans la définition originale
        if (hasNotNull) {
          try {
            await client.query(`ALTER TABLE ${tableName} ALTER COLUMN ${columnName} SET NOT NULL;`);
            console.log(`  ✓ Contrainte NOT NULL ajoutée pour ${columnName}`);
          } catch (err) {
            console.log(`  ⚠ Impossible d'ajouter NOT NULL pour ${columnName}: ${err.message}`);
          }
        }
      } catch (err) {
        console.log(`  ⚠ Colonne ${columnName} : ${err.message}`);
      }
    }
  }

  // Créer les index
  if (schema.indexes && schema.indexes.length > 0) {
    for (const indexQuery of schema.indexes) {
      try {
        await client.query(indexQuery);
      } catch (err) {
        // Ignorer les erreurs d'index (déjà existant, etc.)
      }
    }
    console.log(`  ✓ Index vérifiés`);
  }
}

/**
 * Insère les données de référence si elles n'existent pas
 */
async function ensureReferenceData(client, tableName, data) {
  if (!data || data.length === 0) return;

  console.log(`\n📊 Vérification données de référence ${tableName}...`);

  for (const row of data) {
    const columns = Object.keys(row);
    const values = Object.values(row);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    // Déterminer la colonne unique pour le ON CONFLICT
    let uniqueColumn;
    if (tableName === 'settings') {
      uniqueColumn = 'key';
    } else if (tableName === 'company_settings') {
      uniqueColumn = 'id';
    } else {
      uniqueColumn = 'code';
    }

    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (${uniqueColumn}) DO NOTHING;
    `;

    await client.query(query, values);
  }

  console.log(`  ✓ Données de référence ${tableName} insérées`);
}

/**
 * Insère les régimes de TVA complets
 */
async function ensureTvaRegimes(client) {
  console.log(`\n📊 Vérification régimes de TVA...`);

  const regimes = [
    { code: 'NORMAL', label: 'TVA normale à 20%', category: 'taux_normal', rate: 20.00, article_cgi: 'Article 278 du CGI', description: 'Taux normal de TVA applicable à la plupart des biens et services', calcul_type: 'normal', ordre: 1 },
    { code: 'INTERMEDIAIRE', label: 'TVA intermédiaire à 10%', category: 'taux_reduit', rate: 10.00, article_cgi: 'Article 278 bis du CGI', description: 'Restauration, travaux de rénovation, transport de voyageurs, etc.', calcul_type: 'normal', ordre: 2 },
    { code: 'REDUIT', label: 'TVA réduite à 5,5%', category: 'taux_reduit', rate: 5.50, article_cgi: 'Article 278-0 bis du CGI', description: 'Produits alimentaires, abonnements gaz/électricité, livres, etc.', calcul_type: 'normal', ordre: 3 },
    { code: 'SUPER_REDUIT', label: 'TVA super réduite à 2,1%', category: 'taux_reduit', rate: 2.10, article_cgi: 'Article 281 quater du CGI', description: 'Médicaments remboursables, publications de presse, certains spectacles', calcul_type: 'normal', ordre: 4 },
    { code: 'NON_APPLICABLE_293B', label: 'TVA non applicable, art. 293 B du CGI', category: 'non_application', rate: 0.00, article_cgi: 'Article 293 B du CGI', description: 'Franchise en base de TVA (micro-entreprise, CA < seuils)', mention_legale: 'TVA non applicable, art. 293 B du CGI', calcul_type: 'non_applicable', ordre: 10 }
  ];

  for (const regime of regimes) {
    await client.query(`
      INSERT INTO tva_regimes (code, label, category, rate, article_cgi, description, mention_legale, calcul_type, ordre, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      ON CONFLICT (code) DO UPDATE SET
        label = EXCLUDED.label,
        category = EXCLUDED.category,
        rate = EXCLUDED.rate,
        article_cgi = EXCLUDED.article_cgi,
        description = EXCLUDED.description,
        mention_legale = EXCLUDED.mention_legale,
        calcul_type = EXCLUDED.calcul_type,
        ordre = EXCLUDED.ordre;
    `, [
      regime.code,
      regime.label,
      regime.category,
      regime.rate,
      regime.article_cgi,
      regime.description,
      regime.mention_legale || null,
      regime.calcul_type,
      regime.ordre
    ]);
  }

  console.log(`  ✓ ${regimes.length} régimes de TVA insérés/mis à jour`);
}

/**
 * Supprime la contrainte de clé étrangère sur projects.lead_id si elle existe
 * Cette contrainte n'est pas nécessaire car lead_id est une référence optionnelle
 * et on veut pouvoir supprimer les leads sans casser les projets
 */
async function dropLeadIdForeignKey(client) {
  console.log('\n🔧 Vérification de la contrainte FK sur projects.lead_id...');

  try {
    // Vérifier si la contrainte existe
    const result = await client.query(`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'projects'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%lead_id%';
    `);

    if (result.rows.length > 0) {
      const constraintName = result.rows[0].constraint_name;
      console.log(`  → Suppression de la contrainte ${constraintName}...`);

      await client.query(`ALTER TABLE projects DROP CONSTRAINT IF EXISTS ${constraintName};`);
      console.log(`  ✓ Contrainte ${constraintName} supprimée`);
    } else {
      console.log(`  ✓ Aucune contrainte FK sur lead_id (OK)`);
    }
  } catch (error) {
    console.warn(`  ⚠ Impossible de supprimer la contrainte FK: ${error.message}`);
    // Ne pas bloquer l'initialisation
  }
}

/**
 * Fonction principale d'auto-initialisation
 */
async function autoInitDatabase(pool) {
  const client = await pool.connect();

  try {
    console.log('\n═'.repeat(60));
    console.log('🚀 AUTO-INITIALISATION DE LA BASE DE DONNÉES');
    console.log('═'.repeat(60));

    await client.query('BEGIN');

    // Supprimer la contrainte FK problématique sur lead_id
    await dropLeadIdForeignKey(client);

    // Vérifier et créer toutes les tables
    for (const [tableName, schema] of Object.entries(DATABASE_SCHEMA)) {
      await ensureTable(client, tableName, schema);
    }

    // Insérer les données de référence
    await ensureTvaRegimes(client);
    await ensureReferenceData(client, 'payment_methods', DATABASE_SCHEMA.payment_methods.data);
    await ensureReferenceData(client, 'settings', DATABASE_SCHEMA.settings.data);

    await client.query('COMMIT');

    console.log('\n═'.repeat(60));
    console.log('✅ BASE DE DONNÉES PRÊTE');
    console.log('═'.repeat(60));
    console.log('');

    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Erreur lors de l\'auto-initialisation:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { autoInitDatabase };
