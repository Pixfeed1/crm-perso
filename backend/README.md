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
5. **score d'intention** (0-100) : âge de l'entreprise (30 si < 90 j, 15 si < 1 an), confiance du
   match (25 / 12), métier reconnu dans le nom (10), département ciblé (10, `SIGNAL_DEPARTEMENTS`,
   défaut `01,69,38,71,39,74,73`), absence de site (10) ; pour un site déjà en ligne, ce sont les
   défauts visibles qui comptent (20 avec preuve). L'âge du domaine ne compte pas : tout le fichier
   a moins de sept jours ;
6. **statut** : `qualifie` (≥ 50), `a_surveiller`, `rejete` (alias, grande entreprise, association,
   syndic de copro, collectivité, site en ligne d'une entreprise établie sans défaut, rien après 90 j).

**Surveillance** : signaux avec un indice (entreprise ou métier) recontrôlés à J+7, 15, 30, 60, 90 ;
sans indice, à J+30 et J+90 seulement, et là l'annuaire est interrogé d'abord, le site n'étant
analysé que si une entreprise est apparue (worker 06:15, `services/domainSignalWorker.js`).
« Recalculer les scores » re-note tout sans réseau quand les règles changent. Quand un site apparaît, la ligne est copiée dans
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

## Email par la preuve : règles de fiabilité

Les emails sont assemblés par le code (`services/proofEmailService.js`), sans modèle de langage,
à partir des mesures du crawler. Règles issues de la relecture de prospects réels :

- **Personnalisation seulement si la correspondance SIRENE est sûre** (`sirene_match = 'sur'`) :
  nom du dirigeant (premier prénom + nom, en casse de nom), raison sociale, ville. « probable »
  ou « douteux » = « Bonjour, » et rien d'autre. La confiance tient compte du code postal lu sur
  le site (`code_postal_site`) et de l'écart avec le second candidat (`sireneEnrich.confidence`).
- **HTTPS** : le crawler essaie https nu, https www, http nu, http www avec vérification stricte,
  puis seulement les https sans vérification, et garde la trace de chaque variante
  (`https_variantes` : URL testée, résultat TLS ou code HTTP et URL finale). `ssl_ok` vaut « non »
  uniquement sur une erreur TLS réelle (`ssl_erreur`), vide si https n'a échoué que pour une raison
  réseau. `https_final` reste un fait : la page finale est servie en HTTP. Les mesures HTTPS d'une
  ligne **sans date d'analyse** (ancien crawler) ne sont jamais des preuves : « non confirmé,
  réanalyser ».
- **Bascule maintenance** : sans preuve confirmée, si la boutique est identifiée (PrestaShop,
  WooCommerce, WordPress) et en ligne, le mode preuve renvoie un email de maintenance sobre, sans
  aucune alerte technique (`buildMaintenanceEmail`), avec la raison du refus de preuve dans la trace.
- **Preuves retenues** (`PREUVE_KEYS`) : constatées, visibles par le gérant, d'impact réel :
  accueil 404, erreur serveur, noindex / robots, servi en HTTP (y compris « certificat valide mais
  redirigé vers http »), certificat expiré ou invalide, nom mal orthographié, titre d'installation,
  lien mentions légales cassé, pas d'affichage mobile. Certificat bientôt expiré, copyright ancien,
  description Google, adresses non réécrites, sitemap vide, PHP, SPF, DMARC : **indices**, jamais le
  motif d'un email. Sans preuve, le mode refuse de générer.
- **PHP** : `serveur_php` vient d'une entête (`php_source` = X-Powered-By ou Server). C'est une
  déclaration : elle n'apparaît plus dans le corps de l'email, seulement dans le bloc de traçabilité.
- **Ton et structure** (tous les modes : preuve, Claude libre, création, et les modèles du menu
  « Modèle ») : présentation unique « Je suis Marc, développeur web indépendant et je dirige PixFeed,
  spécialisé dans la maintenance et le dépannage de sites professionnels. », motif factuel (la date
  d'analyse reste dans la trace, pas dans l'email), proposition « J'interviens notamment sur la
  maintenance des boutiques PrestaShop : mises à jour, sauvegardes, sécurité et résolution
  d'incidents techniques. », question « Je souhaitais savoir si vous disposez déjà d'un prestataire
  pour assurer ce suivi… », lien (`OUTREACH_OFFER_URL`), refus discret. 90 à 150 mots,
  vouvoiement. Formules interdites vérifiées par test (`FORMULES_INTERDITES`) : « je ne vous
  relancerai pas », « un simple oui suffit », « sauté aux yeux », « de l'intérieur », « personne ne
  suit », « à mon compte », etc. Non-régression : `tests/emailsNonRegression.test.js` (AGRIGOM,
  Atelier du Sucre, Au Pied Relax, faux sitemap vide).
- **Sitemap** : « vide » seulement sur un vrai document XML de sitemap sans `<loc>` ; une page
  HTML en 200 est un sitemap absent. Les sitemaps déclarés dans robots.txt et les emplacements
  usuels (Yoast, module PrestaShop) sont lus avant de conclure. Aucun délai d'indexation ni perte
  SEO n'est déduit de ce signal.
- **Portées** : chaque phrase de conséquence décrit ce que le visiteur ou le navigateur voit,
  pas une perte de clients ni un classement Google. Test `tests/proofEmail.test.js`.
- **Traçabilité** : la réponse de `POST /api/leads/:id/draft-email` porte `detail` (signal brut,
  URL contrôlée, date `analyse_le`, confiance, identité, contexte), affiché sous l'email.

- **Claude libre, encadré** (`services/coldEmailService.js`) : le modèle n'écrit que le constat (1 à 3
  phrases) et la question, à partir des seules PREUVES (jamais PHP, versions, SSL bientôt, copyright) ;
  sans preuve, observation neutre sans aucun défaut. Présentation, proposition, refus discret et fin
  sont assemblés par le code (mêmes phrases que l'email par la preuve). Le texte du modèle est
  vérifié (`validerTexte` : formules interdites, sujet technique sans preuve, délai inventé,
  tutoiement) ; rejeté, un second essai ; sinon refus 422, rien n'est affiché.

**Réanalyser depuis la fiche** (`POST /api/leads/:id/reanalyze`, bouton « Réanalyser le site » dans la
fenêtre d'email) : relance le crawler sur le seul domaine du prospect, met à jour sa ligne
`crawl_results` (ou en crée une dans le job `reanalyse`), refait la correspondance SIRENE avec le
code postal du site, recalcule score et angles. Notes et interactions ne bougent pas. À faire avant
d'écrire à un prospect dont les mesures datent de l'ancien crawler.

Prévisualiser sur un CSV du crawler, sans base ni envoi :

```bash
node scripts/previewProofEmails.js resultats.csv [domaine] [--sirene]
```

## Campagnes de prospection : préparer, relire, programmer

Onglet **Portefeuille → Campagnes**. Points d'entrée : « Préparer une campagne » dans le Crawl (sur la
sélection) et dans la liste des Prospects (vue tableau, cases à cocher). Aucun envoi sans validation.

1. **Préparer** (`campaignService.addLeads` / `addFromCrawl`) : promotion en prospect si besoin, puis
   pour chaque fiche : contrôles d'exclusion (désinscrit ou opposition = bloquant définitif, email de
   prospection envoyé depuis moins de 90 jours, autre campagne active, fiche gagnée/perdue/pas de
   business, bloqué par les règles du crawl), génération (mode `preuve` avec repli maintenance sans
   alerte, ou `maintenance` seul), classement `classifyItem` : **prêt**, **à vérifier** (pas de
   mesures, ancien crawl, adresse d'un autre domaine, SIRENE probable), **exclu** (raison).
2. **Relire** : objet et corps modifiables (formules interdites refusées), régénération dans l'autre
   mode, preuve avec signal brut, URL contrôlée, date de mesure et identité ; validation ligne par
   ligne ou en lot. Les « à vérifier » ne partent jamais sans validation explicite.
3. **Programmer** (`schedule`) : lignes **validées** seulement, recontrôlées à ce moment ; créneaux
   `planSlots` (défaut 15 par jour, 9 h à 18 h Paris, ≥ 20 min, jours ouvrés, jamais immédiat) dans
   `scheduled_emails` (`email_type = 'prospect'`, `campaign_id`, `campaign_item_id`). Mode test :
   vers les adresses indiquées, objet préfixé `[TEST …]`, sans rattacher le prospect. Vérification
   expéditeur (`GET /api/campagnes/sender-check`) : connexion SMTP, SPF, DMARC, DKIM si
   `EMAIL_DKIM_SELECTOR`.

**Options de la fiche reprises** : mode `modele` (modèle du menu rempli par prospect : `{prenom}` =
civilité sûre ou « Bonjour », `{site}`, `{plateforme}`, `{constat}` = preuve retenue, `{expediteur}`,
`{entreprise}`), régénération d'une ligne en preuve / maintenance / modèle / Claude libre encadré
(la ligne repasse en « prêt »), « Réanalyser » la ligne (même service que la fiche, puis reclassement),
signature choisie, copie cachée, « Commencer le » (date de début des créneaux), relance manuelle
optionnelle J+N dans le Suivi (désactivée par défaut, créée après l'envoi réel seulement).

**Reprise des lignes qui n'ont pas pu partir** (`POST /:id/items/:itemId/reprendre`,
`POST /:id/items/reprendre { quoi }`) : une ligne exclue faute d'adresse se reprend en saisissant
l'adresse sur la ligne (enregistrée sur la fiche, contrôles rejoués, email généré s'il manque, pas de
recrawl) ; « Reprendre les exclus sans email » reclasse d'un coup celles dont la fiche a reçu une
adresse depuis ; « Réessayer » remet une ligne en échec ou arrêtée en « validé » (elle part au prochain
« Programmer »). Désinscrit, opposition et 90 jours restent bloquants ; les autres exclusions ne bougent pas.

**Worker** : `scheduledEmailWorker` appelle `beforeSend` (pause → l'email attend ; arrêt, ligne
marquée répondu/rebond/opposition, désinscrit, fiche fermée ou en discussion → annulé), `afterSent`
(ligne envoyée, campagne terminée quand plus rien n'attend), `afterFailed` (ligne en échec, **pause
automatique après 3 échecs consécutifs**). **Aucune relance automatique** n'est créée.

**Marquages manuels** sur la ligne : « A répondu » (relances fermées, fiche en discussion),
« Rebond » et « Opposition » (adresse ajoutée à `email_optout`, opposition = fiche pas de business).
Les réponses et rebonds différés **ne sont pas détectés automatiquement** (pas de lecture IMAP) :
l'interface le rappelle en permanence. Statistiques : envoyés, réponses, discussions, rendez-vous,
contrats, échecs ; ouvertures en dernier. Tests : `tests/campaign.test.js`.
