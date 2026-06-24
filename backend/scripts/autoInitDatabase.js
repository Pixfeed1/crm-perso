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

  // Table interactions (suivi des prises de contact : leads ET clients)
  // Polymorphe (contact_type + contact_id), sans FK car pointe sur leads OU crm_clients.
  interactions: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      contact_type: "VARCHAR(10) NOT NULL DEFAULT 'client'", // 'lead' | 'client'
      contact_id: 'INTEGER NOT NULL',
      type: "VARCHAR(20) NOT NULL DEFAULT 'note'", // email | appel | sms | note | rdv
      reached: 'VARCHAR(20)', // joint | pas_reponse | message (contact joint ?)
      date: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      notes: 'TEXT',
      result: 'TEXT',
      relation_status: 'VARCHAR(20)', // statut de relation appliqué lors de cet échange (historique)
      next_followup_date: 'DATE',
      next_followup_channel: 'VARCHAR(20)', // canal de la prochaine relance : appel|email|sms|autre
      followup_done: 'BOOLEAN DEFAULT FALSE',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(contact_type, contact_id)',
      'CREATE INDEX IF NOT EXISTS idx_interactions_followup ON interactions(next_followup_date, followup_done)'
    ]
  },

  // Table crawl_jobs (pilotage de l'outil externe cc_prospector)
  crawl_jobs: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      techno: 'VARCHAR(20)', // ecommerce | woocommerce | prestashop
      nb_sites: 'INTEGER',
      statut: "VARCHAR(20) DEFAULT 'pending'", // pending | running | done | error
      phase: 'VARCHAR(20)', // recherche | detection | done
      progress_done: 'INTEGER DEFAULT 0',
      progress_total: 'INTEGER DEFAULT 0',
      message: 'TEXT',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_crawl_jobs_statut ON crawl_jobs(statut)'
    ]
  },

  // Table crawl_results (sites détectés par un crawl)
  crawl_results: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      job_id: 'INTEGER REFERENCES crawl_jobs(id) ON DELETE CASCADE',
      domain: 'TEXT',
      platform: 'VARCHAR(30)', // WooCommerce | PrestaShop | Shopify | WordPress | Inconnu
      signals: 'TEXT',
      http_status: 'INTEGER',
      final_url: 'TEXT',
      title: 'TEXT',
      error: 'TEXT',
      gerant: 'TEXT', // enrichissement futur (null)
      email: 'TEXT',  // enrichissement futur (null)
      added_as_prospect: 'BOOLEAN DEFAULT FALSE',
      is_nocode: 'BOOLEAN DEFAULT FALSE' // site no-code/SaaS fermé -> masqué par défaut
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_crawl_results_job ON crawl_results(job_id)'
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
      recurrence_end_type: 'VARCHAR(20)',
      recurrence_end_date: 'DATE',
      recurrence_count: 'INTEGER',
      recurrence_days: 'VARCHAR(50)',
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
      // Paramètres SMTP
      smtp_host: 'VARCHAR(255)',
      smtp_port: 'INTEGER DEFAULT 587',
      smtp_secure: 'BOOLEAN DEFAULT false',
      smtp_user: 'VARCHAR(255)',
      smtp_pass: 'VARCHAR(255)',
      smtp_from_email: 'VARCHAR(255)',
      smtp_from_name: 'VARCHAR(255)',
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

  // Table maintenance_contracts (contrats de maintenance WordPress)
  maintenance_contracts: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      client_id: 'INTEGER REFERENCES crm_clients(id) ON DELETE SET NULL',
      site_name: 'VARCHAR(255) NOT NULL',
      site_url: 'VARCHAR(500)',
      contract_start_date: 'DATE',
      monthly_amount: 'NUMERIC(10,2) DEFAULT 0',
      plan: 'VARCHAR(50)',
      report_frequency: "VARCHAR(20) DEFAULT 'mensuel'",
      stripe_customer_id: 'VARCHAR(255)',
      stripe_subscription_id: 'VARCHAR(255)',
      billing_day: 'INTEGER', // jour de prélèvement (1..28, borné côté service)
      billing_status: "VARCHAR(20) DEFAULT 'none'", // none/pending/active/past_due/canceling/canceled
      billing_cancel_at: 'TIMESTAMP', // fin de période prévue si résiliation programmée
      billing_pay_token: 'VARCHAR(64)', // token public du lien court de paiement (/pay/:token)
      status: "VARCHAR(50) DEFAULT 'active'", // active, paused, cancelled
      wordpress_version: 'VARCHAR(20)',
      php_version: 'VARCHAR(20)',
      hosting_provider: 'VARCHAR(100)',
      admin_url: 'VARCHAR(500)',
      pagespeed_mobile: 'INTEGER',
      pagespeed_desktop: 'INTEGER',
      last_pagespeed_date: 'DATE',
      last_backup_date: 'DATE',
      last_update_date: 'DATE',
      last_report_date: 'DATE',
      next_report_due: 'DATE',
      plugins_count: 'INTEGER DEFAULT 0',
      notes: 'TEXT',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_maintenance_contracts_client_id ON maintenance_contracts(client_id)',
      'CREATE INDEX IF NOT EXISTS idx_maintenance_contracts_status ON maintenance_contracts(status)',
      'CREATE INDEX IF NOT EXISTS idx_maintenance_contracts_next_report ON maintenance_contracts(next_report_due)'
    ]
  },

  // Table subscriptions (abonnements libres : facturation récurrente Stripe)
  // Note : 'interval' est un mot réservé PostgreSQL -> colonne nommée billing_interval.
  subscriptions: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      client_id: 'INTEGER REFERENCES crm_clients(id) ON DELETE SET NULL',
      label: 'VARCHAR(255) NOT NULL',
      amount_eur: 'NUMERIC(10,2) DEFAULT 0', // montant en euros
      billing_interval: "VARCHAR(10) DEFAULT 'month'", // 'month' | 'year' (exposé 'interval' dans l'API)
      interval_count: 'INTEGER DEFAULT 1', // tous les N mois/ans
      stripe_customer_id: 'VARCHAR(255)',
      stripe_subscription_id: 'VARCHAR(255)',
      billing_pay_token: 'VARCHAR(64)', // token public du lien court de paiement
      billing_status: "VARCHAR(20) DEFAULT 'none'", // none/pending/active/past_due/canceling/canceled
      billing_cancel_at: 'TIMESTAMP', // fin de période prévue si résiliation programmée
      cond_intro: 'TEXT', // conditions PDF : intro
      cond_included: 'TEXT', // conditions PDF : lignes incluses (une par ligne)
      cond_excluded: 'TEXT', // conditions PDF : lignes exclues (une par ligne)
      cond_modalites: 'TEXT', // conditions PDF : modalités (Clé : valeur par ligne)
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_subscriptions_client_id ON subscriptions(client_id)',
      'CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(billing_status)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_pay_token ON subscriptions(billing_pay_token)'
    ]
  },

  // Table maintenance_reports (rapports de maintenance envoyés aux clients)
  maintenance_reports: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      project_id: 'INTEGER REFERENCES projects(id) ON DELETE CASCADE', // nullable : rapport de contrat sans projet lié
      maintenance_contract_id: 'INTEGER REFERENCES maintenance_contracts(id) ON DELETE CASCADE',
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
      'CREATE INDEX IF NOT EXISTS idx_maintenance_reports_contract_id ON maintenance_reports(maintenance_contract_id)',
      'CREATE INDEX IF NOT EXISTS idx_maintenance_reports_client_id ON maintenance_reports(client_id)',
      'CREATE INDEX IF NOT EXISTS idx_maintenance_reports_status ON maintenance_reports(status)',
      'CREATE INDEX IF NOT EXISTS idx_maintenance_reports_period ON maintenance_reports(period_start, period_end)'
    ]
  },

  // Table interventions (suivi des interventions de maintenance)
  interventions: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      project_id: 'INTEGER REFERENCES projects(id) ON DELETE CASCADE',
      maintenance_contract_id: 'INTEGER REFERENCES maintenance_contracts(id) ON DELETE CASCADE',
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
      'CREATE INDEX IF NOT EXISTS idx_interventions_contract_id ON interventions(maintenance_contract_id)',
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
  },

  // Table scheduled_emails (emails programmés en différé)
  scheduled_emails: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      // Destinataire
      to_email: 'VARCHAR(255) NOT NULL',
      to_name: 'VARCHAR(255)',
      cc_email: 'VARCHAR(255)',
      // Contenu
      subject: 'TEXT NOT NULL',
      body_html: 'TEXT NOT NULL',
      body_text: 'TEXT',
      // Pièces jointes (JSON array: [{filename, path, content_type}])
      attachments: 'JSONB DEFAULT \'[]\'',
      // Programmation
      scheduled_at: 'TIMESTAMP NOT NULL',
      timezone: "VARCHAR(50) DEFAULT 'Europe/Paris'",
      // Statut
      status: "VARCHAR(50) DEFAULT 'pending'", // pending, sent, failed, cancelled
      sent_at: 'TIMESTAMP',
      error_message: 'TEXT',
      retry_count: 'INTEGER DEFAULT 0',
      max_retries: 'INTEGER DEFAULT 3',
      // Contexte (pour pouvoir retrouver l'origine de l'email)
      email_type: 'VARCHAR(50)', // quote, invoice, maintenance_report, reminder, custom
      related_type: 'VARCHAR(50)', // client, quote, invoice, project, maintenance_contract
      related_id: 'INTEGER',
      // Métadonnées
      created_by: 'INTEGER REFERENCES users(id)',
      notes: 'TEXT',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status ON scheduled_emails(status)',
      'CREATE INDEX IF NOT EXISTS idx_scheduled_emails_scheduled_at ON scheduled_emails(scheduled_at)',
      'CREATE INDEX IF NOT EXISTS idx_scheduled_emails_related ON scheduled_emails(related_type, related_id)',
      'CREATE INDEX IF NOT EXISTS idx_scheduled_emails_pending ON scheduled_emails(status, scheduled_at) WHERE status = \'pending\''
    ]
  },

  // Modèles d'email (éditables/supprimables dans Réglages)
  email_templates: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      name: 'VARCHAR(255) NOT NULL',
      category: "VARCHAR(20) DEFAULT 'autre'", // contact|relance|cloture|interesse|presta|woo|autre
      subject: 'TEXT',
      body: 'TEXT',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: []
  },

  // Signatures d'email (une par défaut)
  email_signatures: {
    columns: {
      id: 'SERIAL PRIMARY KEY',
      name: 'VARCHAR(255) NOT NULL',
      content: 'TEXT',
      is_default: 'BOOLEAN DEFAULT FALSE',
      created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: []
  },

  // Table stripe_webhook_events (idempotence des webhooks Stripe : un event traité une seule fois)
  stripe_webhook_events: {
    columns: {
      event_id: 'TEXT PRIMARY KEY',
      type: 'TEXT',
      received_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    },
    indexes: []
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
 * Migration idempotente : colonnes Stripe pour l'idempotence des webhooks maintenance.
 * - projects.stripe_subscription_id : identifie l'abonnement Stripe ayant cree le projet
 * - revenues.stripe_invoice_id      : identifie la facture Stripe ayant cree le revenu
 * - index UNIQUE PARTIEL sur revenues(stripe_invoice_id) : empeche les doublons de revenus
 *   pour une meme facture Stripe, sans bloquer les revenus sans Stripe (NULL autorises en double).
 */
async function ensureStripeIdempotencyColumns(client) {
  console.log('\n🔧 Vérification colonnes Stripe (idempotence webhooks)...');
  await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;');
  await client.query('ALTER TABLE revenues ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT;');
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_revenues_stripe_invoice_id
    ON revenues(stripe_invoice_id)
    WHERE stripe_invoice_id IS NOT NULL;
  `);
  console.log('  ✓ Colonnes/index Stripe vérifiés');
}

/**
 * Migration idempotente : un rapport de maintenance peut etre lie a un contrat seul
 * (cree manuellement, sans projet). On relache le NOT NULL historique sur project_id.
 * DROP NOT NULL est idempotent (no-op si la colonne est deja nullable).
 */
/**
 * Seed des 6 modèles d'email par défaut (uniquement si la table est vide ;
 * ils restent éditables/supprimables ensuite).
 */
async function ensureEmailTemplatesSeed(client) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM email_templates');
  if (rows[0].n > 0) return;
  console.log('\n🔧 Seed des modèles d\'email par défaut...');
  const T = [
    ['Premier contact', 'contact', 'Un détail repéré sur {site}',
`{prenom},

En parcourant {site}, j'ai remarqué {constat} — rien de dramatique, mais le genre de détail qui peut faire fuir un visiteur (ou pénaliser votre référencement) sans qu'on s'en rende compte.

Développeur freelance spécialisé {plateforme}, c'est précisément le type de choses que je corrige au quotidien.

Si ça vous parle, je vous envoie le détail de ce que j'ai repéré et comment le régler. Un mot de votre part et c'est parti.`],
    ['Relance', 'relance', 'Re: Un détail repéré sur {site}',
`{prenom},

Je reviens vers vous au sujet de ce que j'avais repéré sur {site}.

Ce sont des points rapides à corriger, et qui vous font sûrement perdre quelques visiteurs au passage. Si vous voulez le détail, un simple « oui » suffit — je vous envoie tout.`],
    ['Clôture', 'cloture', 'Je n\'insiste pas',
`{prenom},

Sans retour, je ne vais pas vous encombrer davantage.

Si un jour vous avez besoin d'un développeur de confiance sur {plateforme} — bug, mise à jour, refonte, migration — gardez mon contact, ce sera avec plaisir.

Bonne continuation à {site} !`],
    ['Intéressé', 'interesse', 'Super, on en parle ?',
`{prenom},

Content que ça vous parle ! Pour bien cerner vos besoins sur {site}, le plus simple est un court échange de 15-20 min.

Dites-moi le créneau qui vous arrange, je m'adapte.

À très vite,`],
    ['PrestaShop', 'presta', 'Votre PrestaShop est-il à jour ?',
`{prenom},

Beaucoup de boutiques PrestaShop tournent encore sous 1.6 ou 1.7, des versions qui ne sont plus maintenues : failles de sécurité, modules qui cassent, incompatibilité PHP.

Développeur freelance spécialisé PrestaShop (jusqu'à la 8.x), je gère ces migrations sans perte de données ni de référencement.

Je peux vérifier où en est {site} et vous dire s'il y a un risque, sans engagement. Ça vous intéresse ?`],
    ['WooCommerce', 'woo', 'Vos extensions WooCommerce sont-elles à jour ?',
`{prenom},

Sur {site}, comme sur beaucoup de boutiques WooCommerce, ce sont souvent les extensions et WordPress laissés sans mises à jour qui posent problème : failles de sécurité, conflits, lenteurs.

Développeur freelance spécialisé WooCommerce, je m'occupe de la maintenance, de la sécurité et des performances de ce type de boutique.

Je peux regarder où en est {site} et vous faire un retour, sans engagement. Ça vous intéresse ?`]
  ];
  for (const [name, category, subject, body] of T) {
    await client.query(
      'INSERT INTO email_templates (name, category, subject, body) VALUES ($1, $2, $3, $4)',
      [name, category, subject, body]
    );
  }
  console.log('  ✓ 6 modèles d\'email seedés');
}

/**
 * Seed d'une signature par défaut (si aucune). Reprend company_settings.email_signature
 * si présente, et ajoute une ligne de désinscription.
 */
async function ensureEmailSignatureSeed(client) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM email_signatures');
  if (rows[0].n > 0) return;
  console.log('\n🔧 Seed signature email par défaut...');
  let base = '';
  try {
    const cs = await client.query('SELECT email_signature FROM company_settings LIMIT 1');
    base = (cs.rows[0] && cs.rows[0].email_signature) || '';
  } catch (e) { /* table absente : on ignore */ }
  const content = base || '<p style="margin:0;">Marc Gueffie — Pixfeed</p>';
  await client.query(
    'INSERT INTO email_signatures (name, content, is_default) VALUES ($1, $2, TRUE)',
    ['Signature par défaut', content]
  );
  console.log('  ✓ Signature par défaut seedée');
}

/**
 * Migration idempotente : retire l'ancienne ligne de désinscription (« ... STOP ... »)
 * des signatures déjà enregistrées.
 */
async function ensureSignatureUnsubRemoval(client) {
  try {
    await client.query(
      "UPDATE email_signatures SET content = regexp_replace(content, '<p[^>]*>[^<]*STOP[^<]*</p>', '', 'g') WHERE content ILIKE '%STOP%'"
    );
  } catch (e) {
    console.error('  ⚠️ Nettoyage ligne désinscription signatures:', e.message);
  }
}

async function ensureMaintenanceReportConstraints(client) {
  console.log('\n🔧 Vérification contraintes maintenance_reports...');
  await client.query('ALTER TABLE maintenance_reports ALTER COLUMN project_id DROP NOT NULL;');
  console.log('  ✓ project_id nullable (rapports de contrat sans projet)');
}

/**
 * Migration idempotente : colonnes de facturation Stripe SEPA sur maintenance_contracts.
 * - stripe_customer_id / stripe_subscription_id : liens Stripe
 * - billing_day : jour de prélèvement (1..28, borné côté service)
 * - billing_status : none/pending/active/past_due/canceled
 */
async function ensureMaintenanceBillingColumns(client) {
  console.log('\n🔧 Vérification colonnes facturation maintenance (Stripe SEPA)...');
  await client.query('ALTER TABLE maintenance_contracts ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);');
  await client.query('ALTER TABLE maintenance_contracts ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);');
  await client.query('ALTER TABLE maintenance_contracts ADD COLUMN IF NOT EXISTS billing_day INTEGER;');
  await client.query("ALTER TABLE maintenance_contracts ADD COLUMN IF NOT EXISTS billing_status VARCHAR(20) DEFAULT 'none';");
  await client.query('ALTER TABLE maintenance_contracts ADD COLUMN IF NOT EXISTS billing_cancel_at TIMESTAMP;');
  await client.query('ALTER TABLE maintenance_contracts ADD COLUMN IF NOT EXISTS billing_pay_token VARCHAR(64);');
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_maintenance_contracts_billing_pay_token ON maintenance_contracts(billing_pay_token);');
  console.log('  ✓ Colonnes facturation maintenance vérifiées');
}

/**
 * Migration idempotente : colonnes de facturation Stripe sur la table subscriptions
 * (abonnements libres). 'interval' réservé -> colonne billing_interval.
 */
async function ensureSubscriptionColumns(client) {
  console.log('\n🔧 Vérification colonnes abonnements (Stripe)...');
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS client_id INTEGER;');
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS label VARCHAR(255);');
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS amount_eur NUMERIC(10,2) DEFAULT 0;');
  await client.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(10) DEFAULT 'month';");
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS interval_count INTEGER DEFAULT 1;');
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);');
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);');
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_pay_token VARCHAR(64);');
  await client.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_status VARCHAR(20) DEFAULT 'none';");
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_cancel_at TIMESTAMP;');
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cond_intro TEXT;');
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cond_included TEXT;');
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cond_excluded TEXT;');
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cond_modalites TEXT;');
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_pay_token ON subscriptions(billing_pay_token);');
  console.log('  ✓ Colonnes abonnements vérifiées');
}

