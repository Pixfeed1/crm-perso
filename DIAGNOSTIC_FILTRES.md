# 🔧 Guide de diagnostic des filtres avancés

## Problème résolu

Les filtres avancés ne s'ouvraient pas ou les valeurs n'étaient pas visibles.

### Corrections appliquées :

1. ✅ **Correction des couleurs de texte**
   - Remplacement de `text-black` par `text-white` dans tous les inputs, selects et dates
   - Les champs sont maintenant visibles sur fond sombre

2. ✅ **Ajout de curseur pointer**
   - Ajout de `cursor-pointer` sur tous les éléments cliquables
   - Les utilisateurs voient maintenant que les éléments sont cliquables

3. ✅ **Logs de débogage**
   - Ajout de `console.log` pour suivre les changements de filtres
   - Facilite le diagnostic en cas de problème

## Comment tester les filtres

### 1. Ouvrir la console du navigateur
- Chrome/Edge: F12 ou Ctrl+Shift+I
- Firefox: F12 ou Ctrl+Shift+K
- Safari: Cmd+Option+I

### 2. Tester l'ouverture des filtres
1. Aller sur la page **Leads**, **Projects**, **Activities**, **Goals**, **Revenues** ou **Clients**
2. Cliquer sur "**Filtres avancés**"
3. Le panneau devrait s'ouvrir avec une animation
4. Dans la console, vous devriez voir : `[LeadFilter] Toggle expansion: true`

### 3. Tester les filtres
1. Une fois les filtres ouverts, modifier un filtre (statut, type, source, dates)
2. Dans la console, vous devriez voir : `[LeadFilter] Changement de filtre: {field: "status", value: "new"}`
3. La liste des éléments devrait se filtrer automatiquement

### 4. Vérifier la visibilité
- Les champs de saisie (recherche, dates) doivent avoir du **texte blanc** sur fond sombre
- Le curseur doit devenir une **main pointeuse** sur les boutons et selects
- Les filtres actifs affichent un **badge avec le nombre** de filtres appliqués

## Fichiers modifiés

```
frontend/src/components/leads/LeadFilter.jsx ✅
frontend/src/components/projects/ProjectFilter.jsx ✅
frontend/src/components/activities/ActivityFilter.jsx ✅
frontend/src/components/goals/GoalFilter.jsx ✅
frontend/src/components/revenues/RevenueFilter.jsx ✅
frontend/src/components/clients/ClientFilter.jsx ✅
```

## Si le problème persiste

### Vérifier framer-motion
```bash
cd frontend
npm list framer-motion
# Devrait afficher: framer-motion@6.5.1
```

### Réinstaller si nécessaire
```bash
cd frontend
npm install framer-motion@6.5.1
```

### Vérifier la compilation
```bash
cd frontend
npm run build
```

### Nettoyer le cache
```bash
cd frontend
rm -rf node_modules/.cache
npm start
```

## Structure d'un filtre

Chaque composant de filtre a :

1. **État local** pour l'expansion (`isExpanded`)
2. **Props** reçues de la page parent :
   - `filters` : État actuel des filtres
   - `setFilters` : Fonction pour mettre à jour les filtres
   - `onSort` : Fonction optionnelle pour le tri
   - `sortField` : Champ de tri actuel
   - `sortDirection` : Direction du tri (asc/desc)

3. **Handlers** :
   - `handleFilterChange(field, value)` : Met à jour un filtre
   - `resetFilters()` : Réinitialise tous les filtres
   - `onClick` sur le bouton "Filtres avancés" : Toggle l'expansion

## Logs de débogage utiles

Dans la console, recherchez :
- `[LeadFilter] Toggle expansion:` - Ouverture/fermeture des filtres
- `[LeadFilter] Changement de filtre:` - Modification d'un filtre

Si ces logs n'apparaissent pas, le problème peut venir de :
- Un conflit CSS (z-index, pointer-events)
- Une erreur JavaScript qui bloque l'exécution
- Un problème de build/compilation
