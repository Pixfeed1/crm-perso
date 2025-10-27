// Migration pour ajouter payment_details, cgv_type et cgv_pdf aux devis et factures
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
    console.log('🚀 Début de la migration : Ajout payment_details et cgv_pdf\n');

    await client.query('BEGIN');

    // 1. Ajouter les nouvelles colonnes à la table quotes
    console.log('1. Ajout de nouvelles colonnes à quotes...');

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
        { name: 'payment_details', type: "JSONB DEFAULT '{}'", description: 'Détails des moyens de paiement (IBAN, PayPal, etc.)' },
        { name: 'cgv_type', type: "VARCHAR(10) DEFAULT 'text'", description: 'Type de CGV : text ou pdf' },
        { name: 'cgv_pdf', type: 'TEXT', description: 'Chemin du fichier PDF CGV' },
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

      console.log('✅ Colonnes ajoutées à quotes\n');
    } else {
      console.log('⚠️  Table quotes n\'existe pas encore, colonnes non ajoutées\n');
    }

    // 2. Ajouter les nouvelles colonnes à la table invoices
    console.log('2. Ajout de nouvelles colonnes à invoices...');

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
        { name: 'payment_details', type: "JSONB DEFAULT '{}'", description: 'Détails des moyens de paiement (IBAN, PayPal, etc.)' },
        { name: 'cgv_type', type: "VARCHAR(10) DEFAULT 'text'", description: 'Type de CGV : text ou pdf' },
        { name: 'cgv_pdf', type: 'TEXT', description: 'Chemin du fichier PDF CGV' },
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
