# 🚀 Guide de Démarrage - CRM Professionnel

## 📋 Corrections Récentes

### ✅ API Sirene - CORRIGÉ
**Problème** : L'ancienne API `entreprise.data.gouv.fr` a été **fermée en septembre 2022**, causant des erreurs 403 Forbidden.

**Solution** : Migration vers la **nouvelle API officielle** `recherche-entreprises.api.gouv.fr`

**Fichiers modifiés** :
- `backend/controllers/sireneController.js` - Proxy backend avec nouvelle API
- `backend/routes/sireneRoutes.js` - Routes `/api/sirene/search` et `/api/sirene/details/:siren`
- `backend/server.js` - Enregistrement des routes Sirene
- `frontend/src/services/externalAPI.js` - Appels via backend

### ✅ Textes blancs sur blanc - CORRIGÉ (dans commit 6b59043)
**Fichiers corrigés** :
- `frontend/src/components/leads/LeadForm.jsx` - Boutons radio Entreprise/Particulier
- `frontend/src/components/leads/LeadDetails.jsx` - Type et statut lead
- `frontend/src/components/leads/ContactList.jsx` - Icônes email/téléphone
- `frontend/src/components/leads/InteractionForm.jsx` - Labels types interaction
- `frontend/src/components/leads/InteractionTimeline.jsx` - Icônes et actions
- `frontend/src/pages/Leads.jsx` - Bouton retour
- `frontend/src/pages/Dashboard.jsx` - Bouton "Nouveau"
- `frontend/src/pages/Projects.jsx` - Bouton retour

---

## 🛠️ Installation et Démarrage

### 1. Cloner et installer les dépendances

```bash
# Cloner le projet (si pas déjà fait)
git clone [URL_DU_REPO]
cd crm-perso

# Vérifier qu'on est sur la bonne branche
git checkout claude/start-positioning-011CUUKEkuirFTU6naksYwMR

# Récupérer les derniers changements
git pull origin claude/start-positioning-011CUUKEkuirFTU6naksYwMR
```

### 2. Installer les dépendances

```bash
# Backend
cd backend
npm install

# Frontend (dans un autre terminal)
cd ../frontend
npm install
```

### 3. Configurer PostgreSQL

**Créer la base de données** :
```bash
# Se connecter à PostgreSQL
sudo -u postgres psql

# Créer la base
CREATE DATABASE mcrm;

# Créer un utilisateur (optionnel)
CREATE USER mcrm_user WITH PASSWORD 'votre_mot_de_passe';
GRANT ALL PRIVILEGES ON DATABASE mcrm TO mcrm_user;

# Quitter
\q
```

### 4. Configurer les variables d'environnement

**Créer** `backend/.env` :
```env
# PostgreSQL
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe_postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mcrm

# JWT
JWT_SECRET=votre_cle_secrete_tres_longue_et_aleatoire

# SMTP Email (pour plus tard)
SMTP_HOST=mail.pixfeed.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=contact@pixfeed.net
SMTP_PASS=TON_MOT_DE_PASSE_EMAIL_ICI
```

**Créer** `frontend/.env` :
```env
REACT_APP_API_URL=http://localhost:5000/api
```

### 5. Démarrer les serveurs

**Terminal 1 - Backend** :
```bash
cd backend
npm run dev
# ou
npm start
```

Tu devrais voir :
```
✅ Base de données initialisée avec succès.
===========================================
Serveur démarré sur le port 5000 en mode development
Base de données: PostgreSQL sur localhost
===========================================
```

**Terminal 2 - Frontend** :
```bash
cd frontend
npm start
```

L'application devrait s'ouvrir sur `http://localhost:3000`

---

## 🧪 Tester l'API Sirene

### Test 1 : Via l'interface
1. Ouvre `http://localhost:3000/leads`
2. Clique sur **"Nouveau Lead"**
3. Sélectionne **"Entreprise"**
4. Dans le champ "Entreprise", tape un nom (ex: "Orange", "Google", "Pixfeed")
5. Tu devrais voir des suggestions apparaître

### Test 2 : Via curl (backend)
```bash
# Test de la route proxy backend
curl "http://localhost:5000/api/sirene/search?q=orange"

# Devrait retourner du JSON avec des entreprises
```

### Test 3 : Console navigateur
Ouvre la console (F12) et vérifie :

**AVANT (ancien code avec erreurs)** :
```
❌ GET https://entreprise.data.gouv.fr/... net::ERR_CONNECTION_REFUSED
❌ GET https://entreprise.data.gouv.fr/... net::ERR_CONNECTION_RESET
```