/**
 * Migration idempotente : table interactions (suivi des prises de contact, leads + clients).
 */
async function ensureInteractionsColumns(client) {
  console.log('\n🔧 Vérification colonnes interactions (suivi des contacts)...');
  await client.query("ALTER TABLE interactions ADD COLUMN IF NOT EXISTS contact_type VARCHAR(10) NOT NULL DEFAULT 'client';");
  await client.query('ALTER TABLE interactions ADD COLUMN IF NOT EXISTS contact_id INTEGER;');
  await client.query("ALTER TABLE interactions ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'note';");
  await client.query('ALTER TABLE interactions ADD COLUMN IF NOT EXISTS reached VARCHAR(20);');
  await client.query('ALTER TABLE interactions ADD COLUMN IF NOT EXISTS date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;');
  await client.query('ALTER TABLE interactions ADD COLUMN IF NOT EXISTS notes TEXT;');
  await client.query('ALTER TABLE interactions ADD COLUMN IF NOT EXISTS result TEXT;');
  await client.query('ALTER TABLE interactions ADD COLUMN IF NOT EXISTS relation_status VARCHAR(20);');
  await client.query('ALTER TABLE interactions ADD COLUMN IF NOT EXISTS next_followup_date DATE;');
  await client.query('ALTER TABLE interactions ADD COLUMN IF NOT EXISTS next_followup_channel VARCHAR(20);');
  await client.query('ALTER TABLE interactions ADD COLUMN IF NOT EXISTS followup_done BOOLEAN DEFAULT FALSE;');
  await client.query('CREATE INDEX IF NOT EXISTS idx_interactions_contact ON interactions(contact_type, contact_id);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_interactions_followup ON interactions(next_followup_date, followup_done);');
  // Statut de relation (suivi/prospection) sur les contacts : leads ET clients.
  await client.query("ALTER TABLE leads ADD COLUMN IF NOT EXISTS relation_status VARCHAR(20) DEFAULT 'nouveau';");
  await client.query("ALTER TABLE crm_clients ADD COLUMN IF NOT EXISTS relation_status VARCHAR(20) DEFAULT 'nouveau';");
  // Plateforme (techno du site) sur les contacts, pour le filtre plateforme du cockpit Suivi.
  await client.query('ALTER TABLE leads ADD COLUMN IF NOT EXISTS platform VARCHAR(50);');
  await client.query('ALTER TABLE crm_clients ADD COLUMN IF NOT EXISTS platform VARCHAR(50);');
  // Backfill plateforme des leads issus du Crawl (plateforme rangée dans les notes).
  await client.query("UPDATE leads SET platform = trim(substring(notes from 'Plateforme\\s*:\\s*([^\\n]+)')) WHERE platform IS NULL AND notes ~ 'Plateforme\\s*:';");
  console.log('  ✓ Colonnes interactions vérifiées');
}

