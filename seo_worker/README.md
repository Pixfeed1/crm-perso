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

## Étapes suivantes
- Étape 2 : Google Search Console (une connexion pour tous les sites) → `seo_gsc_daily`,
  `seo_metrics_monthly`, `seo_url_inspections` (tables déjà créées, vides pour l'instant).
- Étape 3 : croisements (pages affamées chiffrées, quasi-victoires, content decay, cannibalisation).
