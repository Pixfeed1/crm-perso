/**
 * Migration pour ajouter tous les régimes de TVA légaux français
 * Conforme au Code Général des Impôts (CGI) et directives européennes
 */

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
    console.log('🚀 Début de la migration : Régimes de TVA complets\n');

    await client.query('BEGIN');

    // 1. Créer la table des régimes de TVA
    console.log('1. Création de la table tva_regimes...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS tva_regimes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        label TEXT NOT NULL,
        category VARCHAR(50) NOT NULL,
        taux DECIMAL(5,2),
        article_cgi TEXT,
        description TEXT,
        mention_legale TEXT,
        calcul_type VARCHAR(20) DEFAULT 'normal',
        ordre INTEGER DEFAULT 0,
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✓ Table tva_regimes créée\n');

    // 2. Vider la table si elle existe déjà
    await client.query('DELETE FROM tva_regimes;');

    // 3. Insérer tous les régimes de TVA
    console.log('2. Insertion des régimes de TVA...\n');

    const regimes = [
      // ========================================================================
      // TAUX NORMAL ET RÉDUITS STANDARDS
      // ========================================================================
      {
        code: 'NORMAL',
        label: 'TVA normale à 20%',
        category: 'taux_normal',
        taux: 20.00,
        article_cgi: 'Article 278 du CGI',
        description: 'Taux normal de TVA applicable à la plupart des biens et services',
        mention_legale: null,
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
        mention_legale: null,
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
        mention_legale: null,
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
        mention_legale: null,
        calcul_type: 'normal',
        ordre: 4
      },

      // ========================================================================
      // NON-APPLICATION DE LA TVA
      // ========================================================================
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
      },
      {
        code: 'NON_APPLICABLE_261C',
        label: 'TVA non applicable, art. 261 C du CGI',
        category: 'non_application',
        taux: 0.00,
        article_cgi: 'Article 261 C du CGI',
        description: 'Opérations bancaires et financières',
        mention_legale: 'TVA non applicable, art. 261 C du CGI',
        calcul_type: 'non_applicable',
        ordre: 11
      },
      {
        code: 'NON_APPLICABLE_261_4_1',
        label: 'TVA non applicable selon l\'article 261-4-1° du CGI',
        category: 'non_application',
        taux: 0.00,
        article_cgi: 'Article 261-4-1° du CGI',
        description: 'Exportations hors UE',
        mention_legale: 'TVA non applicable selon l\'article 261-4-1° du Code Général des Impôts',
        calcul_type: 'non_applicable',
        ordre: 12
      },
      {
        code: 'NON_APPLICABLE_261_4_4',
        label: 'TVA non applicable selon l\'article 261-4-4° du CGI',
        category: 'non_application',
        taux: 0.00,
        article_cgi: 'Article 261-4-4° du CGI',
        description: 'Opérations hors champ d\'application de la TVA',
        mention_legale: 'TVA non applicable selon l\'article 261-4-4° du Code Général des Impôts',
        calcul_type: 'non_applicable',
        ordre: 13
      },

      // ========================================================================
      // EXONÉRATION DE TVA
      // ========================================================================
      {
        code: 'EXONERATION_262',
        label: 'Exonération de TVA, article 262 du CGI',
        category: 'exoneration',
        taux: 0.00,
        article_cgi: 'Article 262 du CGI',
        description: 'Exportations de biens',
        mention_legale: 'Exonération de TVA, article 262 du CGI',
        calcul_type: 'exonere',
        ordre: 20
      },
      {
        code: 'EXONERATION_294',
        label: 'Exonération de TVA, article 294 du CGI',
        category: 'exoneration',
        taux: 0.00,
        article_cgi: 'Article 294 du CGI',
        description: 'Régimes particuliers et exonérations diverses',
        mention_legale: 'Exonération de TVA, article 294 du CGI',
        calcul_type: 'exonere',
        ordre: 21
      },
      {
        code: 'EXONERATION_262TER',
        label: 'Exonération de TVA, article 262 ter, I du CGI',
        category: 'exoneration',
        taux: 0.00,
        article_cgi: 'Article 262 ter, I du CGI',
        description: 'Livraisons intracommunautaires de biens (LIC)',
        mention_legale: 'Exonération de TVA, article 262 ter, I du CGI',
        calcul_type: 'exonere',
        ordre: 22
      },
      {
        code: 'EXONERATION_283_2',
        label: 'Exonération de TVA, article 283-2 du CGI',
        category: 'exoneration',
        taux: 0.00,
        article_cgi: 'Article 283-2 du CGI',
        description: 'Prestations de services intracommunautaires',
        mention_legale: 'Exonération de TVA, article 283-2 du CGI',
        calcul_type: 'exonere',
        ordre: 23
      },
      {
        code: 'EXONERATION_259B',
        label: 'Exonération de TVA en application de l\'art. 259B du CGI, TVA due par le preneur',
        category: 'exoneration',
        taux: 0.00,
        article_cgi: 'Article 259B du CGI',
        description: 'Services fournis par un assujetti établi hors de France, TVA due par le preneur',
        mention_legale: 'Exonération de TVA en application de l\'art. 259B du CGI, TVA due par le preneur',
        calcul_type: 'autoliquidation',
        ordre: 24
      },
      {
        code: 'EXONERATION_DIR_44',
        label: 'Exonération de TVA, article 44 de la directive 2006/112/CE',
        category: 'exoneration',
        taux: 0.00,
        article_cgi: 'Article 44 de la directive 2006/112/CE',
        description: 'Services B2B intracommunautaires (directive européenne)',
        mention_legale: 'Exonération de TVA, article 44 de la directive 2006/112/CE',
        calcul_type: 'autoliquidation',
        ordre: 25
      },

      // ========================================================================
      // AUTOLIQUIDATION DE TVA
      // ========================================================================
      {
        code: 'AUTOLIQUIDATION_283_2_NONIES',
        label: 'Autoliquidation de TVA - article 283-2 nonies du CGI',
        category: 'autoliquidation',
        taux: null,
        article_cgi: 'Article 283-2 nonies du CGI',
        description: 'Sous-traitance dans le BTP (TVA due par le preneur)',
        mention_legale: 'Autoliquidation de TVA - article 283-2 nonies du CGI',
        calcul_type: 'autoliquidation',
        ordre: 30
      },
      {
        code: 'AUTOLIQUIDATION_283_2_DIR_2008',
        label: 'Autoliquidation par le preneur (Art. 283-2 du CGI et Art. 44 de la directive 2008/8)',
        category: 'autoliquidation',
        taux: null,
        article_cgi: 'Art. 283-2 du CGI et Art. 44 de la directive 2008/8/CE',
        description: 'Services B2B (TVA due par le preneur assujetti)',
        mention_legale: 'Autoliquidation par le preneur (Art. 283-2 du CGI et Art. 44 de la directive 2008/8)',
        calcul_type: 'autoliquidation',
        ordre: 31
      },
      {
        code: 'AUTOLIQUIDATION_DIR_44_196',
        label: 'Autoliquidation par le preneur (Art. 44 et Art. 196 de la directive 2006/112/CE)',
        category: 'autoliquidation',
        taux: null,
        article_cgi: 'Art. 44 et Art. 196 de la directive 2006/112/CE',
        description: 'Prestations de services B2B intracommunautaires',
        mention_legale: 'Autoliquidation par le preneur (Art. 44 et Art. 196 de la directive 2006/112/CE)',
        calcul_type: 'autoliquidation',
        ordre: 32
      },
      {
        code: 'AUTOLIQUIDATION_242_NONIES_A',
        label: 'TVA due par le preneur assujetti ; autoliquidation en application de l\'article 242 nonies A, I-13° de l\'annexe II du CGI',
        category: 'autoliquidation',
        taux: null,
        article_cgi: 'Article 242 nonies A, I-13° de l\'annexe II du CGI',
        description: 'Livraisons de déchets neufs d\'industrie et matières de récupération',
        mention_legale: 'TVA due par le preneur assujetti ; autoliquidation en application de l\'article 242 nonies A, I-13° de l\'annexe II du CGI',
        calcul_type: 'autoliquidation',
        ordre: 33
      },

      // ========================================================================
      // TAUX RÉDUITS SPÉCIFIQUES
      // ========================================================================
      {
        code: 'REDUIT_279I',
        label: 'Taux de TVA réduit, article 279-i du CGI',
        category: 'taux_reduit_specifique',
        taux: 10.00,
        article_cgi: 'Article 279-i du CGI',
        description: 'Travaux d\'amélioration, de transformation, d\'aménagement et d\'entretien dans des logements achevés depuis plus de 2 ans',
        mention_legale: 'Taux de TVA réduit, article 279-i du CGI',
        calcul_type: 'normal',
        ordre: 40
      },
      {
        code: 'REDUIT_279_0_BIS',
        label: 'Taux de TVA réduit, article 279-0 bis du CGI',
        category: 'taux_reduit_specifique',
        taux: 5.50,
        article_cgi: 'Article 279-0 bis du CGI',
        description: 'Produits et services spécifiques (alimentation, énergie, équipements pour handicapés, etc.)',
        mention_legale: 'Taux de TVA réduit, article 279-0 bis du CGI',
        calcul_type: 'normal',
        ordre: 41
      },

      // ========================================================================
      // RÉGIMES PARTICULIERS (Article 297 A du CGI)
      // ========================================================================
      {
        code: 'REGIME_BIENS_OCCASION',
        label: 'Régime particulier - Biens d\'occasion',
        category: 'regime_particulier',
        taux: 20.00,
        article_cgi: 'Article 297 A du CGI et directive 2006/112/CE',
        description: 'TVA sur marge pour biens d\'occasion, œuvres d\'art, objets de collection ou d\'antiquité',
        mention_legale: 'Régime particulier - Biens d\'occasion (Art. 297 A du CGI)',
        calcul_type: 'marge',
        ordre: 50
      },
      {
        code: 'REGIME_OBJETS_ART',
        label: 'Régime particulier - Objets d\'art',
        category: 'regime_particulier',
        taux: 20.00,
        article_cgi: 'Article 297 A du CGI et directive 2006/112/CE',
        description: 'TVA sur marge pour objets d\'art',
        mention_legale: 'Régime particulier - Objets d\'art (Art. 297 A du CGI)',
        calcul_type: 'marge',
        ordre: 51
      },
      {
        code: 'REGIME_COLLECTION_ANTIQUITE',
        label: 'Régime particulier - Objets de collection ou d\'antiquité',
        category: 'regime_particulier',
        taux: 20.00,
        article_cgi: 'Article 297 A du CGI et directive 2006/112/CE',
        description: 'TVA sur marge pour objets de collection ou d\'antiquité',
        mention_legale: 'Régime particulier - Objets de collection ou d\'antiquité (Art. 297 A du CGI)',
        calcul_type: 'marge',
        ordre: 52
      },
      {
        code: 'REGIME_AGENCES_VOYAGE',
        label: 'Régime particulier - Agences de voyage',
        category: 'regime_particulier',
        taux: 20.00,
        article_cgi: 'Article 306 du CGI et directive 2006/112/CE',
        description: 'TVA sur marge pour agences de voyages (calcul sur commission/marge)',
        mention_legale: 'Régime particulier - Agences de voyage (Art. 306 du CGI)',
        calcul_type: 'marge',
        ordre: 53
      }
    ];

    // Insérer tous les régimes
    for (const regime of regimes) {
      await client.query(`
        INSERT INTO tva_regimes (
          code, label, category, taux, article_cgi, description,
          mention_legale, calcul_type, ordre, active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (code) DO UPDATE SET
          label = EXCLUDED.label,
          category = EXCLUDED.category,
          taux = EXCLUDED.taux,
          article_cgi = EXCLUDED.article_cgi,
          description = EXCLUDED.description,
          mention_legale = EXCLUDED.mention_legale,
          calcul_type = EXCLUDED.calcul_type,
          ordre = EXCLUDED.ordre,
          active = EXCLUDED.active;
      `, [
        regime.code,
        regime.label,
        regime.category,
        regime.taux,
        regime.article_cgi,
        regime.description,
        regime.mention_legale,
        regime.calcul_type,
        regime.ordre,
        regime.active !== false
      ]);

      console.log(`  ✓ ${regime.label}`);
    }

    console.log(`\n✓ ${regimes.length} régimes de TVA insérés\n`);

    // 4. Créer des index pour les performances
    console.log('3. Création des index...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tva_regimes_category ON tva_regimes(category);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tva_regimes_active ON tva_regimes(active);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_tva_regimes_ordre ON tva_regimes(ordre);');
    console.log('✓ Index créés\n');

    await client.query('COMMIT');

    console.log('═'.repeat(60));
    console.log('✅ Migration terminée avec succès');
    console.log(`✅ ${regimes.length} régimes de TVA disponibles`);
    console.log('═'.repeat(60));

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur lors de la migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Exécution de la migration
if (require.main === module) {
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

module.exports = runMigration;
