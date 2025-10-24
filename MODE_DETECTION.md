# 🔧 Détection de Mode - API vs Local

Le CRM supporte deux modes de fonctionnement distincts, détectés automatiquement via la variable d'environnement `REACT_APP_API_URL`.

---

## 🌐 Mode Production (API Backend)

### Configuration

**Fichier:** `frontend/.env.production`

```env
REACT_APP_API_URL=https://crm.pixfeed.net/api
```

### Comportement

✅ **Activé:** Backend Node.js + PostgreSQL
❌ **Désactivé:** SQL.js / IndexedDB

**Détection automatique:**
```javascript
const IS_API_MODE = process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.trim() !== '';
```

### Ce qui se passe

1. ✅ Le frontend se connecte au backend via HTTPS
2. ❌ SQL.js n'est **PAS chargé** (pas de timeout, pas d'erreur)
3. ✅ Toutes les données via API REST (GET, POST, PUT, DELETE)
4. ✅ Authentification JWT
5. ✅ Base de données PostgreSQL centralisée

### Logs attendus

```
🔧 Mode de fonctionnement détecté: API Backend
📍 REACT_APP_API_URL: https://crm.pixfeed.net/api
✅ Mode API détecté - SQL.js désactivé
```

---

## 💻 Mode Développement (Local SQLite)

### Configuration

**Fichier:** `frontend/.env.development`

```env
# Ne PAS définir REACT_APP_API_URL
# REACT_APP_API_URL=
```

### Comportement

✅ **Activé:** SQL.js (SQLite dans le navigateur)
✅ **Activé:** IndexedDB (persistance)
❌ **Désactivé:** Backend API

### Ce qui se passe

1. ✅ SQL.js est chargé depuis le CDN
2. ✅ Base de données SQLite créée dans le navigateur
3. ✅ Persistance via IndexedDB
4. ✅ Toutes les données stockées localement
5. ❌ Aucun appel API backend

### Logs attendus

```
🔧 Mode de fonctionnement détecté: Local SQLite
📍 REACT_APP_API_URL: (non défini)
Initialisation de SQL.js
SQL.js chargé avec succès
```

---

## 📂 Fichiers modifiés

### `frontend/src/database/dbConfig.js`

**Détection du mode:**
```javascript
// Détecter le mode de fonctionnement
const API_URL = process.env.REACT_APP_API_URL;
const IS_API_MODE = API_URL && API_URL.trim() !== '';

console.log('🔧 Mode de fonctionnement détecté:', IS_API_MODE ? 'API Backend' : 'Local SQLite');
```

**Dans `initDB()`:**
```javascript
export const initDB = async () => {
  // En mode API, ne pas initialiser SQL.js
  if (IS_API_MODE) {
    console.log('✅ Mode API détecté - SQL.js désactivé');
    return Promise.resolve({ mode: 'api', message: 'SQL.js non chargé en mode API' });
  }

  // ... reste du code pour mode local
};
```

**Dans `getDB()` et `executeQuery()`:**
```javascript
export const getDB = async () => {
  // En mode API, ne pas utiliser SQL.js
  if (IS_API_MODE) {
    return Promise.resolve({ mode: 'api', message: 'Utiliser les appels API' });
  }
  // ...
};

export const executeQuery = async (query, params = []) => {
  // En mode API, ne pas exécuter de requêtes SQL.js
  if (IS_API_MODE) {
    console.warn('⚠️ executeQuery appelé en mode API - utilisez les appels API');
    return Promise.resolve([]);
  }
  // ...
};
```

---

## 🚀 Déploiement

### Production

```bash
cd frontend
npm run build  # Utilise .env.production automatiquement

# Le build contiendra:
# - REACT_APP_API_URL défini
# - SQL.js ne sera jamais chargé
# - Appels API activés
```

### Développement local

```bash
cd frontend
npm start  # Utilise .env.development automatiquement

# L'app chargera:
# - SQL.js depuis le CDN
# - IndexedDB pour la persistance
# - Pas d'appels API backend
```

---

## ✅ Avantages

1. **Pas de timeout en production** - SQL.js n'est jamais chargé
2. **Détection automatique** - Pas de configuration manuelle
3. **Mode local fonctionnel** - Développement sans backend
4. **Séparation claire** - API ou Local, jamais les deux
5. **Logs clairs** - Mode détecté affiché dans la console

---

## 🔍 Dépannage

### Problème: Timeout SQL.js en production

**Cause:** `REACT_APP_API_URL` non défini ou vide

**Solution:**
```bash
# Vérifier .env.production
cat frontend/.env.production

# Doit contenir:
REACT_APP_API_URL=https://crm.pixfeed.net/api

# Rebuilder
cd frontend
npm run build
```

### Problème: Erreur "Tt is not a function"

**Cause:** SQL.js chargé alors qu'on est en mode API

**Solution:** Voir ci-dessus, vérifier REACT_APP_API_URL

### Problème: Mode local ne fonctionne plus

**Cause:** `REACT_APP_API_URL` défini en développement

**Solution:**
```bash
# Supprimer ou commenter dans .env.development
# REACT_APP_API_URL=

# Redémarrer
npm start
```

---

## 📊 Tableau récapitulatif

| Caractéristique | Mode Local | Mode API |
|----------------|------------|----------|
| REACT_APP_API_URL | ❌ Non défini | ✅ Défini |
| SQL.js | ✅ Chargé | ❌ Non chargé |
| IndexedDB | ✅ Utilisé | ❌ Non utilisé |
| Backend API | ❌ Non utilisé | ✅ Utilisé |
| PostgreSQL | ❌ Non | ✅ Oui |
| Authentification | Simulation | JWT réel |
| Données | Navigateur | Serveur |

---

## 🎯 Résultat

**Avant:**
```
❌ SQL.js chargé en production
❌ Timeout 60 secondes
❌ Erreur "Tt is not a function"
❌ Application bloquée
```

**Après:**
```
✅ SQL.js désactivé en production
✅ Démarrage instantané
✅ Pas d'erreur
✅ Application fonctionnelle
```
