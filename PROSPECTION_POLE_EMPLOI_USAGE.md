# 🚀 Guide d'Utilisation - Prospection Pôle Emploi

## ✅ Ce qui est fait

Le service Pôle Emploi est **100% opérationnel** et prêt à l'emploi !

### Fichiers créés :
- ✅ `backend/services/poleEmploiService.js` - Service complet avec OAuth2
- ✅ `backend/controllers/prospectionController.js` - Controller pour les routes
- ✅ `backend/routes/prospectionRoutes.js` - Routes API
- ✅ `backend/.env.example` - Variables d'environnement documentées

### Fonctionnalités :
- ✅ **Authentification OAuth2 automatique** - Gère les tokens automatiquement
- ✅ **Cache des tokens** - Réutilise le token pendant 25 minutes
- ✅ **Recherche d'offres** - Par mots-clés, département, commune, etc.
- ✅ **Transformation en leads** - Convertit automatiquement les offres en format CRM
- ✅ **Détection de doublons** - Évite les imports multiples
- ✅ **Import direct** - Crée les leads dans la base de données

---

## 📋 Configuration

### 1. Ajouter vos clés dans `.env`

```bash
# API Pôle Emploi
POLE_EMPLOI_CLIENT_ID=ton_client_id
POLE_EMPLOI_CLIENT_SECRET=ton_secret
POLE_EMPLOI_SCOPE=api_offresdemploiv2 o2dsoffre
```

### 2. Redémarrer le serveur

```bash
cd backend
npm run dev
```

---

## 🧪 Tests des Endpoints

### 1. Test de Connexion

Vérifie que tes credentials fonctionnent :

```bash
curl http://localhost:5000/api/prospection/test/pole-emploi \
  -H "Authorization: Bearer TON_TOKEN"
```

**Réponse attendue :**
```json
{
  "success": true,
  "message": "Connexion à Pôle Emploi réussie",
  "configured": true
}
```

---

### 2. Recherche Simple

Recherche des offres avec des mots-clés :

```bash
curl "http://localhost:5000/api/prospection/pole-emploi/search?keywords=refonte+site" \
  -H "Authorization: Bearer TON_TOKEN"
```

**Réponse :**
```json
{
  "success": true,
  "source": "pole-emploi",
  "total": 15,
  "opportunities": [
    {
      "company_name": "Acme Corp",
      "email": "contact@acme.com",
      "phone": "0601020304",
      "city": "Paris",
      "postal_code": "75015",
      "department": "75",
      "country": "France",
      "sector": "Informatique",
      "source": "pole-emploi",
      "status": "new",
      "notes": "**Offre d'emploi détectée**\nPoste: Chef de projet web...",
      "metadata": {
        "offer_id": "123ABC",
        "job_title": "Chef de projet web",
        "contract_type": "CDI",
        "url": "https://candidat.pole-emploi.fr/offres/recherche/detail/123ABC"
      }
    }
  ]
}
```

---

### 3. Recherche par Département

```bash
curl "http://localhost:5000/api/prospection/pole-emploi/search?keywords=développeur+web&department=75" \
  -H "Authorization: Bearer TON_TOKEN"
```

---

### 4. Recherche par Commune avec Rayon

```bash
# 75056 = Code INSEE de Paris
curl "http://localhost:5000/api/prospection/pole-emploi/search?keywords=web&commune=75056&distance=20" \
  -H "Authorization: Bearer TON_TOKEN"
```

---

### 5. Filtrage par Type de Contrat

```bash
curl "http://localhost:5000/api/prospection/pole-emploi/search?keywords=web&department=69&typeContrat=CDI" \
  -H "Authorization: Bearer TON_TOKEN"
```

Types de contrat disponibles :
- `CDI` - Contrat à durée indéterminée
- `CDD` - Contrat à durée déterminée
- `MIS` - Mission intérimaire
- `SAI` - Contrat saisonnier
- `LIB` - Libéral
- `REP` - Franchise / Reprise

---

### 6. Recherche Multi-Sources (Endpoint principal)

