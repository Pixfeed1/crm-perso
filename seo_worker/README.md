# seo_worker — Worker SEO PixFeed (Python)

Worker versionné dans le dépôt, **exécuté par cron sur serveur2** (modèle `sync_axonaut.py`).
C'est la **seule** couche autorisée à écrire les données SEO ; le backend Node ne fait que **lire**
les tables `seo_*`.

## Étape 1 (actuelle) : crawl interne + PageRank, sans Google.

### Installation (serveur2)
```bash
cd seo_worker
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Variables d'environnement (mêmes que le backend Node)
`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.

### Exécution
```bash
python run.py            # incrémental + REPRISE auto si le run précédent a été interrompu
python run.py --full     # reconstruction complète (purge liens + reparse total, ignore la reprise)
python run.py --no-resume   # incrémental sans reprise (repart du début)
python run.py --site jurojin.net   # un seul site
```

### Mode service (file de jobs déclenchée depuis l'UI)
Le worker peut tourner en **service permanent** qui consomme la table `seo_jobs` :
```bash
python run.py --serve     # boucle : prend le plus ancien job 'pending', l'exécute, recommence
```
- **Un seul job à la fois** (séquentiel), claim atomique (`FOR UPDATE SKIP LOCKED`).
- Au repos, le service **dort** `POLL_INTERVAL` (10 s) → consommation ~nulle.
- L'UI (bouton « Lancer le crawl ») crée un job via `POST /api/seo/jobs` ; le Node n'écrit
  QUE dans `seo_jobs` (jamais `seo_pages`/`seo_links`) et ne crawle jamais.
- Anti-double garanti en base (index unique partiel : 1 job actif max par site).

Installation systemd (modèle `crm-pixfeed.service`) :
```bash
sudo cp crm-seo-worker.service /etc/systemd/system/
# adapter les chemins (WorkingDirectory, EnvironmentFile, ExecStart) dans le fichier
sudo systemctl daemon-reload
sudo systemctl enable --now crm-seo-worker
sudo journalctl -u crm-seo-worker -f      # logs
```

### Persistance & reprise
- **Commit par lots** (`config.COMMIT_BATCH`, défaut 25 pages) : la progression est persistée
  au fil de l'eau (visible immédiatement en base) et un crash ne perd qu'un lot.
- Table **`seo_crawl_runs`** : chaque run y est tracé (`status`, `last_wp_id`, `pages_processed`).
  Si un run plante (status `failed`/`running`), le suivant **reprend** après `last_wp_id`
  (contenus triés par `wp_id` croissant). `--full` ou `--no-resume` ignorent la reprise.
- **Liens** : DELETE global réservé à `--full`. En incrémental/reprise, on ne touche qu'aux
  liens des pages effectivement reparsées (delete/reload par `from_url`).
- Robustesse : timeout HTTP, max 5 redirections, `try/except` autour du fetch ET du parsing
  (une page cassée est loguée et sautée, jamais d'interruption du run).

### Cron (ex. tous les jours à 04:00)
```
0 4 * * *  cd /chemin/seo_worker && ./venv/bin/python run.py >> /var/log/seo_worker.log 2>&1
# Reconstruction complète hebdomadaire (dimanche 03:30) :
30 3 * * 0 cd /chemin/seo_worker && ./venv/bin/python run.py --full >> /var/log/seo_worker.log 2>&1
```

### Ajouter un site
Depuis l'UI : page SEO, roue crantée à côté du sélecteur de site (ajouter, modifier,
supprimer). La table `seo_sites` est la source unique ; le worker la lit au début de chaque
job, donc **aucun redéploiement** et **aucune** reconfiguration Google (une seule connexion
Search Console sert tous les sites, via `gsc_property`).
`config.py > SEED_SITES` ne sert qu'à amorcer une base VIDE (première installation) ; ensuite
il est ignoré, pour ne jamais écraser ce qui a été réglé dans l'UI.
Supprimer un site efface toutes ses données (FK `ON DELETE CASCADE`) : l'UI exige la saisie
du domaine pour confirmer et refuse si un job est en cours.

## Architecture des liens / PageRank
- **Incrémental** : pour chaque page modifiée, `DELETE seo_links WHERE site_id=? AND from_url=?`
  puis ré-INSERT des liens de cette page (les pages non modifiées gardent leurs liens).
- **--full** : `DELETE seo_links WHERE site_id=?` puis reparse de toutes les pages.
- Le **PageRank est recalculé sur le graphe entier** à chaque run (un lien ajouté change le jus
  de tout le graphe).

