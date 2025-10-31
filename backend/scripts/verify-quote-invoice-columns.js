// Script de vérification des colonnes payment_details, cgv_type, cgv_pdf
// dans les tables quotes et invoices

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

async function verifyColumns() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'crm_db',
  });

  const client = await pool.connect();

  try {
    console.log('🔍 Vérification des colonnes payment_details, cgv_type, cgv_pdf\n');

    // Vérifier les tables quotes et invoices
    const tables = ['quotes', 'invoices'];
    const columnsToCheck = ['payment_details', 'cgv_type', 'cgv_pdf'];

    for (const tableName of tables) {
      console.log(`\n📋 Table: ${tableName}`);
      console.log('─'.repeat(60));

      // Vérifier si la table existe
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `, [tableName]);

      if (!tableExists.rows[0].exists) {
        console.log(`  ❌ La table ${tableName} n'existe pas`);
        continue;
      }

      console.log(`  ✓ La table ${tableName} existe`);

      // Vérifier chaque colonne
      for (const columnName of columnsToCheck) {
        const columnInfo = await client.query(`
          SELECT
            column_name,
            data_type,
            column_default,
            is_nullable
          FROM information_schema.columns
          WHERE table_name = $1
          AND column_name = $2;
        `, [tableName, columnName]);

        if (columnInfo.rows.length === 0) {
          console.log(`  ❌ Colonne ${columnName} : MANQUANTE`);
        } else {
          const col = columnInfo.rows[0];
          console.log(`  ✓ Colonne ${columnName} :`);
          console.log(`      Type: ${col.data_type}`);
          console.log(`      Default: ${col.column_default || 'NULL'}`);
          console.log(`      Nullable: ${col.is_nullable}`);
        }
      }

      // Vérifier le nombre d'enregistrements dans la table
      const countResult = await client.query(`SELECT COUNT(*) FROM ${tableName};`);
      console.log(`\n  📊 Nombre d'enregistrements: ${countResult.rows[0].count}`);

      // Si des enregistrements existent, vérifier un échantillon
      if (parseInt(countResult.rows[0].count) > 0) {
        const sample = await client.query(`
          SELECT
            id,
            payment_details,
            cgv_type,
            cgv_pdf
          FROM ${tableName}
          LIMIT 1;
        `);

        if (sample.rows.length > 0) {
          const record = sample.rows[0];
          console.log(`\n  📄 Échantillon (ID ${record.id}):`);
          console.log(`      payment_details: ${JSON.stringify(record.payment_details)}`);
          console.log(`      cgv_type: ${record.cgv_type || 'NULL'}`);
          console.log(`      cgv_pdf: ${record.cgv_pdf || 'NULL'}`);
        }
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Vérification terminée\n');

  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Exécution
verifyColumns()
  .then(() => {
    console.log('✅ Script terminé avec succès');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Échec du script:', error);
    process.exit(1);
  });
