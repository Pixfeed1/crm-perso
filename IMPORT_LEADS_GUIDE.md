# 📊 Système d'Import de Leads - Guide Complet

## ✅ Ce qui a été fait (Backend complet)

### 🔧 Service d'Import (`backend/services/leadImportService.js`)

Un service complet avec toutes les fonctionnalités demandées :

#### 1. **Parsing de Fichiers**
- ✅ Support CSV (csv-parser)
- ✅ Support Excel .xlsx/.xls (xlsx)
- ✅ Détection automatique du format
- ✅ Extraction des en-têtes et données

#### 2. **Mapping Intelligent** (comme HubSpot)
```javascript
const mapping = LeadImportService.intelligentMapping(headers);
// Suggère automatiquement les correspondances :
// "entreprise" → company_name
// "prenom" → contact_firstname
// "e-mail" → email
// etc.
```

Supporte les variantes :
- `company`, `entreprise`, `société`, `raison_sociale` → `company_name`
- `prenom`, `prénom`, `firstname` → `contact_firstname`
- `e-mail`, `mail`, `email_pro` → `email`
- Et bien d'autres...

#### 3. **Validation des Données**
- ✅ **Email valide** : regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- ✅ **Email ou nom obligatoire** : Au moins un des deux requis
- ✅ **Validation ligne par ligne** avec numéro de ligne dans les erreurs

#### 4. **Détection des Doublons**
- ✅ **Par email** : Recherche case-insensitive
- ✅ **Par entreprise + ville** : Si pas d'email
- ✅ **Rapport détaillé** : Quelle ligne, quel doublon trouvé, raison

#### 5. **Nettoyage des Données**
- ✅ **Espaces** : `trim()` + suppression espaces multiples
- ✅ **Accents** : Normalization NFD pour enlever les accents
- ✅ **Email** : Minuscules automatiques
- ✅ **Téléphone** : Garde uniquement chiffres et +

#### 6. **Champs Supportés**

| Champ | Description | Validé |
|-------|-------------|--------|
| `company_name` | Nom entreprise | ✅ |
| `contact_firstname` | Prénom | ✅ |
| `contact_lastname` | Nom | ✅ |
| `email` | Email (format validé) | ✅ |
| `phone` | Téléphone nettoyé | ✅ |
| `city` | Ville | ✅ |
| `postal_code` | Code postal | ✅ |
| `department` | Département | ✅ |
| `country` | Pays | ✅ |
| `sector` | Secteur/NAF | ✅ |
| `website` | Site web | ✅ |
| `source` | Provenance | ✅ |
| `status` | Statut (ou "new" par défaut) | ✅ |
| `notes` | Notes additionnelles | ✅ |

**+ Champs personnalisés** : Tous les autres champs du fichier sont ajoutés dans les `notes`

### 📡 API Endpoints

#### 1. **POST `/api/leads/import/upload`**

Upload et analyse du fichier.

**Request:**
```javascript
FormData {
  file: File (CSV ou Excel)
}
```

**Response:**
```json
{
  "success": true,
  "headers": ["company", "email", "phone", ...],
  "suggestedMapping": {
    "company": "company_name",
    "email": "email",
    "phone": "phone"
  },
  "preview": [
    { "company": "Acme Corp", "email": "contact@acme.com", ... },
    ...
  ],
  "totalRows": 150,
  "sessionId": "1703523..."
}
```

#### 2. **POST `/api/leads/import/execute`**

Exécute l'import avec le mapping fourni.

**Request:**
```javascript
FormData {
  file: File (même fichier que upload),
  mapping: JSON.stringify({
    "company": "company_name",
    "email": "email",
    ...
  }),
  checkDuplicates: "true"
}
```

**Response:**
```json
{
  "success": true,
  "results": {
    "total": 150,
    "success": 142,
    "duplicates": 5,
    "errors": 3,
    "details": {
      "imported": [
        { "row": 2, "id": 1, "name": "Acme Corp" },
        ...
      ],
      "duplicates": [
        {
          "row": 10,
          "data": { ... },
          "reason": "email",
          "existing": { "id": 15, "name": "...", "email": "..." }
        }
      ],
      "errors": [
        {
          "row": 25,
          "data": { ... },
          "errors": ["Email invalide (test@)", "Nom manquant"]
        }
      ]
    }
  }
}
```

### 💾 Fichiers Backend Créés

```
backend/
├── services/
│   └── leadImportService.js       # Service complet (460 lignes)
├── routes/
│   └── leadsRoutes.js             # +156 lignes (2 nouveaux endpoints)
└── uploads/
    └── imports/                    # Dossier pour fichiers temporaires
        └── .gitkeep
```

## 🎨 Frontend À Créer

### 1. Page Leads - Bouton Import

Dans `/frontend/src/pages/Leads.jsx`, ajouter :

```jsx
import LeadImportModal from '../components/leads/LeadImportModal';

const [showImportModal, setShowImportModal] = useState(false);

// Dans le header, à côté du bouton "Nouveau lead" :
<button
  onClick={() => setShowImportModal(true)}
  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg flex items-center gap-2"
>
  <FiUpload />
  Importer des prospects
</button>

{showImportModal && (
  <LeadImportModal
    onClose={() => setShowImportModal(false)}
    onImportComplete={() => {
      setShowImportModal(false);
      fetchLeads(); // Recharger la liste
    }}
  />
)}
```

