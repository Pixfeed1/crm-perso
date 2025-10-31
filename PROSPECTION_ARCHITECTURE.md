# 🎯 Outil de Prospection Intelligent - Architecture Technique

## 📋 Vue d'Ensemble

Un système de prospection multi-sources intégré dans le menu **Leads** qui permet de :
1. 🔍 **Détecter des opportunités** via Pôle Emploi, marchés publics
2. 🏢 **Enrichir automatiquement** les fiches entreprises
3. 📊 **Analyser le potentiel** business de chaque prospect
4. 💼 **Convertir** les opportunités en leads qualifiés

## 🏗️ Architecture Globale

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND - Section Prospection           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Recherche   │  │ Enrichissement│  │  Opportunités│      │
│  │  Entreprises │  │    Auto       │  │   Business   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│           BACKEND - Prospection Controller                  │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Orchestration des recherches multi-sources        │     │
│  │  - Parallélisation des appels API                  │     │
│  │  - Fusion et dédoublonnage des résultats          │     │
│  │  - Scoring d'opportunités                          │     │
│  └────────────────────────────────────────────────────┘     │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┬─────────────┐
        │                   │                   │             │
┌───────▼────────┐  ┌───────▼────────┐  ┌──────▼──────┐ ┌───▼───┐
│  API Sirene    │  │  Pôle Emploi   │  │ Data.gouv/  │ │ BOAMP │
│   Service      │  │    Service     │  │  Pappers    │ │Service│
│                │  │                │  │  Service    │ │       │
│ • Infos base   │  │ • Offres       │  │ • Dirigeant │ │• AO   │
│ • Adresse      │  │ • Entreprises  │  │ • Effectif  │ │• Date │
│ • NAF          │  │ • Secteurs     │  │ • Bilan     │ │• Type │
└────────────────┘  └────────────────┘  └─────────────┘ └───────┘
```

## 🔌 APIs Externes - Spécifications

### 1. 🏢 API Sirene (déjà intégré)
**Endpoint :** `https://entreprise.data.gouv.fr/api/sirene/v3/`

**Ce qu'on récupère :**
- SIREN / SIRET
- Nom entreprise
- Adresse complète
- Code NAF / Secteur
- Date de création
- Forme juridique

**Usage :** Base de données entreprises françaises

---

### 2. 💼 API Pôle Emploi
**Endpoint :** `https://api.emploi-store.fr/partenaire/offresdemploi/v2/`

**Documentation :** https://pole-emploi.io/data/api

**Authentification :** OAuth2 (Client ID + Secret)

**Ce qu'on récupère :**
```json
{
  "offres": [
    {
      "id": "123ABC",
      "intitule": "Développeur Web",
      "entreprise": {
        "nom": "Acme Corp",
        "description": "PME innovante..."
      },
      "lieuTravail": {
        "ville": "Paris",
        "codePostal": "75001"
      },
      "typeContrat": "CDI",
      "experienceExige": "2",
      "dateCreation": "2025-10-20",
      "competences": [...]
    }
  ]
}
```

**Opportunités détectables :**
- Entreprise qui recrute massivement → en croissance
- Recherche de profils tech → possible besoin outils/services
- Nouveaux postes marketing → opportunité prestation
- Recherche architectes 3D → projet en cours

**Requêtes utiles :**
```
GET /offres/search?motsCles=refonte+site
GET /offres/search?motsCles=communication
GET /offres/search?motsCles=3D
GET /offres/search?secteurActivite=62
```

---

### 3. 📊 API Pappers / Data.gouv
**Endpoint Pappers :** `https://api.pappers.fr/v2/`
**Endpoint Data.gouv :** `https://entreprise.data.gouv.fr/api/`

