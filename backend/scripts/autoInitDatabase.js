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
      'CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)'
    ]
  },

  // Table tva_regimes
  tva_regimes: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      code: 'VARCHAR(50) UNIQUE NOT NULL',
      label: 'TEXT NOT NULL',
      taux: 'DECIMAL(5,2)',
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
      signed_at: 'TIMESTAMP',
      signed_by: 'TEXT',
      signature_data: 'TEXT',
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
      let cleanDef = columnDef.replace(/REFERENCES[^,)]+/g, '');

      try {
        await client.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${cleanDef};`);
        console.log(`  ✓ Colonne ${columnName} ajoutée`);
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

    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT (code) DO NOTHING;
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
    { code: 'NORMAL', label: 'TVA normale à 20%', category: 'taux_normal', taux: 20.00, article_cgi: 'Article 278 du CGI', description: 'Taux normal de TVA applicable à la plupart des biens et services', calcul_type: 'normal', ordre: 1 },
    { code: 'INTERMEDIAIRE', label: 'TVA intermédiaire à 10%', category: 'taux_reduit', taux: 10.00, article_cgi: 'Article 278 bis du CGI', description: 'Restauration, travaux de rénovation, transport de voyageurs, etc.', calcul_type: 'normal', ordre: 2 },
    { code: 'REDUIT', label: 'TVA réduite à 5,5%', category: 'taux_reduit', taux: 5.50, article_cgi: 'Article 278-0 bis du CGI', description: 'Produits alimentaires, abonnements gaz/électricité, livres, etc.', calcul_type: 'normal', ordre: 3 },
    { code: 'SUPER_REDUIT', label: 'TVA super réduite à 2,1%', category: 'taux_reduit', taux: 2.10, article_cgi: 'Article 281 quater du CGI', description: 'Médicaments remboursables, publications de presse, certains spectacles', calcul_type: 'normal', ordre: 4 },
    { code: 'NON_APPLICABLE_293B', label: 'TVA non applicable, art. 293 B du CGI', category: 'non_application', taux: 0.00, article_cgi: 'Article 293 B du CGI', description: 'Franchise en base de TVA (micro-entreprise, CA < seuils)', mention_legale: 'TVA non applicable, art. 293 B du CGI', calcul_type: 'non_applicable', ordre: 10 }
  ];

  for (const regime of regimes) {
    await client.query(`
      INSERT INTO tva_regimes (code, label, category, taux, article_cgi, description, mention_legale, calcul_type, ordre, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
      ON CONFLICT (code) DO UPDATE SET
        label = EXCLUDED.label,
        category = EXCLUDED.category,
        taux = EXCLUDED.taux,
        article_cgi = EXCLUDED.article_cgi,
        description = EXCLUDED.description,
        mention_legale = EXCLUDED.mention_legale,
        calcul_type = EXCLUDED.calcul_type,
        ordre = EXCLUDED.ordre;
    `, [
      regime.code,
      regime.label,
      regime.category,
      regime.taux,
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
 * Fonction principale d'auto-initialisation
 */
async function autoInitDatabase(pool) {
  const client = await pool.connect();

  try {
    console.log('\n═'.repeat(60));
    console.log('🚀 AUTO-INITIALISATION DE LA BASE DE DONNÉES');
    console.log('═'.repeat(60));

    await client.query('BEGIN');

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
