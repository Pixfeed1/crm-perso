# 📊 Système d'Exports - Guide d'Utilisation

## ✅ Ce qui est Implémenté

### Backend (100% Fonctionnel)

#### 📦 Bibliothèques Installées
- **exceljs** - Génération de fichiers Excel (.xlsx)
- **pdfkit** - Génération de fichiers PDF

#### 🛠️ Utilitaires Créés

**`backend/utils/excelExport.js`**
- `exportLeadsToExcel(leads)` - Export leads en Excel avec formatage
- `exportProjectsToExcel(projects)` - Export projets en Excel
- `exportRevenuesToExcel(revenues)` - Export revenus avec calcul total
- `exportCustomReport(data)` - Rapport personnalisé multi-feuilles

**`backend/utils/pdfExport.js`**
- `exportAnalyticsToPDF(data)` - Export statistiques analytics en PDF
- `exportLeadsToPDF(leads)` - Export leads en PDF avec statistiques

#### 🌐 Routes API Disponibles

**GET** `/api/export/leads/excel` - Exporter leads en Excel
**GET** `/api/export/leads/pdf` - Exporter leads en PDF
**GET** `/api/export/projects/excel` - Exporter projets en Excel
**GET** `/api/export/revenues/excel` - Exporter revenus en Excel
**GET** `/api/export/analytics/pdf` - Exporter analytics en PDF
**POST** `/api/export/custom` - Créer un rapport personnalisé

Toutes les routes sont protégées par authentification et permissions.

### Frontend

#### 🎨 Composants Créés

**`frontend/src/components/exports/ExportButton.jsx`**
- Composant réutilisable avec état de chargement
- Gestion automatique du téléchargement
- Gestion des erreurs
- Animations Framer Motion

**`frontend/src/components/exports/ExportButtons.jsx`**
- `LeadsExportButtons` - Boutons Excel + PDF pour leads
- `ProjectsExportButtons` - Bouton Excel pour projets
- `RevenuesExportButtons` - Bouton Excel pour revenus
- `AnalyticsExportButtons` - Bouton PDF pour analytics

## 🚀 Comment Utiliser dans le Frontend

### Exemple 1: Ajouter les exports aux Leads

```jsx
// Dans src/pages/Leads.jsx
import { LeadsExportButtons } from '../components/exports/ExportButtons';

// Dans le render, ajouter dans le header:
<div className="flex items-center justify-between mb-6">
  <h1>Gestion des Leads</h1>
  <div className="flex gap-3">
    <LeadsExportButtons />
    {/* Autres boutons */}
  </div>
</div>
```

### Exemple 2: Ajouter les exports aux Projects

```jsx
// Dans src/pages/Projects.jsx
import { ProjectsExportButtons } from '../components/exports/ExportButtons';

<div className="flex items-center justify-between mb-6">
  <h1>Mes Projets</h1>
  <ProjectsExportButtons />
</div>
```

### Exemple 3: Ajouter les exports aux Revenues

```jsx
// Dans src/pages/Revenues.jsx
import { RevenuesExportButtons } from '../components/exports/ExportButtons';

<div className="flex items-center justify-between mb-6">
  <h1>Revenus</h1>
  <RevenuesExportButtons />
</div>
```

### Exemple 4: Ajouter les exports aux Analytics

```jsx
// Dans src/pages/Analytics.jsx
import { AnalyticsExportButtons } from '../components/exports/ExportButtons';

<div className="flex items-center justify-between mb-6">
  <h1>Analytics Avancés</h1>
  <AnalyticsExportButtons />
</div>
```

## 📋 Format des Exports

### Excel (.xlsx)

**Leads:**
- Colonnes: ID, Nom, Entreprise, Email, Téléphone, Type, Statut, Source, Date de création
- En-tête coloré (indigo)
- Filtres automatiques
- Format professionnel

**Projects:**
- Colonnes: ID, Nom, Type, Description, Statut, Montant, Progression, Dates, Lead associé
- En-tête coloré (purple)
- Filtres automatiques

**Revenues:**
- Colonnes: ID, Montant, Description, Source, Statut, Date, Méthode, Projet
- En-tête coloré (emerald)
- **Ligne de total** automatique
- Filtres automatiques

### PDF

**Leads:**
- En-tête avec date et nombre total
- Statistiques par statut
- Liste des 20 premiers leads
- Formatage professionnel

**Analytics:**
- Section ROI (revenus, coûts, profit, top 5 projets)
- Section Productivité (heures, efficacité)
- Section Revenus (totaux, tendances, meilleur mois)
- Section Performance (score santé, métriques, recommandations)
- Design moderne avec couleurs

## 🔧 Rapport Personnalisé

### Endpoint POST /api/export/custom

**Body:**
```json
{
  "includeLeads": true,
  "includeProjects": true,
  "includeRevenues": true,
  "dateFrom": "2024-01-01",
  "dateTo": "2024-12-31"
}
```

**Retourne:** Fichier Excel multi-feuilles avec résumé et données

## 🎨 Personnalisation

### Modifier les couleurs des en-têtes Excel

Dans `backend/utils/excelExport.js`:

```javascript
worksheet.getRow(1).fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFVOTRE_COULEUR' } // Format ARGB
};
```

### Ajouter des colonnes

```javascript
worksheet.columns = [
  { header: 'Nouvelle Colonne', key: 'new_column', width: 20 },
  // ...
];
```

### Personnaliser le PDF

Dans `backend/utils/pdfExport.js`, modifier les fonctions `addSection()` et `addMetric()`.

## 🔒 Sécurité

- ✅ Toutes les routes protégées par JWT
- ✅ Permissions vérifiées (requirePermission('read'))
- ✅ Données filtrées par user_id
- ✅ Pas de données sensibles dans les exports

## 📈 Performance

- Exports asynchrones pour ne pas bloquer le serveur
- Streaming des fichiers pour économiser la mémoire
- Gestion des erreurs complète
- Timeout de 30s par défaut

## ✨ Fonctionnalités Futures (Optionnel)

- [ ] Export CSV en plus d'Excel
- [ ] Planification d'exports automatiques
- [ ] Envoi par email des exports
- [ ] Export JSON pour API
- [ ] Graphiques dans les PDF
- [ ] Templates d'export personnalisables
- [ ] Compression ZIP pour gros exports

## 🐛 Dépannage

**Problème:** Export vide
**Solution:** Vérifier que l'utilisateur a des données dans sa base

**Problème:** Erreur 403
**Solution:** Vérifier le token JWT et les permissions

**Problème:** Téléchargement ne démarre pas
**Solution:** Vérifier les headers CORS et Content-Disposition

**Problème:** PDF corrompu
**Solution:** S'assurer que toutes les données analytics sont disponibles