**Authentification Pappers :** API Key (gratuit jusqu'à 100 req/j)

**Ce qu'on récupère :**
```json
{
  "siren": "123456789",
  "nom_entreprise": "Acme Corp",
  "dirigeants": [
    {
      "nom": "Dupont",
      "prenom": "Jean",
      "fonction": "Président"
    }
  ],
  "effectif": "50-99",
  "capital": 100000,
  "date_creation": "2020-01-15",
  "chiffre_affaires": 5000000,
  "resultat": 250000,
  "site_web": "https://acme.com",
  "beneficiaire_effectif": {...}
}
```

**Enrichissement automatique :**
- Nom du dirigeant → création contact automatique
- Effectif + CA → scoring de potentiel
- Site web → vérification présence en ligne
- Résultat net → santé financière

---

### 4. 📄 API Marchés Publics (BOAMP)
**Endpoint :** `https://data.economie.gouv.fr/api/records/1.0/search/`
**Dataset :** `dataset=boamp`

**Ce qu'on récupère :**
```json
{
  "records": [
    {
      "fields": {
        "objet": "Refonte du site internet institutionnel",
        "acheteur_nom": "Mairie de Paris",
        "type_marche": "Prestations de services",
        "code_cpv": "72212000",  // Services de conception web
        "montant_min": 50000,
        "montant_max": 150000,
        "date_publication": "2025-10-15",
        "date_limite_reponse": "2025-11-15",
        "url_dce": "https://..."
      }
    }
  ]
}
```

**Opportunités détectables :**
- Marchés web/communication en cours
- Projets architecture 3D
- Prestations en cohérence avec ton activité
- Analyse des montants pour qualifier

**Filtres utiles :**
```
q=refonte+site
q=communication
q=3D+architecture
q=prestations+graphiques
facet=type_marche
```

---

## 🎯 Cas d'Usage Principaux

### Cas 1 : Recherche d'Opportunités
**Utilisateur :** "Je cherche des entreprises qui recrutent dans le web à Paris"

**Flux :**
1. Frontend → Recherche "web + Paris"
2. Backend appelle **en parallèle** :
   - Pôle Emploi : offres web à Paris
   - BOAMP : marchés web à Paris
3. Fusion des résultats
4. Pour chaque entreprise trouvée :
   - Enrichir avec Sirene (infos de base)
   - Enrichir avec Pappers (dirigeant, CA, effectif)
5. Scoring automatique (voir section Scoring)
6. Affichage des résultats triés

**Résultat :**
```
┌─────────────────────────────────────────────────────┐
│ Acme Corp - Paris 15ème                    Score: 85│
│ ────────────────────────────────────────────────────│
│ 🎯 Opportunités:                                    │
│  • Recrute 3 développeurs web (CDI)                 │
│  • A remporté un marché "refonte site" (80k€)       │
│                                                      │
│ 📊 Données enrichies:                               │
│  • Effectif: 50-99 salariés                         │
│  • CA: 5M€ (+15% vs N-1)                           │
│  • Dirigeant: Jean Dupont (Président)               │
│                                                      │
│ [Créer un Lead] [Enrichir existant] [Ignorer]      │
└─────────────────────────────────────────────────────┘
```

---

### Cas 2 : Enrichissement Automatique
**Utilisateur :** "J'ai un lead 'Acme Corp' avec juste le nom et la ville"

**Flux :**
1. Clic sur "Enrichir automatiquement"
2. Backend cherche :
   - Sirene : SIREN + infos officielles
   - Pappers : dirigeant, CA, effectif, site web
   - Pôle Emploi : offres en cours
   - BOAMP : marchés en cours ou passés
3. Mise à jour automatique du lead :
   - Nom du dirigeant → création contact
   - Site web + email → ajout coordonnées
   - Offres/marchés → ajout dans notes
   - Scoring recalculé

**Résultat :**
```
Lead enrichi :
✅ Contact créé : Jean Dupont (Président)
✅ Site web ajouté : https://acme.com
✅ 3 opportunités détectées
✅ Score potentiel : 85/100
```

---

### Cas 3 : Veille Marchés Publics
**Utilisateur :** "Surveiller les marchés web > 50k€"

**Flux :**
1. Configuration d'une alerte :
   - Mots-clés : "refonte site", "communication digitale"
   - Montant min : 50 000€
   - Fréquence : hebdomadaire
2. Chaque semaine, backend :
   - Interroge BOAMP avec les critères
   - Pour chaque marché trouvé :
     - Crée un lead "Acheteur"
     - Enrichit avec Sirene/Pappers
     - Ajoute infos marché dans notes
3. Notification frontend : "5 nouveaux marchés cette semaine"

---

## 📊 Système de Scoring

Calcul automatique du **potentiel business** d'un prospect :

```javascript
function calculateScore(prospect) {
  let score = 0;

  // Opportunités actives (+40 points max)
  if (prospect.offres_emploi > 0) score += 15;
  if (prospect.marches_publics > 0) score += 25;

  // Santé financière (+30 points max)
  if (prospect.ca > 1000000) score += 10;
  if (prospect.resultat > 0) score += 10;
  if (prospect.tendance_ca > 0) score += 10;  // Croissance

  // Taille (+20 points max)
  if (prospect.effectif === '50-99') score += 10;
  if (prospect.effectif === '100-199') score += 15;
  if (prospect.effectif === '200+') score += 20;

  // Secteur d'activité (+10 points max)
  const secteursPrioritaires = ['62', '63', '73'];  // IT, Communication
  if (secteursPrioritaires.includes(prospect.naf_code)) score += 10;

  return Math.min(score, 100);
}
```

**Niveaux :**
- 🔥 85-100 : Chaud (priorité haute)
- 🌟 65-84 : Intéressant (à contacter)
- 💡 40-64 : Potentiel (à surveiller)
- ❄️ 0-39 : Froid (faible priorité)

---

## 🛠️ Stack Technique

### Backend
```
backend/
├── services/
│   ├── sireneService.js           (existant)
│   ├── poleEmploiService.js       (NOUVEAU)
│   ├── dataGouvService.js         (NOUVEAU)
│   ├── boampService.js            (NOUVEAU)
│   └── prospectionService.js      (NOUVEAU - orchestration)
│
├── controllers/
│   └── prospectionController.js   (NOUVEAU)
│
└── routes/
    └── prospectionRoutes.js       (NOUVEAU)
```

### Frontend
```
frontend/src/
├── components/leads/
│   ├── ProspectionPanel.jsx       (NOUVEAU - onglet dans Leads)
│   ├── OpportunityCard.jsx        (NOUVEAU)
│   ├── EnrichmentButton.jsx       (NOUVEAU)
│   └── ProspectionFilters.jsx     (NOUVEAU)
│
└── services/
    └── prospectionAPI.js          (NOUVEAU)
```

---

## 🔑 Clés API Nécessaires

### 1. Pôle Emploi
```bash
# Dans .env
POLE_EMPLOI_CLIENT_ID=your_client_id
POLE_EMPLOI_CLIENT_SECRET=your_secret
POLE_EMPLOI_SCOPE=api_offresdemploiv2 o2dsoffre
```

**Obtenir les clés :** https://pole-emploi.io/inscription

### 2. Pappers (optionnel)
```bash
PAPPERS_API_KEY=your_api_key
```

**Obtenir la clé :** https://www.pappers.fr/api (gratuit 100 req/j)

### 3. Data.gouv / BOAMP
✅ **Pas de clé nécessaire** - API publique

---

## 📡 Endpoints API

### 1. Recherche d'Opportunités
```
POST /api/prospection/search
{
  "query": "web paris",
  "sources": ["pole-emploi", "boamp"],
  "filters": {
    "effectif_min": 10,
    "montant_min": 50000
  }
}

Response:
{
  "opportunities": [
    {
      "source": "pole-emploi",
      "type": "offre_emploi",
      "entreprise": {...},
      "details": {...},
      "score": 85
    }
  ],
  "enrichedCompanies": [...]
}
```

### 2. Enrichissement Lead
```
POST /api/prospection/enrich/:leadId
{
  "sources": ["sirene", "pappers", "pole-emploi", "boamp"]
}

Response:
{
  "enriched": {
    "dirigeant": "Jean Dupont",
    "effectif": "50-99",
    "ca": 5000000,
    "site_web": "https://...",
    "opportunities": [...]
  },
  "contactsCreated": 1,
  "score": 85
}
```

### 3. Veille Marchés
```
POST /api/prospection/marches/watch
{
  "keywords": ["refonte site", "communication"],
  "montant_min": 50000,
  "frequency": "weekly"
}
```

---

## 🎨 Interface Frontend

### Onglet "Prospection" dans Leads

```
┌────────────────────────────────────────────────────────┐
│  LEADS                                                 │
│  [Liste] [Kanban] [Prospection] ← NOUVEAU             │
├────────────────────────────────────────────────────────┤
│                                                        │
│  🔍 Rechercher des Opportunités                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Mots-clés: [web développement        ] [Search] │ │
│  │                                                  │ │
│  │ Sources: ☑ Pôle Emploi  ☑ Marchés publics      │ │
│  │         ☑ Enrichissement auto                  │ │
│  │                                                  │ │
│  │ Filtres: Effectif [10+] CA [1M+] Ville [Paris] │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  📊 Résultats (15 opportunités)                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │ 🔥 Score 92 - Acme Corp - Paris                │ │
│  │ • Recrute 5 devs web (CDI) - Publié il y a 2j │ │
│  │ • Marché "Refonte site" (120k€) en cours       │ │
│  │ • Effectif: 75 | CA: 8M€ (+20%)                │ │
│  │ [→ Créer Lead] [Enrichir existant #234]       │ │
│  ├──────────────────────────────────────────────────┤ │
│  │ 🌟 Score 78 - TechCo - Lyon                   │ │
│  │ ...                                              │ │
│  └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Plan d'Implémentation

### Phase 1 : Base (Services API)
1. ✅ Service Sirene (existant)
2. ⬜ Service Pôle Emploi
3. ⬜ Service Data.gouv/Pappers
4. ⬜ Service BOAMP

### Phase 2 : Orchestration
1. ⬜ Prospection Service (fusion multi-sources)
2. ⬜ Scoring automatique
3. ⬜ Dédoublonnage entreprises

### Phase 3 : API Routes
1. ⬜ POST /prospection/search
2. ⬜ POST /prospection/enrich/:leadId
3. ⬜ POST /prospection/marches/watch

### Phase 4 : Frontend
1. ⬜ Onglet Prospection dans Leads
2. ⬜ Interface de recherche
3. ⬜ Cartes d'opportunités
4. ⬜ Bouton enrichissement auto

---

## 💡 Optimisations

### Cache Redis (futur)
- Cache des requêtes API (1h)
- Évite appels redondants
- Réduit latence

### Webhooks (futur)
- Pôle Emploi peut notifier nouvelles offres
- Mise à jour automatique du CRM

### ML Scoring (futur)
- Apprentissage sur leads convertis
- Amélioration du scoring au fil du temps

---

## 📝 Questions Ouvertes

1. **Limites API :**
   - Pôle Emploi : combien de requêtes/jour ?
   - Pappers : 100 req/j gratuit, suffit ?

2. **Stockage :**
   - Créer table `opportunities` ?
   - Ou juste enrichir leads existants ?

3. **UX :**
   - Onglet séparé ou bouton dans liste leads ?
   - Notification quand nouvelles opps ?

**Je recommande de commencer par Phase 1 + 2, puis on voit.**
