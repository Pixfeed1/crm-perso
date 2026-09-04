-- mcp_seo/setup.sql
-- Rôle PostgreSQL DÉDIÉ au serveur MCP : SELECT uniquement, sur les SEULES tables SEO.
-- Ceinture + bretelles : même si le service avait un bug, la base refuse toute écriture
-- et tout accès aux tables métier (clients/factures/devis/leads) ou aux secrets OAuth.
-- À exécuter UNE FOIS sur serveur2 en tant que superuser :  psql -U postgres -d jurojinn_mcrm -f setup.sql
-- (remplacer le mot de passe ci-dessous par une valeur forte, puis la reporter dans .env)

CREATE ROLE mcp_seo_ro LOGIN PASSWORD 'CHANGER_CE_MOT_DE_PASSE_FORT';

GRANT CONNECT ON DATABASE jurojinn_mcrm TO mcp_seo_ro;
GRANT USAGE ON SCHEMA public TO mcp_seo_ro;

-- SELECT uniquement, et UNIQUEMENT sur ces tables SEO (PAS seo_oauth_tokens : secrets).
GRANT SELECT ON
  seo_sites,
  seo_pages,
  seo_links,
  seo_gsc_daily,
  seo_metrics_monthly,
  seo_onpage_issues,
  seo_audit,
  seo_tracked_keywords,
  seo_similar_pages,
  gsc_index_status,
  gsc_index_history,
  seo_sitemap_urls,
  seo_redirects,
  seo_pagespeed
TO mcp_seo_ro;

-- Module Backlinks (campagnes de netlinking) + tracking d'ouvertures des emails.
-- À exécuter avec l'utilisateur applicatif APRÈS le premier démarrage du backend
-- (les tables sont créées par autoInitDatabase) :
--   GRANT SELECT ON seo_niches, seo_link_targets, seo_link_outreach, email_tracking TO mcp_seo_ro;
--
-- Indexation Google (URL Inspection). Ces tables sont créées par autoInitDatabase :
-- sur une installation DÉJÀ en service, le GRANT ci-dessus a déjà été joué sans elles.
-- Rejouer alors cette ligne une fois, sinon les rapports d'indexation renvoient
-- « permission denied » :
--   GRANT SELECT ON gsc_index_status, gsc_index_history, seo_sitemap_urls, seo_redirects TO mcp_seo_ro;
-- Core Web Vitals (job pagespeed), meme cas : table creee par autoInitDatabase apres coup.
--   GRANT SELECT ON seo_pagespeed TO mcp_seo_ro;

-- Aucun autre droit : ce rôle ne voit RIEN d'autre (ni écriture, ni autres tables).
-- Vérification rapide après coup :
--   SET ROLE mcp_seo_ro;
--   SELECT count(*) FROM seo_pages;            -- OK
--   SELECT count(*) FROM crm_clients;          -- doit échouer (permission denied)
--   SELECT count(*) FROM seo_oauth_tokens;     -- doit échouer (permission denied)
--   INSERT INTO seo_pages(site_id,url) VALUES (1,'x');  -- doit échouer (permission denied)
--   RESET ROLE;
