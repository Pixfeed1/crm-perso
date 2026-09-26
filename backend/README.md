# CRM PixFeed — backend

Node.js / Express / PostgreSQL. Démarrage : `npm start` (lit `backend/.env`). Les migrations sont
idempotentes et jouées au démarrage par `scripts/autoInitDatabase.js`.

## Tests

```bash
npm test          # tests unitaires (sans base) : qualification des prospects, email par la preuve,
                  # netlinking, revenus. Les tests base sont ignorés.
npm run test:db   # idem + tests base sur une PostgreSQL JETABLE (TEST_DATABASE_URL, défaut
                  # postgres://postgres@127.0.0.1:55432/postgres). Jamais la base de production :
                  # chaque test crée son schéma et le supprime.
```

Lanceur intégré de Node (`node --test`), aucune dépendance de test.

## Accès à la base : deux styles cohabitent

- **Historique** : `db.run / db.get / db.all` avec des `?` (héritage SQLite, émulé sur PostgreSQL).
  Encore utilisé par `leadModel`, `revenueController`, l'import de prospects…
- **Actuel** : `db.pool.query(sql, params)` avec `$1, $2…` (pg natif). Tous les modules récents.

Règle pour le code neuf : **`db.pool.query` uniquement**. On ne convertit pas l'existant d'un bloc
(des centaines d'appels, risque de régression silencieuse) ; on migre un module quand on le
retouche, en le couvrant d'un test au passage.

## Signaux d'intention : nouveaux domaines .fr (AFNIC)

Onglet **Portefeuille → Signaux**. L'AFNIC publie chaque jour, en open data, la liste des `.fr`
créés la veille (fichier gardé sept jours). Le CRM ne les traite pas comme des prospects mais comme
des **signaux**, dans une table tampon (`domain_signals`) :

1. **filtre sur le nom** (chiffres, sigles, chaînes aléatoires, marques nationales) ;
2. **déjà connu ?** (crawl, prospects, signaux précédents) ;
3. **analyse du domaine** par `cc_prospector detect` : sans DNS, parking (pages par défaut OVH,
   Ionos, Gandi…), installé mais vide, redirection, site actif ;
4. **entreprise correspondante** via recherche-entreprises.api.gouv.fr, avec sa **date de création** ;
5. **score d'intention** (0-100) fondé sur l'âge de l'entreprise, la confiance du match, le métier
   reconnu dans le nom, le département (`SIGNAL_DEPARTEMENTS`, défaut `01,69,38,71,39,74,73`) et
   l'absence de site. L'âge du domaine ne compte pas : tout le fichier a moins de sept jours ;
6. **statut** : `qualifie` (≥ 50), `a_surveiller`, `rejete` (alias, grande entreprise, rien après 90 j).

**Surveillance** : les signaux sans site sont recontrôlés à J+7, 15, 30, 60, 90 (worker 06:15,
`services/domainSignalWorker.js`), avec nouvelle recherche SIRENE à chaque passage (beaucoup
réservent le domaine avant l'immatriculation). Quand un site apparaît, la ligne est copiée dans
`crawl_results` (job `signaux`) : angles, score et **email par la preuve** s'appliquent alors.

**Promotion** manuelle seulement (bouton). Un signal sans site devient un prospect source `AFNIC`,
angle `creation_site`, et le mode « Email par la preuve » produit un **email création de site**
(`services/creationEmailService.js`). Un signal avec site suit le chemin du crawl.

Variables d'environnement (facultatives) : `AFNIC_CREA_URL` (motif avec `{date}` = AAAAMMJJ, si
l'AFNIC déplace le fichier), `AFNIC_AUTO_IMPORT=1` (import automatique chaque matin, à n'activer
qu'après avoir observé les volumes), `SIGNAL_SIRENE_DELAY_MS`, `SIGNAL_RECHECK_BATCH`. Repli sans
réseau : coller la liste à la main dans l'onglet.

Code : `utils/domainSignals.js` (fonctions pures, testées), `services/domainSignalService.js`
(pipeline), `controllers/domainSignalController.js`, routes `/api/portefeuille/signaux`.
