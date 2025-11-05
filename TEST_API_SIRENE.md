# 🚀 Test API Sirene - Guide Rapide

## 📋 Étapes à suivre

### 1️⃣ Récupérer les derniers changements

```bash
cd /chemin/vers/crm-perso
git checkout claude/start-positioning-011CUUKEkuirFTU6naksYwMR
git pull origin claude/start-positioning-011CUUKEkuirFTU6naksYwMR
```

**Résultat attendu** :
```
Already on 'claude/start-positioning-011CUUKEkuirFTU6naksYwMR'
Already up to date.
```

---

### 2️⃣ Installer les dépendances

**Backend** :
```bash
cd backend
npm install
```

**Frontend** (dans un autre terminal) :
```bash
cd frontend
npm install
```

⏱️ **Temps** : 1-2 minutes chacun

---

### 3️⃣ Configurer PostgreSQL

**Vérifier si PostgreSQL est installé** :
```bash
psql --version
```

**Si pas installé** :
- **Ubuntu/Debian** : `sudo apt install postgresql`
- **macOS** : `brew install postgresql`
- **Windows** : Télécharger depuis postgresql.org

**Démarrer PostgreSQL** :
```bash
# Ubuntu/Debian
sudo service postgresql start

# macOS (Homebrew)
brew services start postgresql

# Vérifier que ça tourne
sudo service postgresql status
```

**Créer la base de données** :
```bash
# Se connecter à PostgreSQL
sudo -u postgres psql

# Dans psql, taper :
CREATE DATABASE mcrm;

# Vérifier
\l

# Quitter
\q
```

---

### 4️⃣ Créer le fichier backend/.env

**Créer le fichier** `backend/.env` :
```bash
cd backend
nano .env
# ou
code .env
# ou ouvre avec ton éditeur
```

**Coller ce contenu** :
```env
# PostgreSQL
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mcrm

# JWT
JWT_SECRET=ma_cle_secrete_super_longue_et_aleatoire_123456789

# Port backend
PORT=5000
NODE_ENV=development

# SMTP Email (pour plus tard, pas urgent)
SMTP_HOST=mail.pixfeed.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=contact@pixfeed.net
SMTP_PASS=TON_MOT_DE_PASSE_EMAIL
```

**⚠️ IMPORTANT** : Change `DB_PASSWORD` si ton PostgreSQL a un mot de passe différent

**Sauvegarder et quitter** :
- Nano : `Ctrl+X`, puis `Y`, puis `Entrée`
- VS Code : `Ctrl+S`

---

### 5️⃣ Créer le fichier frontend/.env

**Créer le fichier** `frontend/.env` :
```bash
cd frontend
nano .env
# ou
code .env
```

**Coller ce contenu** :
```env
REACT_APP_API_URL=http://localhost:5000/api
```

**Sauvegarder et quitter**

---

### 6️⃣ Démarrer le backend

**Terminal 1** :
```bash
cd backend
npm run dev
```

**✅ Ce que tu dois voir** :
```
🔄 Initialisation de la base de données...
✅ Base de données initialisée avec succès.
===========================================
Serveur démarré sur le port 5000 en mode development
Base de données: PostgreSQL sur localhost
===========================================
```

**❌ Si erreur "connect ECONNREFUSED 127.0.0.1:5432"** :
- PostgreSQL n'est pas démarré
- Lance : `sudo service postgresql start` (Linux) ou `brew services start postgresql` (macOS)

**❌ Si erreur "Module not found"** :
- Retourne dans backend/ et lance `npm install`

**⚠️ LAISSE CE TERMINAL OUVERT** - Le backend doit tourner en permanence

---

### 7️⃣ Démarrer le frontend

**Terminal 2** (nouveau terminal) :
```bash
cd frontend
npm start
```

**✅ Ce que tu dois voir** :
```
Compiled successfully!

You can now view crm-frontend in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.x.x:3000
```

**Le navigateur devrait s'ouvrir automatiquement sur** `http://localhost:3000`

