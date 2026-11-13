# mcp_seo — Serveur MCP SEO (connecteur lecture seule pour Claude)

Expose les données SEO du CRM à Claude (Desktop / Code / scripts MCP) pour faire du **maillage
sémantique** dans les conversations, **sans copier-coller**. Service **autonome** (hors process
CRM), **lecture seule stricte**, limité aux tables SEO.

## Outils MCP (lecture seule, sauf les deux outils d'écriture ciblés du netlinking)
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
| `get_keyword_volume` | `q`, `country?`, `language?` | API Bing WMT (impressions 3 mois d'un mot-clé — calibrer la demande) |
| `get_related_keywords` | `q`, `country?`, `language?`, `limit?` | API Bing WMT (variantes + volumes, triées par volume) |
| `get_backlink_counts` | `site_url`, `limit?` | API Bing WMT (nb de backlinks externes par page du site) |
| `get_page_backlinks` | `site_url`, `url`, `limit?` | API Bing WMT (les URLs sources qui pointent vers une page) |

### Netlinking (campagnes de backlinks)
| Outil | Arguments | Fait |
|-------|-----------|------|
| `list_link_campaigns` | — | campagnes + compteurs (cibles, contactées, liens, rel vérifiés, dofollow possibles, concurrents), `jours_depuis_decouverte`, `a_travailler` |
| `get_link_targets` | `campaign_id`, `statut?`, `limit?`, `inclure_concurrents?` | cibles : score + `score_criteres` (< 3 = partiel), plateforme + règle appliquée, `dofollow` + emplacements vérifiés (rel, URL), porte d'entrée, concurrent/probable + motif. Concurrents exclus par défaut |
| `get_link_outreach_status` | `campaign_id` | envois, ouvertures, relances dues |
| `list_link_platform_rules` | — | règles de rel par plateforme (Forumactif, Invision, FluxBB, Shaarli, commentaires WordPress) |
| `record_link_rel` **(écriture)** | `campaign_id`, `domain`, `emplacement`, `rel`, `url?`, `note?` | enregistre une lecture du rel par emplacement, recalcule le dofollow de la cible |
| `update_link_target` **(écriture)** | `campaign_id`, `domain`, `porte_type?`, `porte_url?`, `porte_note?`, `concurrent?`, `concurrent_motif?`, `notes?` | porte d'entrée, marquage concurrent, notes. Ni statut, ni envoi |

Les deux outils d'écriture existent pour capitaliser le travail de vérification fait en
session (le rel lu dans le DOM, la porte de contact trouvée) au lieu de le refaire à chaque
campagne. Ils reposent sur des droits PostgreSQL ciblés (INSERT/UPDATE sur la table des
emplacements, UPDATE sur huit colonnes de `seo_link_targets`), accordés par le backend au
démarrage. Le reste de la base reste en lecture seule.

Les deux outils Bing nécessitent `BING_WMT_API_KEY` dans le `.env` (clé gratuite :
bing.com/webmasters → Paramètres → API access). Cache en mémoire 24h — le rôle SQL
du connecteur reste strictement lecture seule.

Aucun SQL ne vient de Claude : uniquement des **requêtes paramétrées prédéfinies**. Seuls
`record_link_rel` et `update_link_target` écrivent, sur un périmètre fixé par les droits
PostgreSQL (voir ci-dessus). La table `seo_oauth_tokens` (secrets) n'est **jamais** accessible.

## Sécurité
- **Bearer statique** (`MCP_SEO_TOKEN`, ≥ 40 car. aléatoires) en variable d'environnement,
  comparaison **timing-safe**. Sans token valide → **401**.
- **Rate limiting** par IP (`MCP_SEO_RATE_MAX`/min) → **429** au-delà. **Logs** d'accès
  (`access.log` : horodatage, IP, outil, statut).
- Écoute **127.0.0.1** uniquement ; **TLS** assuré par nginx en façade (jamais de HTTP clair).
- Connexion base via un **rôle PostgreSQL dédié** (`mcp_seo_ro`, cf. `setup.sql`) : SELECT
  partout, écriture limitée aux emplacements de rel et à huit colonnes de `seo_link_targets` :
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

## Lecture en direct : `get_live_page(site_id, url)`

Lit une page **au moment de l'appel**, en lecture seule, et renvoie un JSON compact où chaque
bloc indique sa source :

- `wordpress` (API REST, `context=edit`) : id, type (articles, pages, CPT), statut, slug, lien,
  titre, dates, catégories, étiquettes et autres taxonomies, image à la une, et `yoast`
  (phrase-clé, titre SEO, méta, noindex lus via le snippet `register_rest_field` du
  `functions.php`, voir `seo_worker/README.md`, plus le titre, la canonique et les robots
  calculés par Yoast) ;
- `contenu` : contenu brut (shortcodes compris) structuré : titres H1-H4, paragraphes, liens
  (interne/externe, rel), images (alt, légende, dimensions), shortcodes employés, nombre de mots ;
- `page_publique` : demandée avec un paramètre unique `crm_live=…` pour passer le cache :
  code HTTP, redirections, title, méta, canonique, robots, X-Robots-Tag, H1, bloc
  « Articles similaires » (détecté par son titre, sinon par une classe `related`/`similaire`) ;
  `cache.servi_par_le_cache` signale si un cache a quand même répondu ;
- `liens_entrants` : contenus publiés dont le contenu brut pointe vers la page, avec les ancres
  (menus, widgets, blocs du thème et shortcodes non couverts : la sortie le dit).

Une source en échec est signalée dans son bloc (`erreur` : source, code, message).

**Accès** : un utilisateur WordPress dédié (rôle Éditeur) et son mot de passe d'application,
dans `backend/.env`, par site (le numéro est le `site_id` du CRM) :

```
WP_API_USER_2=…       WP_API_PASSWORD_2=…      # jurojin.net
WP_API_USER_15=…      WP_API_PASSWORD_15=…     # pixfeed.net
```

Seules ces clés sont lues dans `backend/.env` ; elles ne sortent jamais (ni réponse, ni journal),
et ne sont envoyées qu'à l'adresse WordPress du site (`seo_sites.wp_base_url`, sinon le domaine).
Une adresse d'un autre domaine que le site est refusée.

Essai hors MCP, depuis `mcp_seo/` : `node scripts/tester-live.js 2 https://jurojin.net/… 15 https://pixfeed.net/…`
(résumé + taille en Ko ; sortie complète dans `/tmp/live-N.json`). Tests : `node --test test/live.test.js`.

## Étape 2 : `get_page_dossier`, `check_urls`, `get_site_resources`

Mêmes conventions que `get_live_page` : `fetched_at` en tête, source et date dans chaque bloc,
champs vides retirés, listes `{ total, affiches, items }`, erreurs `{ source, code, message }`
dans le bloc concerné.

- `get_page_dossier(site_id, url, days=90)` (`dossier.js`) : ce que le CRM sait d'une page.
  Réutilise sans les modifier `get_position_context`, `get_page_keywords`, `get_cannibalisation`,
  `get_focus_keyword_conflicts`, `get_page_links`, `check_sitemap`, `get_redirects`, `list_sites`,
  `get_page_content` et `bing.getKeywordVolume`. Requêtes propres : inspection d'UNE URL
  (`gsc_index_status`), backlinks d'UNE page avec ancre et rel (`seo_backlinks` + `seo_ref_domains`),
  bornes de dates Search Console.
- `check_urls(site_id, urls)` (`checks.js`) : 50 adresses au maximum, 8 s par adresse,
  5 en parallèle, User-Agent `SEO-LinkCheck/1.0` (ne nomme ni le CRM ni un domaine). Internes :
  id et type lus dans les classes du `<body>`, statut par l'API REST.
- `get_site_resources(site_id)` (`ressources.js`) : catégories, étiquettes, glossaire (API REST) ;
  shortcodes et icônes de `[spec]` par la route de lecture `outils-site/v1/ressources`
  (`wordpress/ressources-site.php`, réservée aux utilisateurs qui peuvent modifier des contenus,
  nom neutre car la liste des routes de `/wp-json/` est publique).

Scripts (depuis `mcp_seo/`) :
- `bash scripts/bascule-editeur.sh <site_id> <dossier> <domaine> <identifiant> <url…>` : accès API
  basculé sur un Éditeur dédié, sorties `get_live_page` comparées avant/après, mots de passe
  « CRM lecture » de l'ancien compte révoqués seulement si tout est identique.
- `node scripts/reparer-wp-auth.js <site_id> <dossier>` : pose ou met à jour
  `mu-plugins/identification-api.php` (filtre limité aux chemins `/wp-json/` servis par l'index.php
  du site).
- `node scripts/installer-ressources.js <site_id> <dossier>` : pose ou met à jour la route de lecture,
  vérifie 401 sans identification et 200 avec.
- `node scripts/essais-etape2.js` : essais réels des trois outils, tailles en Ko.

Tests : `MCP_PGTEST=postgres://postgres@127.0.0.1:55432 node --test test/outils.test.js`
(base jetable au schéma réel, fausse instance WordPress).

## Étape 3 : `demander_depot` + `prepare_draft` (brouillons WordPress)

Claude prépare un dossier (`manifeste-wp.json`, contenu en blocs Gutenberg, fichiers), puis :
1. `demander_depot(site_id)` : lien d'envoi à usage unique (30 min, jeton jamais stocké en clair)
   et commande prête (zip + curl, ou PowerShell) ;
2. il envoie le zip au lien (`POST /api/wp-depot/<jeton>`, champ `lot`, ou `fichiers` séparés) :
   dossier dédié sur le serveur (`backend/uploads/wp-depots/<id>/`), chemins confinés, « .. »,
   absolus et liens symboliques refusés, 300 fichiers et 1 Go au plus ;
3. `prepare_draft(depot, simulation=true, creer_etiquettes=false)` : le serveur MCP passe par le
   backend (`/api/wp-brouillon/*`, secret partagé `OUTILS_MCP_SECRET` de `backend/.env`), seul à
   écrire dans WordPress, avec l'utilisateur dédié. Jamais publié.

Côté WordPress : `wordpress/redaction-site.php` (mu-plugin, `node scripts/installer-mu.js <site_id>
<dossier> redaction-site.php`) : vérification d'un contenu (blocs enregistrés, shortcodes,
intégrations, images), médias par empreinte SHA-256 (`outils_sha256`), inventaire (blocs,
compositions, types, taxonomies, auteurs, fichiers acceptés, limite d'envoi), champ `outils_yoast`
en écriture (liste fermée, `edit_post`), copie de travail pour les mises à jour (Rewrite &
Republish de Yoast Duplicate Post s'il est là, sinon copie + bouton « Remplacer l'original » ;
le nouveau slug est appliqué à la validation, WordPress garde l'ancien en `_wp_old_slug`).

Netlinking multi-site (jurojin.net) : `envoyer_mail_outreach`, `verifier_deja_contacte`, `lister_outreach`,
`marquer_reponse`, `ajouter_cibles`. Ils appellent les MÊMES routes que l'onglet SEO (`/api/seo/outreach/*`,
secret partagé) : toutes les règles sont dans le CRM (un destinataire, pas de champ de fusion, domaine jamais
contacté tous sites confondus — ancien envoi Gmail compris —, relances encadrées dans le même fil, oppositions,
plafond quotidien et délai aléatoire par site). Expéditeur et signature du site réglés dans `backend/.env` et
`backend/config/signatures/`, aucun suivi de clic ni lien vers le CRM dans les mails. Simulation par défaut.
`envoyer_mail_outreach` accepte un `domaine` seul à la place de `target_id` : la fiche du domaine (forme courte)
est reprise si elle est déjà dans une niche du site, sinon créée à l'envoi réel dans la niche « Hors campagne »
du site, ou dans la campagne `niche_nom` si elle est donnée (créée si besoin ; rien n'est créé en simulation ni si
le serveur de mail refuse ; une fiche existante n'est pas déplacée). `list_link_campaigns(site_id?)` donne le site
de chaque campagne et filtre par site. `ajouter_cibles`
accepte `niche_nom` : niche du site reprise par son nom (casse et espaces ignorés), sinon créée à l'écriture,
y compris quand `niche_id` n'existe pas.
Anti-doublon sur le domaine complet, sous-domaine compris (`blog.exemple.fr` ≠ `exemple.fr`, chaque forum
`*.forumactif.com` est un site à part) ; seul `www.` est ignoré. Le domaine est gardé tel que saisi. Un autre
sous-domaine du même domaine racine déjà contacté est signalé (`avertissements`, `meme_racine`), sans bloquer ;
la même adresse reste bloquante. `dofollow` ne passe à vrai que si le rel transmis le prouve (`dofollow`,
`follow`, `noopener`…, « aucun »), à faux avec nofollow / ugc / sponsored, et reste vide sinon (« à vérifier »,
« ? ») ; `record_link_rel` refuse un rel non concluant.

Titre SEO, méta, phrase clé et titre WordPress : `modifier_seo(site_id, url | id, titre_seo?, meta_description?,
phrase_cle?, titre?, simulation=true)`. Tous les types qui exposent le champ `outils_yoast` du mu-plugin de
rédaction (pages, articles, portfolio, guides… ; `get_site_resources` l'indique par type : `yoast_api`), y
compris les pages construites par un modèle du thème, au contenu vide. Lit l'état (titre, champs Yoast,
`yoast_head_json`, page publique hors cache : title, meta description, og:title), limites 60 / 135, écrit
seulement `title` et `outils_yoast`, vérifie que content.raw (sha256), slug, statut et date de publication
n'ont pas bougé, puis relit l'affichage (le mu-plugin reconstruit l'indexable Yoast après l'écriture).
Essai réel sans toucher aux vraies pages : `node scripts/essai-modifier-seo.js 15` (simulation sur /decouvrir/)
et `--brouillon` (écriture sur une page brouillon d'essai, mise ensuite à la corbeille).

Mise à jour par remplacements : `get_contenu_brut(site_id, url | id)` lit la page telle que WordPress la
stocke (title.raw, excerpt.raw, content.raw au caractère près, nombre de blocs, codes courts, sha256 ;
morceaux `debut` / `longueur` pour les longs contenus). Puis, en `mise_a_jour`, le manifeste donne
`"base_sha256"` et `"remplacements": [{ "avant", "apres", "occurrences" }]` au lieu de `contenu` : le CRM part
du content.raw actuel, refuse si l'empreinte a changé, si un « avant » n'apparaît pas exactement le nombre de
fois annoncé, ou si les blocs ou un code court à fermeture se déséquilibrent ; la simulation montre un
extrait avant / après de chaque remplacement. Essai réel : `node scripts/essai-mise-a-jour.js <site_id> <url>`
(dans `backend/`, remplacement neutre ; `--ecrire` crée la copie de travail, `--nettoyer <id>` la supprime).

Plateformes « Où regarder » (films, séries, animes) : champ `outils_plateformes`, qui écrit ensemble
les cases `serie_plateforme` et les adresses lues par le thème (`_film_liens_plateformes`,
`_serie_liens_plateformes`, `_anime_liens_plateformes`, rangées par numéro de case ; clés surchargeables
par le filtre `outils_plateformes_cles`). Dans le manifeste : `"plateformes": { "Disney+": "https://…" }`
remplace toute la liste, `{}` décoche tout. Contrôles : nom = case existante (rien n'est créé), adresse
http(s) qui répond (404 / 410 / injoignable bloquent ; une plateforme qui refuse les robots est
signalée), pas de réglage parallèle par `taxonomies`. La simulation montre avant / après.

Auteur des articles : réglage par site dans le CRM (`seo_sites.wp_auteur`), jamais le compte API.
Journal : `seo_wp_journal` (date, site, contenu, fichiers, avant / après). Un second appel sur le
même manifeste reprend le même brouillon (clé site + type + mode + slug ou adresse d'origine).

Essais réels : `node scripts/essais-brouillon.js` (dans `backend/`), puis `--nettoyer`.
Tests : `TEST_DATABASE_URL=… node --test tests/wpBrouillon.test.js` (backend).
