# Brief pour Claude Code : brancher l'agent du configurateur PC dans le CRM

Ce dossier est un module complet et testé : `npm test` (22 tests, sans base), `npm run test:integration` (32 tests, obligatoires : la commande échoue si `PGTEST_URL` manque, avec une base PostgreSQL de test vide, voir Recette), `npm run essai` (calcul complet en 0,3 s, contrôles OK).
Ta mission : l'intégrer au backend du CRM (Node 22 / Express, PostgreSQL, service systemd `crm-pixfeed`, utilisateur `jurojinn`),
déployer les fichiers WordPress dans le thème JurojiNet, et construire l'écran de validation dans le front du CRM.
Ne modifie pas la logique du moteur (`src/moteur/`, `src/controles.js`) sans en parler à Marc : les règles ont été validées une à une.

## Ce que fait l'agent

| Quand (heure de Paris) | Tâche | IA ? |
|---|---|---|
| Chaque nuit, 3 h 30 | Relève les prix dans les flux Awin, recalcule les 111 profils, contrôle, publie le JSON, vide le cache WP Rocket de la page | Non |
| Lundi, 6 h | Idem, et si un modèle en rupture a basculé sur sa réserve : rédige sa nouvelle ligne « pourquoi » (claude-haiku-5-5), à valider | Un petit appel, seulement en cas de bascule |
| Le 1er du mois, 7 h | Idem avec de nouvelles mesures Blender Open Data, puis proposition de sélection (claude-sonnet-5-5 + recherche web limitée à `config.domainesRecherche`, 10 recherches max) envoyée par mail à Marc | Un appel |

Rien de ce que propose l'IA n'est publié sans la validation de Marc. Si un contrôle échoue, l'ancien fichier reste en ligne et Marc reçoit un mail.

Garanties tenues par le code (et vérifiées par les tests d'intégration) :
- une validation est d'abord calculée et contrôlée à part ; la sélection en base, la proposition et le fichier publié ne changent qu'ensemble, et seulement si tout passe ;
- publication en deux temps : le fichier complet est écrit à côté, invisible du site ; la transaction est validée ; puis un renommage atomique le met en ligne. Si le COMMIT échoue, rien ne change ni en base ni en ligne. Si le renommage échoue après le COMMIT (disque), la publication est marquée `echec_ecriture`, Marc est prévenu, et le relevé suivant republie tout depuis la base, qui fait foi ;
- au démarrage du CRM, l'agent compare l'identifiant de version du fichier en ligne (`version_publication`) à celui de la dernière publication en base. S'ils diffèrent (processus coupé entre le COMMIT et la mise en ligne, par exemple), il remet en ligne à l'identique le fichier gardé en base, sans dépendre des flux ni des mesures, et prévient Marc. Les 30 dernières publications sont gardées en base (`cfg_publications.contenu`) ; `POST /publications/:id/restaurer` permet un retour arrière ;
- les réserves affichées au visiteur (« En cas de rupture : … ») sont seulement celles qui conviennent à toutes les machines publiées où figure la puce : un visiteur qui prend la réserve peut monter sa machine telle quelle ;
- la page ne donne un chiffre de gain que s'il vient d'une mesure sourcée (durée de rendu Blender Open Data) ; les indices internes (jeu, montage, photo) servent au classement des machines, jamais à l'affichage ;
- une seule tâche tourne à la fois, même si le CRM passait un jour en plusieurs processus (verrou PostgreSQL `pg_try_advisory_lock`, tenu par une connexion dédiée et libéré automatiquement si le processus meurt) ; chaque demande reçoit un identifiant et un statut consultable (`en_cours`, `terminee`, `echouee`, `refusee`, `interrompue`) ;
- un flux marchand que le marchand n'a pas mis à jour depuis plus de 48 h est écarté, et les prix sont datés de la mise à jour du flux, pas de notre lecture. La page affiche la date du prix le plus ancien ;
- un modèle en stock qui n'entre dans aucune machine (trop long, trop gourmand) cède la place à la réserve suivante au lieu de faire disparaître la puce.
- si une carte graphique ou un processeur disparaît de la page par rapport à la publication précédente, la publication se fait quand même et Marc reçoit un mail avec la raison : plus d'offre en stock (le marché), aucun modèle compatible (donnée de la sélection à vérifier, avec le détail), ou plus choisie à aucun budget (avec l'évolution du prix).