### 2. Composant LeadImportModal.jsx

Créer `/frontend/src/components/leads/LeadImportModal.jsx` :

**Structure en 4 étapes (stepper)** :

#### Étape 1 : Upload du fichier
- Zone drag & drop
- Accepter CSV et Excel
- Afficher nom + taille du fichier

#### Étape 2 : Mapping des colonnes
- Table avec 3 colonnes :
  1. **Colonne du fichier** (ex: "entreprise")
  2. **Correspondance suggérée** (ex: "company_name") [pré-sélectionné]
  3. **Dropdown pour changer** (tous les champs disponibles)
- Afficher preview des données (5 premières lignes)

#### Étape 3 : Configuration
- Checkbox "Vérifier les doublons" (activé par défaut)
- Afficher nombre de lignes à importer
- Bouton "Lancer l'import"

#### Étape 4 : Résultats
- ✅ **142 leads importés avec succès**
- ⚠️ **5 doublons ignorés**
- ❌ **3 erreurs détectées**
- Liste détaillée avec expand pour voir les détails
- Bouton "Terminé"

### 3. Champs Disponibles pour le Mapping

```javascript
const AVAILABLE_FIELDS = [
  { value: 'company_name', label: 'Nom entreprise' },
  { value: 'contact_firstname', label: 'Prénom contact' },
  { value: 'contact_lastname', label: 'Nom contact' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Téléphone' },
  { value: 'city', label: 'Ville' },
  { value: 'postal_code', label: 'Code postal' },
  { value: 'department', label: 'Département' },
  { value: 'country', label: 'Pays' },
  { value: 'sector', label: 'Secteur' },
  { value: 'website', label: 'Site web' },
  { value: 'source', label: 'Source' },
  { value: 'status', label: 'Statut' },
  { value: 'notes', label: 'Notes' },
  { value: '_ignore', label: '-- Ignorer cette colonne --' }
];
```

## 🔧 Exemple de Fichier CSV

```csv
company,email,phone,city,sector,source
Acme Corp,contact@acme.com,0601020304,Paris,IT,Salon
TechCo,hello@techco.fr,+33612345678,Lyon,Software,API Sirene
BizCorp,info@bizcorp.com,0698765432,Marseille,Consulting,Import HubSpot
```

## 🚀 Comment Tester

1. **Démarrer le serveur backend**
```bash
cd backend
npm run dev
```

2. **Tester l'upload avec curl**
```bash
curl -X POST http://localhost:5000/api/leads/import/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test-leads.csv"
```

3. **Tester l'import avec curl**
```bash
curl -X POST http://localhost:5000/api/leads/import/execute \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@test-leads.csv" \
  -F 'mapping={"company":"company_name","email":"email","phone":"phone"}' \
  -F "checkDuplicates=true"
```

## 📝 TODO Frontend

- [ ] Créer `frontend/src/components/leads/LeadImportModal.jsx`
- [ ] Ajouter le bouton "Importer" dans `frontend/src/pages/Leads.jsx`
- [ ] Créer composant `MappingTable` pour l'étape 2
- [ ] Créer composant `ImportResults` pour l'étape 4
- [ ] Ajouter icône FiUpload depuis react-icons
- [ ] Gérer le state du stepper (4 étapes)
- [ ] Appeler l'API `/api/leads/import/upload`
- [ ] Appeler l'API `/api/leads/import/execute`
- [ ] Afficher la progression avec spinner/barre

## 💡 Conseils d'Implémentation

### FormData pour l'upload
```javascript
const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/leads/import/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  return await response.json();
};
```

### Gestion du Mapping
```javascript
const [mapping, setMapping] = useState({});

// Initialiser avec les suggestions
useEffect(() => {
  if (suggestedMapping) {
    setMapping(suggestedMapping);
  }
}, [suggestedMapping]);

// Changer une correspondance
const handleMappingChange = (fileColumn, dbField) => {
  setMapping(prev => ({
    ...prev,
    [fileColumn]: dbField
  }));
};
```

### Import Execution
```javascript
const executeImport = async () => {
  const formData = new FormData();
  formData.append('file', originalFile);
  formData.append('mapping', JSON.stringify(mapping));
  formData.append('checkDuplicates', checkDuplicates.toString());

  const response = await fetch('/api/leads/import/execute', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  const data = await response.json();
  setResults(data.results);
};
```

## 🎯 Résultat Final Attendu

L'utilisateur doit pouvoir :
1. ✅ Cliquer sur "Importer des prospects"
2. ✅ Drag & drop un fichier CSV/Excel
3. ✅ Voir les correspondances auto-détectées
4. ✅ Ajuster le mapping si besoin
5. ✅ Lancer l'import
6. ✅ Voir un rapport détaillé (succès/doublons/erreurs)
7. ✅ Fermer et voir les nouveaux leads dans la liste

Le tout **intégré dans le menu Leads**, sans nouvelle page.

---

**Backend 100% terminé ✅**
**Frontend à créer (modal + interface) 🎨**