## Étape 2 : Google Search Console

Une **seule** connexion OAuth sert **tous** les sites (chaque `seo_sites.gsc_property` mappe un
site, ex. `sc-domain:jurojin.net`). Le worker reste la seule couche qui écrit ; la synchro se
déclenche depuis l'UI via un job `gsc_sync` (même file `seo_jobs`, même service `--serve`).

### Ce que fait `gsc_sync`
1. **Search Analytics** (clics/impressions/position par date+page+requête) → `seo_gsc_daily`
   (upsert idempotent). Backfill initial 180 j au premier run, puis incrémental quotidien
   (s'arrête à aujourd'hui − 3 j, latence GSC).
2. **URL Inspection** (statut d'indexation) → `seo_url_inspections` + recopie dans
   `seo_pages.indexation_status`. **Plafond 2000 inspections/run** ; priorité aux pages jamais
   inspectées puis aux plus anciennes (jamais de réinspection globale ; TTL 14 j).
3. **Snapshot mensuel** : agrégation `seo_gsc_daily` → `seo_metrics_monthly` (mémoire longue
   au-delà des 16 mois conservés par GSC).
4. **`value_score` réel** : impressions GSC (échelle log normalisée) si la page en a ; sinon
   **repli sur l'heuristique** par catégorie. `health` est recalculé sans recrawl (le PageRank
   déjà en base est réutilisé).

### Lancement
```bash
python run.py --gsc                  # synchro GSC de tous les sites (hors file de jobs)
python run.py --gsc --site jurojin.net
# En service : un job 'gsc_sync' créé depuis l'UI est traité automatiquement par --serve.
```

### Sécurité des jetons
`client_secret` et `refresh_token` sont stockés **en clair** dans la table `seo_oauth_tokens`
(même niveau de confidentialité que `backend/.env`). Ces champs ne sont **jamais** renvoyés par
une route Node : seul `GET /api/seo/gsc/status` expose `connected` / `account_email` / `date`.
L'app OAuth est publiée en **Production** → le `refresh_token` n'expire pas (aucune logique 7 j).

### Consentement OAuth initial (une seule fois)

Prérequis : créer un client **OAuth Desktop** dans Google Cloud, activer l'API **Search
Console**, télécharger `client_secret.json`. Ce fichier est gitignoré.

**Le `client_secret.json` est nécessaire DES DEUX CÔTÉS** : sur le poste (pour le flux de
consentement) ET sur serveur2 (le mode `--store` y lit `client_id`/`client_secret` pour les
enregistrer avec le token).

#### Variante SANS tunnel (recommandée) — 2 étapes
1. **Sur ton poste** (avec navigateur), `client_secret.json` dans `seo_worker/` :
   ```bash
   python gsc_auth.py
   ```
   Le navigateur s'ouvre → choisis le compte Google ayant accès aux propriétés GSC → accepte.
   Le script **affiche le `refresh_token`** et la commande `--store` prête à coller.
2. **Sur serveur2** (accès base + `client_secret.json` présent) :
   ```bash
   python gsc_auth.py --store --email=ton.email@gmail.com --refresh-token=COLLER_LE_TOKEN
   ```
   → écrit la connexion dans `seo_oauth_tokens`. Terminé, définitif.

#### Variante TUNNEL SSH (tout sur serveur2, en un coup)
```bash
# depuis ton poste :
ssh -L 8765:localhost:8765 user@serveur2
# sur serveur2 (client_secret.json présent) :
python gsc_auth.py --write-db --no-browser
```
Colle l'URL affichée dans ton navigateur local ; après consentement, le token est écrit
directement en base.

> Si « Aucun refresh_token renvoyé » : révoque l'accès de l'app dans le compte Google
> (myaccount.google.com → Sécurité → accès tiers) puis relance — Google ne fournit le
> `refresh_token` qu'au tout premier consentement.

### Mode TEST (ne jamais cramer le quota pour découvrir un bug)
Inspecte **UNE seule URL** (1 inspection, **aucune** écriture en base, pas de synchro complète) :
```bash
python run.py --gsc-test "https://jurojin.net/ma-page/" --site jurojin.net
```
Affiche l'URL réellement envoyée à Google (fragment `#` retiré), `coverageState`, `verdict`,
`indexingState`, `pageFetchState`, `googleCanonical`, et un OK/ERREUR lisible. `--gsc-inspect`
en est un alias. `--gsc-debug` reste l'investigation approfondie (canonique GSC vs cible, top
pages, JSON brut). Depuis l'UI : champ **« Tester l'indexation d'une page »** (crée un job
`gsc_test`, 1 inspection). Workflow : corriger un bug → tester 1 URL → si OK, lancer la synchro.

