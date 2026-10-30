# Configurateur PC jurojin.net : format des données (configurateur-pc/1)

Ce document décrit le fichier `configurateur-data.json` que l'agent produit et que la page lit.
La page ne calcule rien : toute décision (quelle machine, à quel budget, pourquoi) est prise par l'agent,
puis contrôlée par Marc une fois par mois.

## Le cycle

**Chaque mois (sélection, validée par Marc)**
1. L'agent télécharge l'instantané Blender Open Data et relit les tests PugetBench publiés.
2. Il recalcule les scores de chaque composant, repère les sorties de gamme et les nouveautés.
3. Il propose la sélection : un modèle retenu par puce, deux modèles de réserve, la ligne « pourquoi »,
   le reste de la machine (carte mère, alimentation, boîtier) avec les contrôles de compatibilité.
4. Marc valide. Le fichier passe `selection.validee_le` et `selection.validee_par`.

**Chaque semaine (prix, sans validation)**
1. L'agent relève prix, stock et liens affiliés dans les flux des marchands.
2. Si le modèle retenu est en rupture, il bascule sur une réserve et réécrit la ligne « pourquoi ».
3. Il recalcule tous les paliers avec les nouveaux prix et publie le fichier si les contrôles passent.

## Racine

| Champ | Rôle |
|---|---|
| `format` | `"configurateur-pc/1"`. Toute rupture de format change ce numéro. |
| `genere_le` | Date ISO du calcul. |
| `version_publication` | Identifiant unique de la publication, enregistré aussi en base. Sert à vérifier au démarrage que le fichier en ligne est bien le dernier publié. |
| `prix_constates_le` | Date du prix affiché le plus ancien, c'est-à-dire de la mise à jour la plus ancienne parmi les flux marchands utilisés (pas la date de notre lecture). Affichée « Prix constatés le … ». Un flux non mis à jour depuis plus de 48 h est écarté avant le calcul. |
| `selection.validee_le`, `selection.validee_par` | Dernière validation mensuelle. Tant qu'ils sont vides, la page ajoute « (exemple) ». |
| `budget` | `min`, `max`, `pas` de la réglette (500, 5000, 100). |
| `systeme` | Licence du système, hors total : `nom`, `prix`, `source`, `releve_le`, et `gratuit_suffit` (usages pour lesquels la page ajoute qu'un Linux gratuit suffit). |
| `textes` | Textes éditoriaux par usage : `titre` et `conseils` (deux paragraphes). `mixte.jeu` contient `{ecran}`. |
| `projets` | Pour chaque logiciel, les deux sous-titres « Plutôt légers » / « Plutôt lourds ». |
| `composants` | Le catalogue, indexé par identifiant stable (`gpu-5070ti`, `ram-64`…). |
| `configs` | Toutes les machines distinctes, une seule fois. Les paliers y renvoient par numéro. |
| `profils` | Une entrée par combinaison de réponses (voir les clés plus bas). |

## Composant

```json
"gpu-5070ti": {
  "categorie": "gpu",
  "puce": "Nvidia RTX 5070 Ti 16 Go",
  "court": "5070 Ti",
  "modele": "MSI GeForce RTX 5070 Ti 16G Ventus 3X OC",
  "pourquoi": "Toutes les 5070 Ti se valent en rendu. On a pris …",
  "prix": 850,
  "offres": [
    { "marchand": "cdiscount", "nom": "Cdiscount", "prix": 850, "en_stock": true, "lien": "https://www.awin1.com/…", "image": "https://images2.productserve.com/…", "releve_le": "2026-10-29T03:30:12Z", "source": "awin:44863" },
    { "marchand": "amazon", "nom": "Amazon", "prix": null, "en_stock": true, "lien": "https://www.amazon.fr/dp/B0…?tag=…-21", "releve_le": null, "source": "amazon" }
  ],
  "reserves": [{ "modele": "Gigabyte GeForce RTX 5070 Ti Windforce OC SFF 16G" }],
  "caracteristiques": { "vram": 16, "tdp": 300, "longueur": 305, "alim_recommandee": 750, "connecteur": "12v-2x6" },
  "mesure": { "score": 7589, "tests": 512, "source": { "nom": "Blender Open Data", "version": "4.5.0", "date": "2026-10-29" } }
}
```

- `categorie` : `gpu`, `cpu`, `ram`, `ssd`, `cm`, `ventirad`, `alim`, `boitier`.
- `prix` : le prix retenu, celui de l'offre la moins chère parmi les offres **en stock qui ont un prix**. Une offre à `prix: null` (Amazon trop ancien) n'entre jamais dans ce calcul ni dans le total : elle reste un simple lien. `prix` n'est donc jamais `null` pour un composant utilisé.
- `offres` : un objet par marchand. La page envoie vers l'offre retenue (« Voir chez Materiel.net ») et cite les autres sans prix (« aussi chez Amazon »).
  - Amazon : toujours `prix: null` tant que l'accès à l'API n'est pas ouvert. C'est un simple lien `amazon.fr/dp/<ASIN>?tag=<identifiant>`, ajouté seulement quand le modèle actif a un ASIN validé et que `AMAZON_PARTNER_TAG` est réglé.
  - Une offre en rupture garde `en_stock: false` et n'est plus proposée.
- `fiche` : une ligne lisible pour la zone « Détails » (« 12 cœurs, 24 threads »). La page y ajoute ce qu'elle tire des `caracteristiques` et les modèles de réserve.
- `puce` dit ce que c'est, `modele` dit quelle boîte acheter. `modele` est `null` quand la puce est le produit (processeurs).
- `court` sert sur la réglette et dans les phrases (« passer à la 5070 Ti »).
- `caracteristiques` sert aux contrôles de compatibilité : `socket`, `memoire` (type, sur la mémoire et la carte mère), `tdp` (W, puissance nominale), `conso_max` (W, consommation réelle maximale du processeur en charge, le PPT chez AMD), `alim_recommandee` (W, recommandation du fabricant de la carte graphique), `tdpMax` (W, ce que le ventirad dissipe), `longueur` (mm), `gpuMax` (mm, sur le boîtier), `watts`, `vram`, `go`.
- `reserves` : les autres modèles de la même puce, affichés dans « Détails » (« En cas de rupture : … »), seulement s'ils conviennent à toutes les machines publiées où figure la puce. Le modèle actif est le premier de la sélection qui a une offre en stock ; ses `caracteristiques` (longueur, consommation) remplacent celles de la puce, et tous les calculs et contrôles sont refaits avec elles. Une réserve trop longue ou trop gourmande écarte donc les machines où elle n'entre pas, au lieu de publier une machine fausse.
- Ventirad : les Ryzen 9000 sont vendus sans refroidissement. Quand le processeur en fournit un (8600G), la config utilise `ventirad-boite`, à 0 €, affiché « Fourni ».
- `mesure` : le score Blender Open Data de la puce (médiane, nombre de tests, version de Blender). `null` pour les composants sans mesure. Un score fondé sur moins de 20 tests est ignoré.

### La ligne « pourquoi »

Une ou deux phrases, au ton du site, qui répondent à « pourquoi celui-là parmi tous ceux qui font la même chose » :
- dire quand les modèles se valent, puis le critère de choix réel (prix, format, stock, version de mémoire) ;
- pour un processeur, expliquer le choix de gamme (« son grand cache fait gagner des images en jeu ») ;
- prévenir des pièges (« la 5060 Ti existe aussi en 8 Go ») ;
- jamais d'affirmation invérifiable sur la qualité (« la plus silencieuse ») sans mesure citée.

## Clés des profils

| Réponses | Clé |
|---|---|
| Création | `<logiciel>\|<leger ou lourd>\|-` |
| Création + « Je joue aussi » | `<logiciel>\|<leger ou lourd>\|<1080, 1440 ou 2160>` |
| Jeu vidéo | `jeu\|<solo ou comp>\|<1080, 1440 ou 2160>` |
| Usage courant | `courant\|-\|-` |

Logiciels : `blender maya cinema4d 3dsmax houdini zbrush substance unreal daz keyshot premiere resolve ae photoshop lightroom illustrator clipstudio figma sketchup rhino fusion autocad`.
Soit 183 profils, tous présents même s'ils se ressemblent.

## Profil

```json
"blender|lourd|-": {
  "priorite": "gpu",
  "plafond": 3800,
  "budgets_conseilles": [
    { "libelle": "Le minimum", "budget": 1000 },
    { "libelle": "Le plafond utile", "budget": 3800 }
  ],
  "reperes": [{ "budget": 1700, "libelle": "5070 Ti" }],
  "paliers": [
    { "budget": 1700, "config": 42, "suivant": { "budget": 1800, "gains": { "cpu": 22 } } }
  ]
}
```

- `priorite` : composant qui porte l'usage (`gpu`, `cpu` ou `ram`). Il est mis en avant dans la fiche et donne les repères.
- `paliers` : seulement les budgets où la machine change, triés. Pour un budget donné, la page prend le dernier palier inférieur ou égal. Sous le premier palier, elle affiche le budget minimum.
- `plafond` : budget au-delà duquel la machine ne change plus. `null` si elle progresse jusqu'au maximum.
- `budgets_conseilles` : « Le minimum », « Le bon équilibre » (80 % du gain utile atteint, affiché seulement s'il tombe au moins 300 € sous le plafond), « Le plafond utile ».
- `reperes` : budgets où le composant prioritaire change. La page masque ceux qui se chevauchent à l'écran.
- `suivant` : premier palier qui vaut vraiment la dépense, avec les gains mesurés pour CET usage, en pour cent :
  - au moins 5 % sur la carte ou le processeur, ou davantage de mémoire ;
  - un simple changement de SSD ou un gain de 1 % n'est jamais proposé ;
  - la page ne l'affiche que s'il est à 600 € ou moins.
- `mesure` et `mesure_jeu` : ce que l'on mesure pour cet usage, dit en clair (« Rendu d'une scène type », « Grand jeu solo » en 1440p), avec l'unité et la `source`. `null` quand on n'a pas de mesure fiable (Figma, usage courant) : la page n'affiche alors aucun chiffre.
- `paliers[].mesures` : le résultat de la machine pour cet usage, `duree` en secondes et/ou `ips` en images par seconde. La page l'affiche sous le total : « En pratique. Rendu d'une scène type : environ 4 min 10 s. »
- `paliers[].alternative` : une machine moins chère qui fait presque aussi bien, proposée à côté de celle du budget. Elle n'existe que si :
  - elle coûte au moins 10 % **et** au moins 100 € de moins ;
  - elle est au plus 5 % moins rapide sur **chaque** mesure de l'usage ;
  - elle n'a ni moins de mémoire vive ni moins de mémoire vidéo (ces capacités ne se voient pas dans une mesure de vitesse) ;
  - c'est la moins chère qui remplit ces conditions.

  Elle porte sa `config`, ses `mesures` et `ecart_pct`. La page montre alors deux boutons : « La plus rapide » ou « Votre budget » (quand l'écart est nul, avec ce que cette machine a en plus) et « Presque aussi rapide » ou « Aussi rapide », avec l'écart et l'économie. Un clic change toute la fiche.

### Les mesures

L'agent ne publie une mesure que si elle vient d'une source citée. `profil.mesure` porte `libelle`, `unite`, `source` et `derivee` :
- Blender : Blender Open Data, mesure directe (échantillons par minute convertis en durée sur une scène type). La page écrit « (Source : Blender Open Data.) ».
- Daz (OptiX) et KeyShot (processeur) : `derivee: true`, tirée des mêmes scores. La page écrit « (Estimation tirée de Blender Open Data …) ».
- Montage, photo, Unreal, ZBrush, Illustrator, Figma, usage courant : pas de chiffre. PugetBench pourrait couvrir Adobe et Resolve, avec l'accord de Puget Systems.
- Jeux : aucune base ouverte et fiable. `mesure_jeu` vaut `null` et la page n'affiche aucun nombre d'images par seconde. Le classement des cartes en jeu (`indice_jeu`) est une estimation éditoriale, validée chaque mois, qui ne sert qu'au choix des machines.

Tant que `source` vaut `"exemple"`, la page ajoute « (Mesures d'exemple.) ».

## Contrôles avant publication

L'agent ne publie pas le fichier si l'un de ces contrôles échoue. Il garde alors la version précédente et prévient Marc.
1. Chaque config est cohérente : un processeur à graphique intégrée renforcée (8600G) n'est jamais associé à une carte graphique, puisqu'il ne sert qu'à s'en passer.
1. Chaque config est compatible : même support processeur et carte mère, et famille du processeur reconnue par la carte (BIOS) ; même type de mémoire ; étage d'alimentation de la carte mère suffisant pour le processeur ; ventirad compatible avec le support, capable de dissiper la `conso_max` du processeur, assez bas (ou radiateur assez petit) pour le boîtier ; format de carte mère accepté par le boîtier ; carte graphique plus courte que la longueur admise ; boîtier capable d'évacuer la chaleur de la carte et du processeur ; alimentation au moins égale au plus grand de ces deux nombres : 1,1 × (carte + `conso_max` du processeur + 100 W), ou l'alimentation recommandée par le fabricant, avec le connecteur 12V-2x6 quand la carte l'exige. Pour chaque couple carte + processeur, l'agent prend l'ensemble carte mère, ventirad, alimentation et boîtier valide le moins cher.
2. Chaque composant utilisé a au moins une offre en stock avec un lien, ou bien une réserve en stock. Seul le ventirad fourni peut valoir 0 €.
3. Chaque profil a au moins un palier, et `plafond` est égal au dernier palier quand il n'est pas `null`.
4. Aucun prix n'a bougé de plus de 30 % depuis la dernière publication (erreur de flux probable) : sinon la publication est bloquée et Marc confirme.
5. L'option deux machines respecte ses trois règles (10 % et 100 € de moins, 5 % de vitesse au plus, jamais moins de mémoire).
6. Taille : environ 280 Ko brut, une vingtaine de Ko compressé. Au-delà de 400 Ko, l'agent signale sans bloquer.

## Intégration sur jurojin.net

- Le shortcode `[configurateur_pc]` (thème JurojiNet, `inc/configurateur.php`) imprime l'outil puis le fichier dans `<script type="application/json" id="configurateur-data">` : aucune requête en plus, rien à attendre. Les styles sont limités au bloc `.cfg-pc` et les identifiants préfixés `cfg-`, pour ne rien casser dans le thème.
- La page hérite de DM Sans servie par le thème. Aucune police n'est chargée par le module.
- Les liens vers les marchands portent `rel="sponsored nofollow noopener"` et s'ouvrent dans un nouvel onglet.
- `image` (facultatif) : photo du produit fournie par le flux du marchand, en https uniquement. La page l'affiche en vignette de taille fixe.
- La licence du système est affichée sous le total, jamais ajoutée dedans.

## Fichiers

- `page.html` : source de la maquette, avec `__DATA__` à la place des données.
- `build.sh` : lance l'essai à sec du vrai agent (mesures réelles de Blender Open Data, prix d'exemple) et produit la maquette complète.
- `build-wp.py` : découpe `page.html` en `outil.html`, `configurateur.css` et `configurateur.js` pour le thème.
