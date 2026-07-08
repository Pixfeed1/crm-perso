# mcp_seo — Serveur MCP SEO (connecteur lecture seule pour Claude)

Expose les données SEO du CRM à Claude (Desktop / Code / scripts MCP) pour faire du **maillage
sémantique** dans les conversations, **sans copier-coller**. Service **autonome** (hors process
CRM), **lecture seule stricte**, limité aux tables SEO.

## Outils MCP (tous LECTURE SEULE)
| Outil | Arguments | Lit |
|-------|-----------|-----|
| `get_opportunities` | `site_id`, `min_impressions?` (défaut 20) | `seo_pages` + `seo_gsc_daily` (potentiel sous-exploité + suggestions de liens) |
| `get_page_content` | `site_id`, `url` | `seo_pages` + `seo_onpage_issues` (titre, meta, catégorie, focus keyword, word_count, **extrait de texte**) |
| `list_link_targets` | `site_id`, `category?` | `seo_pages` (CPT de contenu : glossaire, guide, anime, film, logiciel, serie, acteur, post, page) — titre, url, slug |
| `get_page_keywords` | `site_id`, `url`, `days?` (défaut 28) | `seo_gsc_daily` (requêtes : position, impressions, clics, CTR) |
| `get_site_overview` | `site_id` | `seo_pages` + `seo_links` (santé, maillage, GSC 28j, quasi-victoires) |
| `get_audit` | `site_id` | `seo_audit` + `seo_onpage_issues` (sitemap + compteurs de problèmes on-page) |
| `get_cannibalisation` | `site_id`, `days?`, `min_impressions?` | `seo_gsc_daily` (requêtes disputées par plusieurs pages) |
| `get_ctr_anomalies` | `site_id`, `days?`, `min_impressions?` | `seo_gsc_daily` + `seo_onpage_issues` (CTR sous l'attendu -> titles/metas à réécrire) |
| `get_page_links` | `site_id`, `url` | `seo_links` + `seo_pages` (liens entrants/sortants d'une page, avec ancres) |
| `list_sites` | — | `seo_sites` + `seo_pages` (site_id, domaine, volumétrie — à appeler en premier) |
| `search_pages` | `site_id`, `q`, `limit?` | `seo_pages` (recherche par sujet sur URL/titre/focus keyword/tags + métriques) |

Aucun SQL ne vient de Claude : uniquement des **SELECT paramétrés prédéfinis**. Aucun outil
n'écrit/modifie/supprime. La table `seo_oauth_tokens` (secrets) n'est **jamais** accessible.

## Sécurité
- **Bearer statique** (`MCP_SEO_TOKEN`, ≥ 40 car. aléatoires) en variable d'environnement,
  comparaison **timing-safe**. Sans token valide → **401**.
- **Rate limiting** par IP (`MCP_SEO_RATE_MAX`/min) → **429** au-delà. **Logs** d'accès
  (`access.log` : horodatage, IP, outil, statut).
- Écoute **127.0.0.1** uniquement ; **TLS** assuré par nginx en façade (jamais de HTTP clair).
- Connexion base via un **rôle PostgreSQL dédié SELECT-only** (`mcp_seo_ro`, cf. `setup.sql`) :
  double barrière (app + base). `statement_timeout` 15 s.

## Installation (serveur2)
```bash
# 1) Rôle SELECT-only (superuser), puis reporter le mot de passe dans .env
sudo -u postgres psql -d jurojinn_mcrm -f setup.sql

# 2) Dépendances + configuration
cd /home/jurojinn/crm.pixfeed.net/mcp_seo
npm install
cp .env.example .env
# éditer .env :  MCP_SEO_TOKEN=$(openssl rand -hex 32)  + MCP_DB_PASSWORD=...

# 3) Service systemd
sudo cp crm-mcp-seo.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now crm-mcp-seo
sudo journalctl -u crm-mcp-seo -f

# 4) Reverse proxy HTTPS
sudo certbot --nginx -d mcp-seo.crm.pixfeed.net   # puis adapter nginx-mcp-seo.conf.example
```

## Test rapide
```bash
# Santé
curl https://mcp-seo.crm.pixfeed.net/health
# Liste des outils (doit renvoyer les 4 ; 401 sans le bon token)
curl -s https://mcp-seo.crm.pixfeed.net/mcp \
  -H "Authorization: Bearer $MCP_SEO_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Connexion côté Claude
- **Claude Desktop** : le fichier de config (`claude_desktop_config.json`) n'injecte pas de
  header `Authorization` statique vers un serveur HTTP distant. On passe par le pont
  `mcp-remote` (qui ajoute le header et parle Streamable HTTP au serveur) :
  ```json
  {
    "mcpServers": {
      "crm-seo": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://mcp-seo.crm.pixfeed.net/mcp",
                 "--header", "Authorization: Bearer TON_TOKEN"]
      }
    }
  }
  ```
  (Node/npx requis sur la machine où tourne Claude Desktop. Redémarrer Claude Desktop après.)
- **Claude Code** : `claude mcp add --transport http crm-seo https://mcp-seo.crm.pixfeed.net/mcp
  --header "Authorization: Bearer TON_TOKEN"` (le CLI gère le header directement).
- **Claude.ai web (connecteur)** : le connecteur web privilégie OAuth ; le Bearer statique
  cible d'abord Desktop/Code/scripts. Si tu veux le brancher dans le web, on ajoutera un
  petit wrapper OAuth (non inclus dans cette V1, conforme au choix B1).

## Notes
- `get_page_content` renvoie l'**extrait** stocké par le worker au crawl
  (`seo_onpage_issues.data.excerpt`, ~2000 car.). Nécessite **un crawl** après déploiement
  pour être peuplé.
- Aucune donnée Ahrefs (volume/difficulté/CPC/trafic) : indisponible, non exposée.