**APRÈS (nouveau code correct)** :
```
✅ GET http://localhost:5000/api/sirene/search?q=orange 200 OK
```

---

## 🐛 Dépannage

### Erreur : "Cannot find module 'express'"
```bash
cd backend
npm install
```

### Erreur : "connect ECONNREFUSED 127.0.0.1:5432"
PostgreSQL n'est pas démarré :
```bash
# Ubuntu/Debian
sudo service postgresql start

# macOS (avec Homebrew)
brew services start postgresql

# Windows
# Démarrer via "Services" ou pgAdmin
```

### Erreur : API Sirene renvoie 403 ou "Access denied"
**Cause possible** : L'API `recherche-entreprises.api.gouv.fr` peut avoir des restrictions.

**Solutions** :
1. Vérifie que ton serveur backend peut accéder à Internet
2. Si tu es derrière un firewall/proxy d'entreprise, configure-le dans axios
3. Alternative : Utiliser l'API INSEE avec clé API (voir ci-dessous)

### Frontend : Textes toujours invisibles après changements
```bash
# Vider le cache du navigateur
# Puis rebuild le frontend
cd frontend
rm -rf build node_modules/.cache
npm start
```

---

## 🔑 Alternative : API Sirene INSEE (avec clé)

Si l'API `recherche-entreprises.api.gouv.fr` ne fonctionne pas, tu peux utiliser l'API officielle INSEE :

1. **Créer un compte** : https://api.insee.fr/
2. **Créer une application** : "My Applications" → Créer
3. **Récupérer les clés** : Consumer Key et Consumer Secret

4. **Modifier** `backend/.env` :
```env
INSEE_CONSUMER_KEY=ta_cle_ici
INSEE_CONSUMER_SECRET=ton_secret_ici
```

5. **Modifier** `backend/controllers/sireneController.js` :
   - Ajouter authentification OAuth2 INSEE
   - Changer l'URL vers `https://api.insee.fr/entreprises/sirene/V3`

---

## 📊 État du CRM

**Complétude actuelle** : 65/100

**Modules fonctionnels** :
- ✅ Leads (ajout, modification, suppression, contacts, interactions)
- ✅ Clients (gestion complète)
- ✅ Projets (création, suivi, tâches)
- ✅ Dashboard (statistiques, graphiques)
- ✅ Calendrier (événements, rappels)
- ✅ Recherche globale
- ✅ Export CSV/PDF
- ✅ Authentification JWT

**À implémenter** (Plan Option C) :
1. ⏳ Pagination (2-3 jours)
2. ⏳ Validation + Doublons (2-3 jours)
3. ⏳ Import CSV (3-4 jours)
4. ⏳ Emails automatiques (4-5 jours)
5. ⏳ Fichiers + Multi-users (5-6 jours)
6. ⏳ Notifications temps réel (2-3 jours)

Voir `PLAN_IMPLEMENTATION_OPTION_C.md` pour les détails.

---

## 📧 Configuration Email (pour plus tard)

**Tu m'as donné** :
- Host: `mail.pixfeed.net`
- Port: `465` (SSL)
- User: `contact@pixfeed.net`
- Password: ❓ (tu dois me le donner)

**Une fois que tu as le mot de passe** :
1. Ajoute-le dans `backend/.env` → `SMTP_PASS=ton_mdp`
2. L'envoi d'emails sera implémenté dans l'Étape 4 du Plan Option C

---

## 🎯 Prochaines Étapes

1. ✅ **API Sirene** - RÉSOLU avec nouvelle API
2. ✅ **Textes invisibles** - RÉSOLU (commit 6b59043)
3. ⏳ **Tester l'autocomplete** entreprise dans ton navigateur
4. ⏳ **Confirmer que tout fonctionne**
5. ⏳ **Démarrer l'Option C** - Étape 1 : Pagination

---

## 📝 Commits Récents

```
1f7ba65 - Fix: Migration vers la nouvelle API Sirene officielle
8f4f978 - Fix: API Sirene via backend proxy
e9572f6 - Docs: Plan d'implémentation Option C
efc6aab - Docs: État de complétude du CRM
6b59043 - Fix: Corrections multiples (API, PDF, textes)
```

---

## ❓ Questions / Support

Si tu as des problèmes :
1. Vérifie les logs backend (terminal backend)
2. Vérifie la console navigateur (F12)
3. Vérifie que PostgreSQL est démarré
4. Vérifie que les ports 5000 et 3000 sont libres

**Teste et dis-moi ce qui fonctionne ou pas !** 🚀
