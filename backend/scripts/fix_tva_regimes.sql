-- Script SQL de correction pour la table tva_regimes
-- Exécuter avec: psql -U postgres -d crm_db -f fix_tva_regimes.sql

-- Ajouter les colonnes manquantes si elles n'existent pas
DO $$
BEGIN
  -- Colonne category
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tva_regimes' AND column_name='category') THEN
    ALTER TABLE tva_regimes ADD COLUMN category VARCHAR(50) DEFAULT 'taux_normal';
    UPDATE tva_regimes SET category = 'taux_normal' WHERE category IS NULL;
    ALTER TABLE tva_regimes ALTER COLUMN category SET NOT NULL;
    RAISE NOTICE 'Colonne category ajoutée';
  END IF;

  -- Colonne article_cgi
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tva_regimes' AND column_name='article_cgi') THEN
    ALTER TABLE tva_regimes ADD COLUMN article_cgi TEXT;
    RAISE NOTICE 'Colonne article_cgi ajoutée';
  END IF;

  -- Colonne description
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tva_regimes' AND column_name='description') THEN
    ALTER TABLE tva_regimes ADD COLUMN description TEXT;
    RAISE NOTICE 'Colonne description ajoutée';
  END IF;

  -- Colonne mention_legale
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tva_regimes' AND column_name='mention_legale') THEN
    ALTER TABLE tva_regimes ADD COLUMN mention_legale TEXT;
    RAISE NOTICE 'Colonne mention_legale ajoutée';
  END IF;

  -- Colonne calcul_type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tva_regimes' AND column_name='calcul_type') THEN
    ALTER TABLE tva_regimes ADD COLUMN calcul_type VARCHAR(20) DEFAULT 'normal';
    RAISE NOTICE 'Colonne calcul_type ajoutée';
  END IF;

  -- Colonne ordre
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tva_regimes' AND column_name='ordre') THEN
    ALTER TABLE tva_regimes ADD COLUMN ordre INTEGER DEFAULT 0;
    RAISE NOTICE 'Colonne ordre ajoutée';
  END IF;

  -- Colonne active
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tva_regimes' AND column_name='active') THEN
    ALTER TABLE tva_regimes ADD COLUMN active BOOLEAN DEFAULT true;
    UPDATE tva_regimes SET active = true WHERE active IS NULL;
    RAISE NOTICE 'Colonne active ajoutée';
  END IF;

  -- Colonne created_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tva_regimes' AND column_name='created_at') THEN
    ALTER TABLE tva_regimes ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    RAISE NOTICE 'Colonne created_at ajoutée';
  END IF;
END $$;

-- Créer les index
CREATE INDEX IF NOT EXISTS idx_tva_regimes_category ON tva_regimes(category);
CREATE INDEX IF NOT EXISTS idx_tva_regimes_active ON tva_regimes(active);
CREATE INDEX IF NOT EXISTS idx_tva_regimes_ordre ON tva_regimes(ordre);

-- Insérer ou mettre à jour les régimes de TVA standards
INSERT INTO tva_regimes (code, label, category, taux, article_cgi, description, mention_legale, calcul_type, ordre, active)
VALUES
  ('NORMAL', 'TVA normale à 20%', 'taux_normal', 20.00, 'Article 278 du CGI', 'Taux normal de TVA applicable à la plupart des biens et services', NULL, 'normal', 1, true),
  ('INTERMEDIAIRE', 'TVA intermédiaire à 10%', 'taux_reduit', 10.00, 'Article 278 bis du CGI', 'Restauration, travaux de rénovation, transport de voyageurs, etc.', NULL, 'normal', 2, true),
  ('REDUIT', 'TVA réduite à 5,5%', 'taux_reduit', 5.50, 'Article 278-0 bis du CGI', 'Produits alimentaires, abonnements gaz/électricité, livres, etc.', NULL, 'normal', 3, true),
  ('SUPER_REDUIT', 'TVA super réduite à 2,1%', 'taux_reduit', 2.10, 'Article 281 quater du CGI', 'Médicaments remboursables, publications de presse, certains spectacles', NULL, 'normal', 4, true),
  ('NON_APPLICABLE_293B', 'TVA non applicable, art. 293 B du CGI', 'non_application', 0.00, 'Article 293 B du CGI', 'Franchise en base de TVA (micro-entreprise, CA < seuils)', 'TVA non applicable, art. 293 B du CGI', 'non_applicable', 10, true)
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

-- Afficher le résultat
SELECT code, label, category, taux, active FROM tva_regimes ORDER BY ordre;
