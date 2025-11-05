# 🔧 Correction de l'erreur PDF "autoTable is not a function"

## Problème

Erreur lors de l'export PDF : `e.autoTable is not a function`

## Cause

Le package `jspdf-autotable` n'était pas correctement importé avec jsPDF version 3.x.

## Solution appliquée

### 1. Correction de l'import dans Reports.jsx

**AVANT :**
```javascript
import jsPDF from 'jspdf';
import 'jspdf-autotable';
```

**APRÈS :**
```javascript
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
```

### 2. Installation des packages

Le package.json contient déjà les bonnes versions :
- `jspdf`: ^3.0.3
- `jspdf-autotable`: ^5.0.2

## Comment réinstaller si nécessaire

Si l'erreur persiste, suivez ces étapes :

### Étape 1 : Nettoyer le cache

```bash
cd frontend
rm -rf node_modules
rm package-lock.json
```

### Étape 2 : Réinstaller les dépendances

```bash
npm install
```

### Étape 3 : Vérifier l'installation

```bash
npm list jspdf jspdf-autotable
```

Vous devriez voir :
```
├── jspdf@3.0.3
└── jspdf-autotable@5.0.2
```

### Étape 4 : Redémarrer le serveur de développement

```bash
npm start
```

## Comment tester l'export PDF

1. Lancer l'application
2. Aller sur la page **Reports** (Rapports)
3. Cliquer sur le bouton **"Exporter en PDF"**
4. Un fichier PDF devrait se télécharger avec :
   - Résumé des KPIs
   - Analyse de conversion des leads
   - Performance par source
   - Évolution des revenus

## Exemple d'utilisation correct de jsPDF + autoTable

```javascript
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const exportToPDF = () => {
  const doc = new jsPDF();

  doc.text('Mon Rapport', 14, 20);

  doc.autoTable({
    startY: 30,
    head: [['Colonne 1', 'Colonne 2']],
    body: [
      ['Valeur 1', 'Valeur 2'],
      ['Valeur 3', 'Valeur 4']
    ],
    theme: 'grid'
  });

  doc.save('rapport.pdf');
};
```

## Documentation officielle

- jsPDF : https://github.com/parallax/jsPDF
- jspdf-autotable : https://github.com/simonbengtsson/jsPDF-AutoTable

## Notes importantes

1. **Import nommé** : Avec jsPDF 3.x, utiliser `import { jsPDF }` au lieu de `import jsPDF`
2. **autoTable est automatiquement ajouté** : Après l'import de `jspdf-autotable`, la méthode `doc.autoTable()` est disponible
3. **Versions compatibles** : jsPDF 3.x fonctionne avec jspdf-autotable 5.x

## Si le problème persiste

### Vérifier la version de Node.js

```bash
node --version
# Devrait être >= 14.x
```

### Vérifier les conflits de packages

```bash
cd frontend
npm ls jspdf
```

### Forcer une réinstallation propre

```bash
cd frontend
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### Vérifier le build

```bash
cd frontend
npm run build
```

Si le build réussit sans erreur, le problème est résolu.

## Fichiers modifiés

- ✅ `frontend/src/pages/Reports.jsx` - Import corrigé
- ✅ `frontend/package.json` - Packages déjà présents
- ✅ `FIX_PDF_EXPORT.md` - Ce guide

## Résultat attendu

Après ces corrections, l'export PDF devrait fonctionner sans erreur et générer un rapport professionnel avec des tableaux formatés.
