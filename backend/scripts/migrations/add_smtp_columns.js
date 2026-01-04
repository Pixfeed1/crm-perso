#!/usr/bin/env node
/**
 * Migration: Ajout des colonnes SMTP à company_settings
 * Usage: node backend/scripts/migrations/add_smtp_columns.js
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'jurojinn_mcrm',
  user: process.env.DB_USER || 'jurojinn',
  password: process.env.DB_PASSWORD || ''
});

async function migrate() {
  console.log('🚀 Migration: Ajout colonnes SMTP à company_settings...\n');

  const columns = [
    { name: 'smtp_host', type: 'VARCHAR(255)' },
    { name: 'smtp_port', type: 'INTEGER DEFAULT 587' },
    { name: 'smtp_secure', type: 'BOOLEAN DEFAULT false' },
    { name: 'smtp_user', type: 'VARCHAR(255)' },
    { name: 'smtp_pass', type: 'VARCHAR(255)' },
    { name: 'smtp_from_email', type: 'VARCHAR(255)' },
    { name: 'smtp_from_name', type: 'VARCHAR(255)' }
  ];

  try {
    for (const col of columns) {
      const query = `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`;
      await pool.query(query);
      console.log(`✅ Colonne ${col.name} ajoutée`);
    }

    console.log('\n✅ Migration terminée avec succès !');

    // Afficher la structure actuelle
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'company_settings'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Structure de company_settings :');
    result.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });

  } catch (error) {
    console.error('❌ Erreur de migration:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