## Étapes

1. **Copier le module** dans `backend/modules/configurateur/` (tout sauf `node_modules/` et `sortie/`).
   Ajouter au `package.json` du backend : `@anthropic-ai/sdk`, `csv-parse@^5.5.6`, `node-cron@^3.0.3` (et `pg` s'il n'y est pas). `npm install`.
2. **Tables** : ajouter le contenu de `sql/schema.sql` à `DATABASE_SCHEMA` dans `scripts/autoInitDatabase.js` (tout est en `IF NOT EXISTS`).
3. **Brancher** dans le serveur Express, après la création du pool et du mailer existants :
   ```js
   require('./modules/configurateur').brancher(app, {
     db: pool,                                   // objet qui expose query(sql, params)
     envoyerMail: ({ to, subject, text, html }) => transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, text, html }),
     authentifier: middlewareAuthDuCRM            // le même que pour les autres routes privées
   });
   ```
   Adapter les noms (`pool`, `transporter`, middleware) à ce qui existe dans le CRM. `authentifier` et `db` sont obligatoires : sans eux, `brancher` lève une erreur au démarrage. `db` doit être un `Pool` de `pg` (le module prend un client dédié pour ses transactions). Le service tourne en une seule instance. S'il passait un jour en plusieurs processus, le verrou PostgreSQL empêche deux tâches simultanées ; il reste préférable de ne planifier les tâches que dans un seul processus (`planifier: false` dans les autres).
4. **Variables dans `backend/.env`** (jamais dans le code, jamais dans git, jamais dans un log) :
   ```
   CONFIGURATEUR_ANTHROPIC_API_KEY=   # clé dédiée, avec plafond de dépense, créée par Marc dans la Console
   AWIN_FEEDLIST_URL=                 # adresse « feedList » du compte Awin 614905 (contient une clé secrète)
   AMAZON_PARTNER_TAG=                # identifiant partenaire …-21 ; vide = aucun lien Amazon
   CONFIGURATEUR_DOSSIER=/home/jurojinn/public_html/wp-content/uploads/configurateur
   CONFIGURATEUR_WP_PATH=/home/jurojinn/public_html
   CONFIGURATEUR_WP_PAGE_ID=          # facultatif (étape 6)
   CONFIGURATEUR_MAIL_VALIDATION=     # adresse de Marc
   CONFIGURATEUR_URL_VALIDATION=      # adresse de l'écran de validation dans le CRM
   ```
   Vérifier que `wp` (WP-CLI 2.12) est dans le PATH du service systemd, sinon le vidage du cache échoue sans bloquer (le résultat est noté dans `cfg_publications.resume.cache`).
5. **Thème WordPress** : copier `wordpress/jurojinet/inc/configurateur.php` et le dossier `wordpress/jurojinet/configurateur/` dans `~/public_html/wp-content/themes/JurojiNet/`, puis ajouter à `functions.php` :
   ```php
   require_once get_stylesheet_directory() . '/inc/configurateur.php';
   ```
   Le shortcode `[configurateur_pc]` imprime l'outil et les données. CSS et JS ne sont chargés que sur la page qui contient le shortcode ; les styles sont limités à `.cfg-pc`. Le fichier exclut le script du « retard du JavaScript » de WP Rocket, sinon l'outil reste vide jusqu'au premier geste du visiteur.
   Si le thème a un dépôt git, y committer ces fichiers ; sinon les déposer tels quels.
