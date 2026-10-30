-- Tables de l'agent du configurateur (à déclarer dans DATABASE_SCHEMA de scripts/autoInitDatabase.js, idempotent)

CREATE TABLE IF NOT EXISTS cfg_selections (
  id          SERIAL PRIMARY KEY,
  version     TEXT NOT NULL,
  contenu     JSONB NOT NULL,                       -- la sélection complète (format data/selection.json)
  statut      TEXT NOT NULL DEFAULT 'validee',      -- validee | remplacee
  validee_le  TIMESTAMPTZ,
  validee_par TEXT,
  cree_le     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cfg_mesures (
  id        SERIAL PRIMARY KEY,
  source    TEXT NOT NULL,                          -- blender-open-data
  contenu   JSONB NOT NULL,                         -- { releve_le, blender_version, CPU:[…], OPTIX:[…], HIP:[…], ONEAPI:[…] }
  releve_le TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cfg_offres (               -- historique des prix relevés (repère les prix anormaux, sert aux bilans)
  id        BIGSERIAL PRIMARY KEY,
  releve_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  composant TEXT NOT NULL,
  rang      INT NOT NULL,                           -- 0 = modèle retenu, 1+ = réserves
  marchand  TEXT NOT NULL,
  produit   TEXT,
  ean       TEXT,
  prix      NUMERIC(10,2),
  en_stock  BOOLEAN,
  lien      TEXT,
  source    TEXT
);
CREATE INDEX IF NOT EXISTS cfg_offres_composant_date ON cfg_offres (composant, releve_le DESC);

CREATE TABLE IF NOT EXISTS cfg_publications (
  id        SERIAL PRIMARY KEY,
  publie_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  statut    TEXT NOT NULL,                          -- publiee | bloquee | echec_ecriture
  erreurs   JSONB,
  taille_ko INT,
  resume    JSONB,
  version   TEXT,                                   -- identifiant écrit aussi dans le fichier (version_publication)
  contenu   JSONB                                   -- le fichier exact, gardé pour les 30 dernières publications (restauration)
);
ALTER TABLE cfg_publications ADD COLUMN IF NOT EXISTS version TEXT;
ALTER TABLE cfg_publications ADD COLUMN IF NOT EXISTS contenu JSONB;

CREATE TABLE IF NOT EXISTS cfg_propositions (
  id         SERIAL PRIMARY KEY,
  cree_le    TIMESTAMPTZ NOT NULL DEFAULT now(),
  contenu    JSONB NOT NULL,                        -- { resume, changements:[{ type, id, detail, raison, sources }] }
  statut     TEXT NOT NULL DEFAULT 'en_attente',    -- en_attente | traitee
  decisions  JSONB,
  traitee_le TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cfg_taches (                -- suivi des tâches (planifiées, manuelles, validations)
  id       SERIAL PRIMARY KEY,
  nom      TEXT NOT NULL,                           -- nuit | lundi | mois | valider | validerTelleQuelle
  origine  TEXT NOT NULL DEFAULT 'manuel',          -- planifiee | manuel | reconciliation
  statut   TEXT NOT NULL,                           -- en_cours | terminee | echouee | refusee | interrompue
  debut    TIMESTAMPTZ NOT NULL DEFAULT now(),
  fin      TIMESTAMPTZ,
  resultat JSONB,
  erreur   TEXT
);
CREATE INDEX IF NOT EXISTS cfg_taches_statut ON cfg_taches (statut);

-- Purge de l'historique des prix au-delà de 13 mois (à lancer chaque mois, ou par la tâche mensuelle)
-- DELETE FROM cfg_offres WHERE releve_le < now() - interval '13 months';