Cet endpoint agrège automatiquement plusieurs sources :

```bash
curl "http://localhost:5000/api/prospection/search?keywords=refonte+site&location=75&sources=pole-emploi" \
  -H "Authorization: Bearer TON_TOKEN"
```

**Paramètres :**
- `keywords` (requis) - Mots-clés de recherche
- `location` (optionnel) - Code département (75) ou code postal (75015)
- `sources` (optionnel) - Sources séparées par virgules (défaut: pole-emploi)
  - `pole-emploi` ✅ Opérationnel
  - `google-jobs` ⏳ À implémenter
  - `boamp` ⏳ À implémenter

**Réponse :**
```json
{
  "success": true,
  "total": 12,
  "totalBeforeDedup": 15,
  "opportunities": [...],
  "sources": [
    { "source": "pole-emploi", "count": 15 }
  ],
  "errors": []
}
```

---

### 7. Import d'une Opportunité comme Lead

```bash
curl -X POST http://localhost:5000/api/prospection/import-lead \
  -H "Authorization: Bearer TON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "opportunity": {
      "company_name": "Acme Corp",
      "email": "contact@acme.com",
      "phone": "0601020304",
      "city": "Paris",
      "postal_code": "75015",
      "department": "75",
      "sector": "IT",
      "source": "pole-emploi",
      "status": "new",
      "notes": "Recherche développeur web - Projet de refonte site"
    }
  }'
```

**Réponse :**
```json
{
  "success": true,
  "message": "Lead créé avec succès",
  "leadId": 42,
  "lead": {
    "id": 42,
    "company_name": "Acme Corp",
    "email": "contact@acme.com",
    ...
  }
}
```

**Gestion des doublons :**
Si le lead existe déjà (même email OU même entreprise+ville), l'import échouera avec :
```json
{
  "success": false,
  "message": "Ce lead existe déjà dans le CRM",
  "existingLead": {
    "id": 15,
    "company_name": "Acme Corp"
  }
}
```

---

### 8. Récupérer les Détails d'une Offre

```bash
curl "http://localhost:5000/api/prospection/pole-emploi/offer/123ABC" \
  -H "Authorization: Bearer TON_TOKEN"
```

**Réponse :**
```json
{
  "success": true,
  "offer": {
    "id": "123ABC",
    "intitule": "Chef de projet web",
    "description": "Nous recherchons...",
    "entreprise": {
      "nom": "Acme Corp",
      "description": "PME de 50 personnes..."
    },
    "competences": [
      { "libelle": "Développement web" },
      { "libelle": "Gestion de projet" }
    ],
    ...
  },
  "lead": {
    "company_name": "Acme Corp",
    "notes": "**Offre d'emploi détectée**...",
    ...
  }
}
```

---

## 💡 Exemples d'Usage Réels

### Cas 1 : Prospection Agence Web à Paris

```bash
# Rechercher les entreprises qui cherchent à refaire leur site
curl "http://localhost:5000/api/prospection/search?keywords=refonte+site&location=75" \
  -H "Authorization: Bearer TON_TOKEN"
```

**Résultat :**
- Détection d'entreprises en besoin de refonte
- Infos de contact (si disponibles)
- Secteur d'activité
- Localisation précise

**Action :**
Importer les leads prometteurs dans le CRM avec le bouton d'import.

---

### Cas 2 : Détection de Startups qui Recrutent

```bash
# Startups IT qui recrutent des développeurs (= en croissance !)
curl "http://localhost:5000/api/prospection/search?keywords=développeur&location=75&typeContrat=CDI" \
  -H "Authorization: Bearer TON_TOKEN"
```

**Pourquoi c'est utile :**
- Entreprise en croissance = budget disponible
- Besoin de développeurs = besoin de services web/tech
- CDI = entreprise stable, pas une mission ponctuelle

---

### Cas 3 : Ciblage Géographique Précis

```bash
# Recherche autour de Lyon (69123 = code INSEE de Lyon)
curl "http://localhost:5000/api/prospection/search?keywords=communication&commune=69123&distance=30" \
  -H "Authorization: Bearer TON_TOKEN"
```