6. **Page** : Marc crée la page (brouillon) avec son texte et choisit le modèle « Configurateur PC » (panneau Page, Modèle) : l'outil s'affiche sous le texte. Le shortcode reste possible pour le placer ailleurs. `CONFIGURATEUR_WP_PAGE_ID` est facultatif : sans lui, l'agent retrouve les pages au modèle « Configurateur PC » ou contenant le shortcode pour vider leur cache.
7. **Écran de validation dans le CRM** (front) — routes déjà prêtes, sous `/api/configurateur`, derrière l'authentification :
   - `GET /etat` : dix dernières publications (statut, erreurs, taille, résumé), propositions en attente, sélection active ;
   - `POST /propositions/:id/valider` avec `{ "decisions": { "0": true, "1": false } }` : lance la validation (relevé, calcul, contrôles, puis enregistrement et publication si tout passe) ;
   - `POST /selection/valider` : première mise en ligne, valide la sélection de départ telle quelle ;
   - `POST /taches/nuit|lundi|mois` : lance une tâche à la main ;
   - `POST /publications/:id/restaurer` : remet en ligne à l'identique une des 30 dernières publications (l'état indique lesquelles sont `restaurable`) ;
   - `GET /taches/:id` : statut et résultat d'une tâche.
   Les `POST` répondent tout de suite `202 { id, statut: "en_cours" }`, ou `409 { id, statut: "refusee", en_cours }` si une autre tâche tourne. Le relevé des flux peut prendre plusieurs minutes : l'écran interroge `GET /taches/:id` toutes les quelques secondes et affiche le résultat (publié, ou bloqué avec la liste des erreurs ; dans ce cas la proposition reste en attente).
   L'écran affiche chaque changement proposé (type, composant, détail, raison, liens vers les sources) avec une case à cocher, puis un bouton « Valider la sélection ». Une page simple suffit, dans le style du CRM.

## Recette

1. `npm test` et `npm run essai` dans le module : tout vert. `test/resultats-recette-locale.txt` montre l'exécution de référence (32 tests, PostgreSQL 16) : la recette sur le serveur doit donner le même résultat. Puis `npm run test:integration` sur une base PostgreSQL de test vide (jamais la base du CRM : le test vide les tables `cfg_*`), en réglant `PGTEST_URL`.
2. Avec les variables réglées : `POST /api/configurateur/taches/nuit`, puis vérifier `cfg_publications` et la présence de `configurateur-data.json` dans le dossier uploads.
   - Vérifier dans le résumé (`fluxEcartes`, `erreursFlux`) que la date « Last Imported » de la liste Awin est bien lue. Le code accepte « 2026-10-28 03:12:44 », l'ISO et « 28/10/2026 03:12 » ; une date illisible fait écarter le flux par prudence. Si le format réel diffère, l'ajouter dans `dateFlux` (`src/sources/awin.js`) avec un test.
   - Si le résumé indique des flux absents ou des composants « sans offre », regarder `cfg_offres` : il faudra peut-être ajuster les `motifs` de `data/selection.json` (les noms des produits dans les flux Cdiscount et Fnac). Ne jamais élargir un motif au point d'attraper une autre puce (une 5060 Ti avec un motif « 5060 », par exemple : utiliser `exclure`).
3. Ouvrir la page en brouillon : l'outil s'affiche, les liens partent vers Awin, la date des prix est celle du relevé.
4. Marc valide la sélection (`POST /selection/valider` depuis l'écran) : la mention « (exemple) » disparaît.
5. PageSpeed Insights sur la page publiée : pas de décalage de mise en page, LCP inchangé par rapport aux autres guides.

## Règles à respecter

- Clés et adresse feedList : seulement dans `.env`. Ne jamais les afficher, les journaliser ni les committer.
- Aucun lien public entre le CRM et jurojin.net : rien dans le JSON publié ni dans la page ne doit mentionner le CRM, son domaine ou son nom.
- Ne supprimer aucun fichier sur le serveur sans l'accord explicite de Marc.
- Liens marchands : toujours `rel="sponsored nofollow"` (déjà fait par la page).

## Ce qui manque encore (côté Marc)

- La clé API dédiée, l'adresse feedList du compte 614905 et l'identifiant Amazon `…-21`.
- Les acceptations Grosbill, Alternate, Rue du Commerce et Cybertek : à leur arrivée, ajouter leurs numéros de flux dans `config.fluxAwin`.
- Les ASIN des modèles retenus : l'agent les propose chaque mois, Marc les valide.
