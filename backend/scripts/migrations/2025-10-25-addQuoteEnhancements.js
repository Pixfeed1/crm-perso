// Migration pour enrichir les fonctionnalités des devis et factures
const { Pool } = require('pg');

async function runMigration() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'crm_db',
  });

  const client = await pool.connect();

  try {
    console.log('🚀 Début de la migration : Enrichissement devis/factures\n');

    await client.query('BEGIN');

    // Vérifier si la table crm_clients existe
    const clientsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'crm_clients'
      );
    `);

    if (!clientsTableExists.rows[0].exists) {
      console.log('⚠️  La table crm_clients n\'existe pas encore. Migration reportée.');
      await client.query('ROLLBACK');
      return;
    }

    console.log('✓ Table crm_clients trouvée');

    // 1. Créer la table projects si elle n'existe pas
    console.log('1. Création de la table projects...');

    // Vérifier si la table existe déjà
    const projectsTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'projects'
      );
    `);

    if (!projectsTableExists.rows[0].exists) {
      await client.query(`
        CREATE TABLE projects (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          client_id INTEGER,
          status VARCHAR(50) DEFAULT 'active',
          start_date DATE,
          end_date DATE,
          budget NUMERIC DEFAULT 0,
          color VARCHAR(20) DEFAULT '#6366F1',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL
        );
      `);
      console.log('  ✓ Table projects créée');
    } else {
      console.log('  ✓ Table projects existe déjà');

      // Vérifier si la colonne client_id existe, sinon l'ajouter
      const clientIdExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'projects'
          AND column_name = 'client_id'
        );
      `);

      if (!clientIdExists.rows[0].exists) {
        console.log('  → Ajout de la colonne client_id...');
        await client.query(`ALTER TABLE projects ADD COLUMN client_id INTEGER;`);
        await client.query(`
          ALTER TABLE projects
          ADD CONSTRAINT fk_projects_client
          FOREIGN KEY (client_id) REFERENCES crm_clients(id) ON DELETE SET NULL;
        `);
        console.log('  ✓ Colonne client_id ajoutée');
      }
    }

    // Créer les index seulement s'ils n'existent pas
    await client.query(`CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);`);
    console.log('✅ Table projects prête\n');

    // 2. Créer la table tva_regimes
    console.log('2. Création de la table tva_regimes...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tva_regimes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        label TEXT NOT NULL,
        rate DECIMAL(5,2) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insérer les régimes TVA standards français
    await client.query(`
      INSERT INTO tva_regimes (code, label, rate, description) VALUES
        ('NORMAL', 'Taux normal', 20.00, 'Taux de TVA standard en France'),
        ('INTERMEDIAIRE', 'Taux intermédiaire', 10.00, 'Travaux, restauration, transport de voyageurs'),
        ('REDUIT', 'Taux réduit', 5.50, 'Produits de première nécessité, livres, etc.'),
        ('SUPER_REDUIT', 'Taux super réduit', 2.10, 'Médicaments remboursables, presse'),
        ('CORSE', 'Taux Corse', 13.00, 'Taux particulier pour la Corse'),
        ('DOM', 'Taux DOM', 8.50, 'Taux particulier pour les DOM'),
        ('EXONERE', 'Exonéré', 0.00, 'TVA non applicable')
      ON CONFLICT (code) DO NOTHING;
    `);
    console.log('✅ Table tva_regimes créée et données insérées\n');

    // 3. Créer la table payment_methods
    console.log('3. Création de la table payment_methods...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insérer les moyens de paiement standards
    await client.query(`
      INSERT INTO payment_methods (code, label, description) VALUES
        ('VIREMENT', 'Virement bancaire', 'Paiement par virement bancaire'),
        ('CHEQUE', 'Chèque', 'Paiement par chèque'),
        ('CARTE', 'Carte bancaire', 'Paiement par carte bancaire'),
        ('ESPECES', 'Espèces', 'Paiement en espèces'),
        ('PRELEVEMENT', 'Prélèvement automatique', 'Prélèvement SEPA'),
        ('PAYPAL', 'PayPal', 'Paiement via PayPal'),
        ('STRIPE', 'Stripe', 'Paiement via Stripe'),
        ('TRAITE', 'Lettre de change / Traite', 'Paiement par traite'),
        ('AUTRE', 'Autre', 'Autre moyen de paiement')
      ON CONFLICT (code) DO NOTHING;
    `);
    console.log('✅ Table payment_methods créée et données insérées\n');

    // 4. Ajouter les nouvelles colonnes à la table quotes
    console.log('4. Ajout de nouvelles colonnes à quotes...');

    // Vérifier si la table quotes existe
    const quotesTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'quotes'
      );
    `);

    if (quotesTableExists.rows[0].exists) {
      const quoteColumns = [
        { name: 'title', type: 'TEXT', description: 'Titre du devis' },
        { name: 'project_id', type: 'INTEGER', description: 'Projet associé' },
        { name: 'discount_type', type: "VARCHAR(10) DEFAULT 'none'", description: 'Type de remise' },
        { name: 'discount_value', type: 'DECIMAL(10,2) DEFAULT 0', description: 'Valeur de la remise' },
        { name: 'discount_amount', type: 'NUMERIC DEFAULT 0', description: 'Montant de la remise' },
        { name: 'payment_methods', type: "JSONB DEFAULT '[]'", description: 'Moyens de paiement acceptés' },
        { name: 'tva_regime', type: "VARCHAR(50) DEFAULT 'NORMAL'", description: 'Régime de TVA' },
        { name: 'additional_info', type: 'TEXT', description: 'Informations complémentaires' },
        { name: 'additional_files', type: "JSONB DEFAULT '[]'", description: 'Fichiers joints' },
        { name: 'signed_at', type: 'TIMESTAMP', description: 'Date de signature' },
        { name: 'signed_by', type: 'TEXT', description: 'Signataire' },
        { name: 'signature_data', type: 'TEXT', description: 'Données de signature (base64)' },
      ];

      for (const col of quoteColumns) {
        try {
          // Vérifier si la colonne existe déjà
          const columnExists = await client.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.columns
              WHERE table_name = 'quotes'
              AND column_name = $1
            );
          `, [col.name]);

          if (!columnExists.rows[0].exists) {
            await client.query(`ALTER TABLE quotes ADD COLUMN ${col.name} ${col.type};`);
            console.log(`  ✓ Colonne ${col.name} ajoutée (${col.description})`);
          } else {
            console.log(`  ⚠ Colonne ${col.name} existe déjà`);
          }
        } catch (err) {
          console.log(`  ⚠ Erreur avec colonne ${col.name}:`, err.message);
        }
      }

      // Ajouter la foreign key pour project_id si elle n'existe pas
      try {
        const fkExists = await client.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_quotes_project'
            AND table_name = 'quotes'
          );
        `);

        if (!fkExists.rows[0].exists) {
          await client.query(`
            ALTER TABLE quotes
            ADD CONSTRAINT fk_quotes_project
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
          `);
          console.log('  ✓ Foreign key project_id ajoutée');
        } else {
          console.log('  ⚠ Foreign key project_id existe déjà');
        }
      } catch (err) {
        console.log('  ⚠ Erreur foreign key project_id:', err.message);
      }

      // Créer les index
      await client.query(`CREATE INDEX IF NOT EXISTS idx_quotes_project_id ON quotes(project_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_quotes_tva_regime ON quotes(tva_regime);`);
      console.log('✅ Colonnes ajoutées à quotes\n');
    } else {
      console.log('⚠️  Table quotes n\'existe pas encore, colonnes non ajoutées\n');
    }

    // 5. Ajouter les nouvelles colonnes à la table invoices
    console.log('5. Ajout de nouvelles colonnes à invoices...');

    // Vérifier si la table invoices existe
    const invoicesTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'invoices'
      );
    `);

    if (invoicesTableExists.rows[0].exists) {
      const invoiceColumns = [
        { name: 'title', type: 'TEXT', description: 'Titre de la facture' },
        { name: 'project_id', type: 'INTEGER', description: 'Projet associé' },
        { name: 'discount_type', type: "VARCHAR(10) DEFAULT 'none'", description: 'Type de remise' },
        { name: 'discount_value', type: 'DECIMAL(10,2) DEFAULT 0', description: 'Valeur de la remise' },
        { name: 'discount_amount', type: 'NUMERIC DEFAULT 0', description: 'Montant de la remise' },
        { name: 'payment_methods', type: "JSONB DEFAULT '[]'", description: 'Moyens de paiement acceptés' },
        { name: 'tva_regime', type: "VARCHAR(50) DEFAULT 'NORMAL'", description: 'Régime de TVA' },
        { name: 'additional_info', type: 'TEXT', description: 'Informations complémentaires' },
        { name: 'additional_files', type: "JSONB DEFAULT '[]'", description: 'Fichiers joints' },
      ];

      for (const col of invoiceColumns) {
        try {
          // Vérifier si la colonne existe déjà
          const columnExists = await client.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.columns
              WHERE table_name = 'invoices'
              AND column_name = $1
            );
          `, [col.name]);

          if (!columnExists.rows[0].exists) {
            await client.query(`ALTER TABLE invoices ADD COLUMN ${col.name} ${col.type};`);
            console.log(`  ✓ Colonne ${col.name} ajoutée (${col.description})`);
          } else {
            console.log(`  ⚠ Colonne ${col.name} existe déjà`);
          }
        } catch (err) {
          console.log(`  ⚠ Erreur avec colonne ${col.name}:`, err.message);
        }
      }

      // Ajouter la foreign key pour project_id si elle n'existe pas
      try {
        const fkExists = await client.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'fk_invoices_project'
            AND table_name = 'invoices'
          );
        `);

        if (!fkExists.rows[0].exists) {
          await client.query(`
            ALTER TABLE invoices
            ADD CONSTRAINT fk_invoices_project
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
          `);
          console.log('  ✓ Foreign key project_id ajoutée');
        } else {
          console.log('  ⚠ Foreign key project_id existe déjà');
        }
      } catch (err) {
        console.log('  ⚠ Erreur foreign key project_id:', err.message);
      }

      // Créer les index
      await client.query(`CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON invoices(project_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_invoices_tva_regime ON invoices(tva_regime);`);
      console.log('✅ Colonnes ajoutées à invoices\n');
    } else {
      console.log('⚠️  Table invoices n\'existe pas encore, colonnes non ajoutées\n');
    }

    await client.query('COMMIT');
    console.log('✅ Migration terminée avec succès !');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur lors de la migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Exécution si appelé directement
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

  runMigration()
    .then(() => {
      console.log('\n✅ Migration exécutée avec succès');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Échec de la migration:', error);
      process.exit(1);
    });
}

module.exports = { runMigration };
