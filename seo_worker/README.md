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
Ajouter une entrée dans `config.py > SITES` (domaine + `wp_base_url` + `gsc_property`).
Le worker upsert `seo_sites` au démarrage : **aucune** reconfiguration Google nécessaire.

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

## Étapes suivantes
- Étape 3 (suite) : content decay (besoin de plusieurs mois de `seo_metrics_monthly`),
  cannibalisation de requêtes, indexation fiabilisée.