### Côté UI
Bouton **« Search Console »** (crée un job `gsc_sync`, même badge/polling que le crawl),
bandeau d'état de connexion, colonnes impressions/clics/position + badge d'indexation dans la
liste des pages, et onglet **« Quasi-victoires »** (positions moyennes 11–20).

## Audit technique on-page
Extrait au crawl, **à partir du HTML déjà récupéré** (aucune requête en plus pour les vérifs
de base). Écrit dans des tables DÉDIÉES (`seo_onpage_issues` par page, `seo_audit` au niveau
site) — totalement isolées de `seo_pages` (GSC/maillage). Toute l'extraction d'audit est
encadrée par try/except + savepoint propre : une page au HTML bizarre n'est pas auditée mais
ne casse JAMAIS le crawl.
- Base (depuis le HTML) : title (longueur), meta description, H1 (nb, = title ?), saut de Hn,
  nb de mots (thin), images sans alt, canonical, noindex, mixed content (http:// sur https).
- Profondeur : redirections chaîne/boucle (réutilise `r.history` du fetch, max 5 sauts),
  profondeur de crawl (BFS depuis l'accueil sur le graphe), cohérence sitemap (fetch unique
  + HEAD plafonné `AUDIT_SITEMAP_HEAD_CAP` avec politesse pour isoler les 404).
- Lecture : `GET /api/seo/audit?site_id=` (catégories par gravité + score /100), onglet
  « Audit technique » dans l'UI. Seuils ajustables dans `config.py` (AUDIT_*).

## Suivi de positions (rank tracker)
100% GSC, sur la dimension `query` DÉJÀ collectée dans `seo_gsc_daily` (date, page, query,
clics, impressions, position). Aucune nouvelle collecte ; position = `SUM(impr*pos)/SUM(impr)`
(même formule que le cache Opportunités), fenêtre 28j par défaut (7/28/90 dans l'UI).
- Endpoints lecture seule `/api/seo/positions/*` (summary, keywords, keyword, pages, page, yoast).
- Watchlist `seo_tracked_keywords` : **Node peut écrire** (config utilisateur, exception comme
  `seo_jobs`). Les données GSC restent écrites par le worker uniquement.

### Champs SEO à la source — snippet REQUIS (à coller AVANT un crawl)

Yoast stocke ses réglages en post meta, que l'API REST n'expose pas par défaut. Sans ce
snippet, le worker doit deviner ces valeurs en aspirant le HTML rendu — ce qui mélange le
contenu et le gabarit du thème, fausse les compteurs et ne permet pas de distinguer
« champ vide en base » (vrai manque à corriger) de « balise absente du HTML » (cause
technique). Colle ceci dans le `functions.php` du thème, **puis relance un crawl** :

```php
add_action('rest_api_init', function () {
  // Ajoute ici tout nouveau type de contenu.
  $types = ['post','page','glossaire','guide','anime','film','logiciel','serie','acteur','jeu'];
  // champ REST => post meta Yoast ('' = champ natif WordPress, traité plus bas)
  $champs = [
    'focus_keyword'   => '_yoast_wpseo_focuskw',
    'meta_description'=> '_yoast_wpseo_metadesc',
    'seo_title'       => '_yoast_wpseo_title',
    'robots_noindex'  => '_yoast_wpseo_meta-robots-noindex',
  ];
  foreach ($types as $pt) {
    foreach ($champs as $champ => $meta_key) {
      register_rest_field($pt, $champ, [
        'get_callback' => function ($obj) use ($meta_key) {
          return get_post_meta($obj['id'], $meta_key, true);
        },
        'schema' => ['type' => 'string'],
      ]);
    }
    // Extrait BRUT : `excerpt.rendered` passe par les filtres du thème et peut être
    // tronqué ou enrichi ; on veut la valeur telle que saisie.
    register_rest_field($pt, 'excerpt_raw', [
      'get_callback' => function ($obj) {
        $p = get_post($obj['id']);
        return $p ? $p->post_excerpt : '';
      },
      'schema' => ['type' => 'string'],
    ]);
  }
});
```

Le worker lit alors ces champs au crawl : `focus_keyword` alimente `seo_pages.focus_keyword`,
les autres alimentent `seo_pages.seo_meta` et **priment sur le HTML**. Le snippet reste
optionnel au sens strict : sans lui, le worker retombe sur la lecture du `<head>` et rien ne
casse, mais les compteurs `meta_description_absente` et `title_trop_long` restent approximatifs.

## Google Analytics 4 (job `ga_sync`)
Onglet « Trafic » de la page SEO. Propriété GA4 **par site** : son identifiant numérique se
saisit dans la fiche du site (roue crantée), champ « Propriété Google Analytics 4 (ID) »
(Analytics > Admin > Paramètres de la propriété > ID de propriété). Un site sans propriété
est ignoré. Rien en dur.

Prérequis, une fois :
1. Le consentement Google doit couvrir Analytics. Depuis la page SEO, bouton « Connecter
   Google » (ou « Ajouter Analytics à la connexion » si Search Console est déjà connectée) :
   la fenêtre Google s'ouvre, on accepte, le serveur reçoit et stocke le jeton dans
   `seo_oauth_tokens`. Même résultat que `gsc_auth.py`, sans tunnel ni ligne de commande.
   Côté serveur, il faut `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (client OAuth
   « Application Web », déjà utilisé par la synchro agenda) et `FRONTEND_URL` dans
   `backend/.env`, et dans la console Google l'URI de redirection
   `<FRONTEND_URL>/api/seo/google/callback` déclarée sur ce client.
   `gsc_auth.py` reste utilisable en secours (client « Ordinateur de bureau »).
2. Activer « Google Analytics Data API » sur le projet Google Cloud.
3. Le compte Google utilisé doit avoir accès (lecteur suffit) à la propriété GA4.

Le job récupère par jour et par page : sessions, sessions organiques, utilisateurs, pages
vues, taux d'engagement, durée d'engagement, rebond (`seo_ga_daily`) ; par jour et par canal
d'acquisition : sessions, utilisateurs, sessions engagées (`seo_ga_channels_daily`) ; et met
en cache 28 j sur `seo_pages` (`ga_sessions_28d`, `ga_engagement_28d`). Backfill 90 jours au
premier passage, puis la veille chaque nuit (planifié après la synchro Search Console).
Outil MCP : `get_traffic`.

## Autorité du domaine et liens entrants (job `authority`)
Onglet « Autorité & liens » de la page SEO : l'équivalent des blocs Authority Score /
Backlinks / Domaines référents du tableau de bord Semrush, avec des sources gratuites :
- **Open PageRank** (`OPR_API_KEY`, déjà utilisé par le module Backlinks) : score 0..10
  (proxy de l'Authority Score, pas la même formule), rang mondial, domaines référents.
- **Bing Webmaster Tools** (`BING_WMT_API_KEY` dans `backend/.env`, même clé que le serveur
  MCP ; le site doit être vérifié dans Bing WMT sous ce compte) : liens entrants connus de
  Bing, page par page (GetLinkCounts puis GetUrlLinks sur les `BING_TARGETS_PER_RUN` pages
  les plus liées), avec ancre. Les liens non revus sur une page recontrôlée sont marqués perdus.
- **Vérification à la source** : le worker lit chaque page qui nous lie (rotation,
  `BACKLINK_VERIFY_PER_RUN` = 150 par passage, TTL 30 j) et constate lui-même l'attribut
  `rel` (follow / nofollow / sponsored / ugc), le type (texte / image), l'ancre réelle, le
  titre et la langue de la page, et si le lien existe encore : un lien absent de sa page
  (`link_removed`) ou dont la page a disparu (`page_gone`) est marqué perdu. Un lien que Bing
  ne liste plus n'est pas déclaré perdu : il est simplement re-vérifié à la source.
- **Domaines référents enrichis** (`seo_ref_domains`) : TLD, IP, pays (ccTLD sinon pays
  d'enregistrement de l'IP via les registres RDAP, gratuit), autorité Open PageRank en lot,
  et un **indicateur de toxicité maison** 0..100 dont chaque critère déclenché est listé :
  autorité nulle +30, ancre suspecte +30, lien de gabarit répété sur des dizaines de pages
  +15, extension à risque +15, nom de domaine d'apparence générée +10. Toxique dès 60,
  douteux dès 30. Le score global du site = part des liens actifs venant de domaines toxiques.
  Le pays est celui de l'**hébergement**, pas de l'audience (un .com chez Cloudflare sort US).
Un instantané par jour dans `seo_authority_daily` (tendance), le détail dans `seo_backlinks`.
Planifié chaque nuit après Analytics. Outil MCP : `get_authority`.

## Planification nocturne (mode `--serve`)
Sans elle, rien ne tourne sans un clic. Le worker met donc lui-même en file, chaque jour à
`SEO_SCHEDULE_HOUR` (4 h, heure `SEO_SCHEDULE_TZ` Europe/Paris), pour chaque site et dans
l'ordre : crawl incrémental (complet le `SEO_SCHEDULE_FULL_WEEKDAY`, 6 = dimanche, -1 =
jamais), synchro Search Console (si connectée), synchro Analytics (si le site a une
propriété GA4 et que le consentement la couvre), analyse d'autorité (si clé Open PageRank
ou Bing), mesure de vitesse (si clé PageSpeed).
- Passe par `seo_jobs` comme l'UI (`source = 'schedule'`) : un seul job actif par site,
  annulation possible, progression et erreurs visibles dans l'écran SEO, qui affiche aussi
  la ligne « Automatique chaque nuit à 04h… » et le résultat du dernier passage.
- État en base, pas en mémoire : un worker arrêté à 4 h rattrape la chaîne dès son retour,
  dans la même journée. Un job planifié en échec n'est pas relancé (on passe à l'étape
  suivante) ; un job lancé à la main et réussi dans les 20 h précédentes vaut pour la
  journée (quota Google).
- Pourquoi 4 h : Google publie la journée Search Console pendant la nuit, et le quota
  d'inspection se remet à zéro à minuit heure de Californie (9 h à Paris), donc la synchro
  nocturne laisse le quota du jour entier aux tests manuels.
- `SEO_SCHEDULE=0` dans `backend/.env` désactive tout (retour au manuel). Le cron décrit plus
  haut n'est plus nécessaire quand le service tourne.

## Rétention Search Console
`seo_gsc_daily` (une ligne par jour × page × requête) grossit sans fin. Google lui-même ne
conserve que 16 mois. Après chaque `gsc_sync`, une fois le snapshot mensuel écrit
(`seo_metrics_monthly`, par page), le détail plus ancien que `GSC_RETENTION_MONTHS` (16) est
purgé. La mémoire longue (content decay) reste dans le snapshot. `GSC_RETENTION_MONTHS=0`
désactive la purge.

## Core Web Vitals / PageSpeed (job `pagespeed`)
Onglet « Vitesse » de la page SEO, bouton « Mesurer la vitesse », ou `python run.py --pagespeed`.
Le worker interroge l'API PageSpeed Insights (gratuite) en **rotation**, pour couvrir tout le
site en quelques semaines sans bloquer le worker des heures. À chaque run :
- l'accueil + les `PSI_TOP_PAGES` (10) pages les plus vues, en mobile **et** desktop : ce sont
  elles qui portent le terrain et le classement, on suit leur tendance run après run ;
- un lot de `PSI_ROTATION_PAGES` (30) pages, d'abord celles jamais mesurées puis les plus
  anciennement mesurées, en mobile seul (l'index de Google ; le desktop doublerait la durée
  pour un gabarit WordPress identique d'une page à l'autre).
Soit ~50 appels et 15 à 30 min par run ; un site de 1 200 pages est couvert en ~40 runs.
L'onglet Vitesse affiche la couverture (pages mesurées / pages du site).
Chaque mesure est stockée dans `seo_pagespeed` :
- **terrain** (CrUX, utilisateurs réels, p75 sur 28 j) : LCP / INP / CLS et catégorie
  FAST/AVERAGE/SLOW. C'est ce que Google utilise pour classer. `NULL` = trafic insuffisant
  pour la page (l'origine entière est alors donnée dans `origin_category`).
- **labo** (Lighthouse) : score 0..100, LCP, CLS, TBT, FCP, Speed Index, TTFB, et les
  opportunités d'optimisation avec gain estimé. Reproductible : sert à vérifier une
  correction le jour même.
Chaque mesure est une ligne (historique, `PSI_HISTORY_KEEP` = 30 par url/stratégie) : l'UI
affiche le delta avec la mesure précédente.

**Clé API fortement recommandée** : `PAGESPEED_API_KEY` dans `backend/.env` (clé Google
Cloud avec l'API « PageSpeed Insights » activée ; `CRUX_API_KEY` est réutilisée à défaut).
Sans clé, le quota anonyme par IP est très bas : le job peut s'arrêter en 429 dès la
première page (le job passe alors en échec avec ce message). Les données terrain n'évoluent
qu'à J+1 : une mesure par jour suffit, et fait avancer la rotation.

## Étapes suivantes
- Content decay (besoin de plusieurs mois de `seo_metrics_monthly`).
- Alertes (désindexation, chute de score, nouvelles 404) par e-mail.