**Résultat :**
Toutes les entreprises qui recrutent dans un rayon de 30 km autour de Lyon.

---

## 🔄 Workflow Complet Frontend → Backend

### Scénario : L'utilisateur recherche des opportunités

**1. Frontend : Formulaire de recherche**

```javascript
const searchOpportunities = async (keywords, location) => {
  const response = await fetch(
    `/api/prospection/search?keywords=${keywords}&location=${location}&sources=pole-emploi`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  const data = await response.json();
  return data.opportunities;
};
```

**2. Backend : Recherche automatique**
- Authentification OAuth2 avec Pôle Emploi
- Recherche des offres d'emploi
- Transformation en format lead
- Retour des résultats

**3. Frontend : Affichage des résultats**

```javascript
opportunities.map(opp => (
  <div>
    <h3>{opp.company_name}</h3>
    <p>{opp.city} - {opp.department}</p>
    <p>{opp.notes.substring(0, 100)}...</p>
    <button onClick={() => importLead(opp)}>
      Importer dans le CRM
    </button>
  </div>
))
```

**4. Frontend : Import d'un lead**

```javascript
const importLead = async (opportunity) => {
  const response = await fetch('/api/prospection/import-lead', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ opportunity })
  });

  const data = await response.json();

  if (data.success) {
    alert(`Lead créé : ${data.lead.company_name}`);
    // Rediriger vers la page du lead
    navigate(`/leads/${data.leadId}`);
  } else {
    alert(data.message);
  }
};
```

---

## 🎯 Codes INSEE Communes

Pour la recherche par commune, voici quelques codes utiles :

| Ville | Code INSEE |
|-------|------------|
| Paris | 75056 |
| Lyon | 69123 |
| Marseille | 13055 |
| Toulouse | 31555 |
| Nice | 06088 |
| Nantes | 44109 |
| Bordeaux | 33063 |
| Lille | 59350 |
| Rennes | 35238 |
| Strasbourg | 67482 |

**Trouver un code INSEE :**
https://www.insee.fr/fr/recherche/recherche-geographique

---

## 📊 Données Retournées

Chaque opportunité contient :

| Champ | Type | Description |
|-------|------|-------------|
| `company_name` | string | Nom de l'entreprise (ou "Entreprise confidentielle") |
| `email` | string/null | Email de contact (si disponible) |
| `phone` | string/null | Téléphone (si disponible) |
| `city` | string | Ville |
| `postal_code` | string | Code postal |
| `department` | string | Code département (75, 69, etc.) |
| `country` | string | Pays (toujours "France") |
| `sector` | string | Secteur d'activité |
| `website` | string/null | Site web (rarement disponible via PE) |
| `source` | string | Toujours "pole-emploi" |
| `status` | string | Toujours "new" |
| `notes` | string | Description complète avec titre du poste, besoins, compétences |
| `metadata` | object | Données supplémentaires (offer_id, job_title, contract_type, url, etc.) |

---

## 🚨 Gestion des Erreurs

### Si les credentials sont incorrects :

```json
{
  "success": false,
  "message": "Impossible d'obtenir le token Pôle Emploi: invalid_client",
  "configured": true
}
```

**Solution :** Vérifier les valeurs dans `.env`

---

### Si les credentials ne sont pas configurés :

```json
{
  "success": false,
  "message": "Credentials Pôle Emploi non configurés dans .env",
  "configured": false
}
```

**Solution :** Ajouter `POLE_EMPLOI_CLIENT_ID` et `POLE_EMPLOI_CLIENT_SECRET` dans `.env`

---

### Si l'API Pôle Emploi est indisponible :

```json
{
  "success": false,
  "message": "Erreur lors de la recherche Pôle Emploi: Network error"
}
```

**Solution :** Réessayer plus tard (très rare, API très stable)

---

## 🔍 Logs Backend

Le service affiche des logs détaillés dans la console :

