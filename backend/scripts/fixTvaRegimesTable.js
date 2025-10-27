// Script de correction pour la table tva_regimes
// Ce script ajoute les colonnes manquantes à la table tva_regimes

const { Pool } = require('pg');

async function fixTvaRegimesTable() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'crm_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password'
  });

  const client = await pool.connect();

  try {
    console.log('\n=== CORRECTION TABLE tva_regimes ===\n');

    await client.query('BEGIN');

    // Liste des colonnes à ajouter si elles n'existent pas
    const columnsToAdd = [
      { name: 'category', definition: "VARCHAR(50) NOT NULL DEFAULT 'taux_normal'" },
      { name: 'article_cgi', definition: 'TEXT' },
      { name: 'description', definition: 'TEXT' },
      { name: 'mention_legale', definition: 'TEXT' },
      { name: 'calcul_type', definition: "VARCHAR(20) DEFAULT 'normal'" },
      { name: 'ordre', definition: 'INTEGER DEFAULT 0' },
      { name: 'active', definition: 'BOOLEAN DEFAULT true' },
      { name: 'created_at', definition: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
    ];

    for (const column of columnsToAdd) {
      // Vérifier si la colonne existe
      const columnExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name = 'tva_regimes'
          AND column_name = $1
        );
      `, [column.name]);

      if (!columnExists.rows[0].exists) {
        console.log(`  → Ajout colonne "${column.name}"...`);
        await client.query(`ALTER TABLE tva_regimes ADD COLUMN ${column.name} ${column.definition};`);
        console.log(`  ✓ Colonne "${column.name}" ajoutée`);
      } else {
        console.log(`  ✓ Colonne "${column.name}" existe déjà`);
      }
    }

    // Créer les index s'ils n'existent pas
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_tva_regimes_category ON tva_regimes(category)',
      'CREATE INDEX IF NOT EXISTS idx_tva_regimes_active ON tva_regimes(active)',
      'CREATE INDEX IF NOT EXISTS idx_tva_regimes_ordre ON tva_regimes(ordre)'
    ];

    console.log('\n  → Création des index...');
    for (const indexQuery of indexes) {
      await client.query(indexQuery);
    }
    console.log('  ✓ Index créés');

    // Insérer ou mettre à jour les régimes de TVA
    const regimes = [
      {
        code: 'NORMAL',
        label: 'TVA normale à 20%',
        category: 'taux_normal',
        taux: 20.00,
        article_cgi: 'Article 278 du CGI',
        description: 'Taux normal de TVA applicable à la plupart des biens et services',
        calcul_type: 'normal',
        ordre: 1
      },
      {
        code: 'INTERMEDIAIRE',
        label: 'TVA intermédiaire à 10%',
        category: 'taux_reduit',
        taux: 10.00,
        article_cgi: 'Article 278 bis du CGI',
        description: 'Restauration, travaux de rénovation, transport de voyageurs, etc.',
        calcul_type: 'normal',
        ordre: 2
      },
      {
        code: 'REDUIT',
        label: 'TVA réduite à 5,5%',
        category: 'taux_reduit',
        taux: 5.50,
        article_cgi: 'Article 278-0 bis du CGI',
        description: 'Produits alimentaires, abonnements gaz/électricité, livres, etc.',
        calcul_type: 'normal',
        ordre: 3
      },
      {
        code: 'SUPER_REDUIT',
        label: 'TVA super réduite à 2,1%',
        category: 'taux_reduit',
        taux: 2.10,
        article_cgi: 'Article 281 quater du CGI',
        description: 'Médicaments remboursables, publications de presse, certains spectacles',
        calcul_type: 'normal',
        ordre: 4
      },
      {
        code: 'NON_APPLICABLE_293B',
        label: 'TVA non applicable, art. 293 B du CGI',
        category: 'non_application',
        taux: 0.00,
        article_cgi: 'Article 293 B du CGI',
        description: 'Franchise en base de TVA (micro-entreprise, CA < seuils)',
        mention_legale: 'TVA non applicable, art. 293 B du CGI',
        calcul_type: 'non_applicable',
        ordre: 10
      }
    ];

    console.log('\n  → Insertion/mise à jour des régimes de TVA...');
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
          ordre = EXCLUDED.ordre
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

    await client.query('COMMIT');

    console.log('\n✅ Table tva_regimes corrigée avec succès\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Erreur lors de la correction:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  fixTvaRegimesTable()
    .then(() => {
      console.log('Script terminé avec succès');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script échoué:', error);
      process.exit(1);
    });
}

module.exports = { fixTvaRegimesTable };