**⚠️ LAISSE CE TERMINAL OUVERT** aussi

---

### 8️⃣ Tester l'autocomplete entreprise

1. **Se connecter** (ou créer un compte si besoin)

2. **Aller sur la page Leads** :
   - Clique sur "Leads" dans le menu

3. **Créer un nouveau lead** :
   - Clique sur le bouton **"+ Nouveau Lead"**

4. **Sélectionner "Entreprise"** :
   - Coche le bouton radio **"Entreprise"**

5. **Taper un nom d'entreprise** :
   - Dans le champ "Entreprise", tape : **"Orange"**
   - Ou **"Google"**
   - Ou **"Société Générale"**
   - Ou **"Carrefour"**

6. **Observer les suggestions** :
   - Des suggestions devraient apparaître après 2-3 lettres
   - Tu devrais voir le nom, SIREN, forme juridique, activité, effectifs

---

### 9️⃣ Vérifier la console (F12)

**Ouvre la console développeur** :
- Appuie sur **F12**
- Va dans l'onglet **Console**

**✅ Ce que tu DOIS voir** (BON) :
```
GET http://localhost:5000/api/sirene/search?q=orange 200 OK
```

**❌ Ce que tu NE DOIS PAS voir** (MAUVAIS - erreur) :
```
❌ GET https://entreprise.data.gouv.fr/... net::ERR_CONNECTION_REFUSED
❌ GET https://entreprise.data.gouv.fr/... net::ERR_CONNECTION_RESET
```

Si tu vois les erreurs ❌, ça veut dire que le code n'a pas été mis à jour.

---

## 🎯 Test Réussi si :

✅ Le backend démarre sans erreur
✅ Le frontend démarre sans erreur
✅ Tu peux taper un nom d'entreprise
✅ Des suggestions apparaissent
✅ La console montre `200 OK` sur `localhost:5000/api/sirene/search`
✅ Pas d'erreurs ERR_CONNECTION_REFUSED

---

## 🐛 Problèmes Courants

### Problème 1 : "Cannot find module 'express'"
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
```

### Problème 2 : PostgreSQL refuse la connexion
```bash
# Vérifier le statut
sudo service postgresql status

# Si "down", démarrer
sudo service postgresql start

# Tester la connexion
psql -U postgres -d mcrm
# Si ça demande un mot de passe, c'est normal
```

### Problème 3 : Port 5000 déjà utilisé
```bash
# Trouver le processus
sudo lsof -i :5000

# Tuer le processus
sudo kill -9 <PID>

# Ou changer le port dans backend/.env
PORT=5001
```

### Problème 4 : Port 3000 déjà utilisé
```bash
# Quand npm start demande, tape "Y" pour utiliser 3001
# Ou
sudo lsof -i :3000
sudo kill -9 <PID>
```

### Problème 5 : API Sirene renvoie un tableau vide []
C'est possible si :
- L'API gouvernementale est temporairement down
- Le nom de l'entreprise n'existe pas
- Il faut au moins 2 caractères

**Essaye avec** : "Orange", "Google", "Société Générale", "Total"

### Problème 6 : Textes toujours invisibles
```bash
# Vider le cache navigateur
Ctrl+Shift+Del → Tout supprimer

# Rebuild le frontend
cd frontend
rm -rf build node_modules/.cache
npm start
```

---

## 📊 Après le Test

**Une fois que tout fonctionne**, dis-moi :

1. ✅ L'autocomplete fonctionne ?
2. ✅ Les suggestions s'affichent ?
3. ✅ La console montre 200 OK ?
4. ✅ Pas d'erreurs ?

**Ensuite on pourra** :
- Implémenter les améliorations Devis
- Ou démarrer le Plan Option C (Pagination, etc.)

---

## 🆘 Besoin d'Aide ?

Si tu bloques quelque part :
1. Copie-colle l'erreur exacte
2. Dis-moi à quelle étape tu es
3. Copie-colle les logs du terminal

Je t'aiderai ! 🚀