/**
 * Migration idempotente : colonnes de récurrence de la table events.
 * La table events de base (pgMigrations) ne contient AUCUNE colonne de récurrence,
 * donc createRecurringEvent échouait silencieusement (aucun événement récurrent créé,
 * ex. import JSON avec "repeat"). On ajoute les colonnes attendues par le modèle, avec
 * les bons types (recurrence_days = chaîne "1,3,5", pas JSONB).
 */
async function ensureEventRecurrenceColumns(client) {
  console.log('[AutoInit] Vérification des colonnes de récurrence de events...');
  await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(20);');
  await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT 1;');
  await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_end_type VARCHAR(20);');
  await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_end_date TIMESTAMP;');
  await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_count INTEGER;');
  await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_days VARCHAR(50);');
  await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS parent_event_id INTEGER;');
  // Si recurrence_days a été créée en JSONB par un ancien schéma, la convertir en texte
  // (le modèle y stocke une chaîne de jours "1,3,5").
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'events' AND column_name = 'recurrence_days' AND data_type = 'jsonb'
      ) THEN
        ALTER TABLE events ALTER COLUMN recurrence_days TYPE VARCHAR(50) USING recurrence_days::text;
      END IF;
    END $$;
  `);
  // Colonnes d'exception sur events (occurrences modifiées d'une série).
  await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS is_exception BOOLEAN DEFAULT false;');
  await client.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS exception_date TIMESTAMP;');
  // Tables liées à la récurrence/au Gantt, requêtées au chargement du calendrier
  // (getEventExceptions) et par la timeline (dépendances) — absentes du schéma de base,
  // ce qui provoquait une 500 dès qu'un mois contenait un événement récurrent.
  await client.query(`
    CREATE TABLE IF NOT EXISTS event_exceptions (
      id SERIAL PRIMARY KEY,
      parent_event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      exception_date TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query('CREATE INDEX IF NOT EXISTS idx_event_exceptions_parent ON event_exceptions(parent_event_id);');
  await client.query(`
    CREATE TABLE IF NOT EXISTS event_dependencies (
      id SERIAL PRIMARY KEY,
      source_event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      target_event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      dependency_type VARCHAR(30) DEFAULT 'finish_to_start',
      lag_days INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query('CREATE INDEX IF NOT EXISTS idx_event_dependencies_source ON event_dependencies(source_event_id);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_event_dependencies_target ON event_dependencies(target_event_id);');
  console.log('  ✓ Colonnes de récurrence events vérifiées');
}

/**
 * Migration idempotente : colonnes "pilotage CA/MRR" sur subscriptions (additif, ne touche
 * jamais aux abonnements existants ni à leur facturation). + backfill date_fin pour les
 * abonnements déjà résiliés.
 */
async function ensureSubscriptionPilotageColumns(client) {
  console.log('[AutoInit] Vérification des colonnes pilotage de subscriptions...');
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS tier VARCHAR(50);');
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255);');
  await client.query('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS date_fin TIMESTAMP;');
  await client.query("ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS devise VARCHAR(3) DEFAULT 'EUR';");
  // Backfill date_fin pour les abonnements déjà résiliés (à partir de billing_cancel_at/updated_at).
  await client.query("UPDATE subscriptions SET date_fin = COALESCE(billing_cancel_at, updated_at) WHERE billing_status = 'canceled' AND date_fin IS NULL;");
  console.log('  ✓ Colonnes pilotage subscriptions vérifiées');
}

/**
 * Migration idempotente : table objectif_params (paramètres éditables du pilotage CA/MRR).
 * Une ligne par année. Aucune valeur en dur dans le code applicatif : tout vient d'ici.
 */
async function ensureObjectifParams(client) {
  console.log('[AutoInit] Vérification de la table objectif_params...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS objectif_params (
      id SERIAL PRIMARY KEY,
      annee INTEGER UNIQUE NOT NULL,
      cible_ca_eur NUMERIC(12,2) NOT NULL DEFAULT 100800,
      cible_mrr_eur NUMERIC(12,2) NOT NULL DEFAULT 8400,
      taux_urssaf NUMERIC(5,4) NOT NULL DEFAULT 0.26,
      taux_impot_provision NUMERIC(5,4) NOT NULL DEFAULT 0.06,
      plafond_micro NUMERIC(12,2) NOT NULL DEFAULT 77700,
      seuil_tva_base NUMERIC(12,2) NOT NULL DEFAULT 37500,
      seuil_tva_majore NUMERIC(12,2) NOT NULL DEFAULT 41250,
      ponctuel_prevu NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  // Seed de l'année 2027 si absente (valeurs par défaut = §10 de la spec).
  await client.query(`
    INSERT INTO objectif_params (annee)
    SELECT 2027
    WHERE NOT EXISTS (SELECT 1 FROM objectif_params WHERE annee = 2027);
  `);
  console.log('  ✓ Table objectif_params vérifiée');
}

/**
 * Migration idempotente : tables de l'agent "Veille missions" (annonces freelance).
 * veille_criteres : 1 ligne éditable (mots-clés, TJM, full remote, heure du run).
 * veille_annonces : annonces récupérées + qualifiées (dédup par jooble_uid).
 */
async function ensureVeilleTables(client) {
  console.log('[AutoInit] Vérification des tables veille missions...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS veille_criteres (
      id SERIAL PRIMARY KEY,
      mots_requis TEXT[] NOT NULL DEFAULT '{}',
      mots_exclus TEXT[] NOT NULL DEFAULT '{}',
      full_remote_only BOOLEAN NOT NULL DEFAULT true,
      tjm_min INTEGER NOT NULL DEFAULT 350,
      garder_sans_montant BOOLEAN NOT NULL DEFAULT true,
      profil_reference TEXT,
      heure_run TEXT NOT NULL DEFAULT '07:30',
      actif BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS veille_annonces (
      id SERIAL PRIMARY KEY,
      jooble_uid TEXT UNIQUE NOT NULL,
      titre TEXT,
      entreprise TEXT,
      source_label TEXT,
      lien TEXT,
      description TEXT,
      date_annonce DATE,
      full_remote BOOLEAN,
      montant TEXT,
      score INTEGER DEFAULT 0,
      score_label TEXT,
      raison TEXT,
      brouillon TEXT,
      statut TEXT DEFAULT 'nouveau',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.query('CREATE INDEX IF NOT EXISTS idx_veille_annonces_score ON veille_annonces(score DESC);');
  await client.query('CREATE INDEX IF NOT EXISTS idx_veille_annonces_statut ON veille_annonces(statut);');
  // Requêtes orientées "mission" envoyées aux sources (éditable). Distinct des mots_requis
  // (qui servent au pré-filtre/scoring). Idempotent.
  await client.query("ALTER TABLE veille_criteres ADD COLUMN IF NOT EXISTS requetes TEXT[] NOT NULL DEFAULT '{}';");
  // Seed des requêtes par défaut si la colonne est vide (orientées freelance/mission).
  await client.query(`
    UPDATE veille_criteres SET requetes = $1
    WHERE requetes IS NULL OR cardinality(requetes) = 0
  `, [[
    'freelance PHP', 'mission PHP', 'freelance WordPress', 'mission WordPress',
    'consultant WordPress', 'freelance PrestaShop', 'mission PrestaShop',
    'freelance React', 'mission Next.js', 'régie web', 'prestataire web freelance'
  ]]);
  // Seed de la ligne de critères si absente (valeurs initiales de la spec).
  const exists = await client.query('SELECT 1 FROM veille_criteres LIMIT 1');
  if (exists.rows.length === 0) {
    await client.query(
      `INSERT INTO veille_criteres (mots_requis, mots_exclus, full_remote_only, tjm_min, garder_sans_montant, profil_reference, heure_run, actif)
       VALUES ($1, $2, true, 350, true, $3, '07:30', true)`,
      [
        ['wordpress', 'woocommerce', 'prestashop', 'next.js', 'php', 'développeur web freelance', 'intégrateur web', 'développeur full-stack'],
        ['alternance', 'apprentissage', 'stage', 'stagiaire', 'CDI', 'CDD', 'intérim', 'régie', 'sur site', 'présentiel', 'on-site', 'offshore', 'junior', 'débutant', 'bénévole', 'non rémunéré', 'data scientist', 'mobile', 'iOS', 'Android', 'embarqué', 'salarié'],
        'Développeur freelance spécialisé WordPress, WooCommerce, PrestaShop, Next.js et PHP. Full remote uniquement. Cherche du VRAI freelance (pas de CDI déguisé). TJM plancher 350€/jour.'
      ]
    );
  }
  console.log('  ✓ Tables veille missions vérifiées');
}

/**
 * Migration idempotente : marque is_nocode=TRUE sur les résultats de crawl DÉJÀ en base
 * qui correspondent à une plateforme no-code (mêmes patterns que l'ingestion).
 */
async function ensureCrawlNoCodeBackfill(client) {
  const { allPatterns } = require('../utils/nocodePlatforms');
  const likeArr = allPatterns().map((p) => `%${p}%`);
  try {
    const r = await client.query(
      `UPDATE crawl_results SET is_nocode = TRUE
       WHERE COALESCE(is_nocode, FALSE) = FALSE
         AND lower(concat_ws(' ', platform, signals, final_url, title, domain)) LIKE ANY($1)`,
      [likeArr]
    );
    if (r.rowCount) console.log(`  ✓ Crawl no-code: ${r.rowCount} résultat(s) existant(s) marqué(s)`);
  } catch (e) {
    console.error('[AutoInit] Backfill no-code crawl:', e.message);
  }
}

/**
 * Migration idempotente : met à jour le titre dans les signatures email DÉJÀ enregistrées
 * (company_settings.email_signature) — l'ancien HTML figé n'est pas régénéré sinon.
 * 'Chargé de Projet' (et la variante 'web') -> 'Fondateur & développeur'.
 */
async function ensureSignatureTitleUpdate(client) {
  console.log('\n🔧 Mise à jour du titre dans les signatures email enregistrées...');
  const replacements = [
    ['Chargé de Projet · ', 'Fondateur &amp; développeur - '],
    ['Chargé de Projet', 'Fondateur &amp; développeur'],
    ['Fondateur &amp; développeur web · ', 'Fondateur &amp; développeur - '],
    ['Fondateur &amp; développeur web', 'Fondateur &amp; développeur']
  ];
  for (const [from, to] of replacements) {
    await client.query(
      'UPDATE company_settings SET email_signature = REPLACE(email_signature, $1, $2) WHERE email_signature LIKE $3',
      [from, to, `%${from}%`]
    );
  }
  console.log('  ✓ Signatures email mises à jour');
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

    // Colonnes/index Stripe pour l'idempotence des webhooks (après création des tables)
    await ensureStripeIdempotencyColumns(client);

    // project_id nullable sur maintenance_reports (rapports de contrat sans projet)
    await ensureMaintenanceReportConstraints(client);

    // Colonnes de facturation Stripe SEPA sur maintenance_contracts
    await ensureMaintenanceBillingColumns(client);

    // Colonnes de facturation Stripe sur subscriptions (abonnements libres)
    await ensureSubscriptionColumns(client);

    // Table interactions (suivi des prises de contact, leads + clients)
    await ensureInteractionsColumns(client);

    await ensureEventRecurrenceColumns(client);

    await ensureSubscriptionPilotageColumns(client);

    await ensureObjectifParams(client);

    await ensureVeilleTables(client);

    await ensureCrawlNoCodeBackfill(client);
    // Mise à jour du titre dans les signatures email déjà enregistrées
    await ensureSignatureTitleUpdate(client);

    // Seeds emails (modèles + signature par défaut) — seulement si vides
    await ensureEmailTemplatesSeed(client);
    await ensureEmailSignatureSeed(client);
    await ensureSignatureUnsubRemoval(client);

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