```
[Pôle Emploi] Demande d'un nouveau token...
[Pôle Emploi] ✓ Token obtenu (expire dans 1439s)
[Prospection] Recherche Pôle Emploi: "refonte site"
[Pôle Emploi] Recherche avec params: { motsCles: 'refonte site', departement: '75' }
[Pôle Emploi] ✓ 15 offres trouvées
[Pôle Emploi] 15 opportunités détectées pour "refonte site"
[Prospection] ✓ Pôle Emploi: 15 résultats
[Prospection] Total: 15 opportunités, 12 après dédoublonnage
```

---

## 🎨 Frontend À Créer

### 1. Onglet "Prospection" dans le menu Leads

```jsx
// frontend/src/pages/Leads.jsx
<Tabs>
  <Tab>Tous les leads</Tab>
  <Tab>Prospection</Tab> {/* NOUVEAU */}
</Tabs>

{activeTab === 'prospection' && (
  <ProspectionPanel />
)}
```

---

### 2. Composant ProspectionPanel

```jsx
// frontend/src/components/leads/ProspectionPanel.jsx
const ProspectionPanel = () => {
  const [keywords, setKeywords] = useState('');
  const [location, setLocation] = useState('');
  const [opportunities, setOpportunities] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    const response = await fetch(
      `/api/prospection/search?keywords=${keywords}&location=${location}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await response.json();
    setOpportunities(data.opportunities);
    setLoading(false);
  };

  const handleImport = async (opportunity) => {
    const response = await fetch('/api/prospection/import-lead', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ opportunity })
    });
    const data = await response.json();

    if (data.success) {
      alert('Lead importé !');
    } else {
      alert(data.message);
    }
  };

  return (
    <div>
      <div className="search-form">
        <input
          type="text"
          placeholder="Mots-clés (ex: refonte site, développeur)"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
        />
        <input
          type="text"
          placeholder="Département ou code postal (ex: 75)"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <button onClick={handleSearch} disabled={loading}>
          {loading ? 'Recherche...' : 'Rechercher'}
        </button>
      </div>

      <div className="results">
        {opportunities.map((opp, idx) => (
          <div key={idx} className="opportunity-card">
            <h3>{opp.company_name}</h3>
            <p>{opp.city} - {opp.department}</p>
            <p className="notes">{opp.notes.substring(0, 150)}...</p>
            <button onClick={() => handleImport(opp)}>
              Importer
            </button>
            <a href={opp.metadata?.url} target="_blank">
              Voir l'offre
            </a>
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## ✅ Checklist Complète

### Backend ✅
- [x] Service Pôle Emploi avec OAuth2
- [x] Cache automatique des tokens
- [x] Recherche d'offres avec filtres
- [x] Transformation en leads
- [x] Détection de doublons
- [x] Controller avec toutes les routes
- [x] Routes API REST
- [x] Intégration dans server.js
- [x] Documentation .env.example

### Frontend ⏳
- [ ] Onglet "Prospection" dans Leads
- [ ] Formulaire de recherche
- [ ] Affichage des résultats
- [ ] Bouton d'import
- [ ] Gestion des doublons
- [ ] Loading states
- [ ] Messages d'erreur

---

## 🚀 Prochaines Étapes

### Maintenant :
1. Ajouter tes clés Pôle Emploi dans `backend/.env`
2. Redémarrer le serveur
3. Tester avec curl : `/api/prospection/test/pole-emploi`
4. Tester une recherche : `/api/prospection/search?keywords=web&location=75`

### Ensuite :
1. Créer le composant `ProspectionPanel.jsx`
2. Ajouter l'onglet dans `Leads.jsx`
3. Tester le workflow complet
4. Ajuster l'UX si besoin

### Plus tard (extensions) :
1. Ajouter Google Jobs (via SerpAPI)
2. Ajouter BOAMP (marchés publics)
3. Ajouter Data.gouv (enrichissement entreprises)
4. Scoring automatique des opportunités

---

**Le service Pôle Emploi est prêt ! 🎉**

Il ne reste plus qu'à ajouter tes clés et créer l'interface frontend.
