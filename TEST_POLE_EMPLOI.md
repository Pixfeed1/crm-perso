# 🧪 Guide Rapide : Tester l'Intégration Pôle Emploi

## 📋 Prérequis (à vérifier en premier)

### 1. PostgreSQL doit être démarré

```bash
# Vérifier le statut
sudo systemctl status postgresql

# Si pas démarré :
sudo systemctl start postgresql
```

### 2. Fichier `.env` doit exister avec tes clés Pôle Emploi

```bash
# Créer le fichier si nécessaire
cd /home/user/crm-perso/backend
cp .env.example .env

# Éditer avec tes vraies clés
nano .env
```

**Ajoute tes clés Pôle Emploi dans `.env` :**
```env
# Base de données (obligatoire)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=ton_password
DB_NAME=crm_db

# API Pôle Emploi (tes vraies clés)
POLE_EMPLOI_CLIENT_ID=ton_client_id_reel
POLE_EMPLOI_CLIENT_SECRET=ton_secret_reel
POLE_EMPLOI_SCOPE=api_offresdemploiv2 o2dsoffre
```

---

## 🚀 Méthode 1 : Test Rapide avec curl (recommandé)

### Étape 1 : Démarre le backend

```bash
cd /home/user/crm-perso/backend
npm run dev
```

**Attends de voir :**
```
✅ Base de données complètement initialisée !
Serveur démarré sur le port 5000
```

### Étape 2 : Ouvre un NOUVEAU terminal et connecte-toi

```bash
# Récupère ton token JWT en te connectant
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "ton_username", "password": "ton_password"}'
```

**Tu devrais recevoir :**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

**Copie le token !**

### Étape 3 : Test de connexion Pôle Emploi

```bash
# Remplace TON_TOKEN par le token que tu as copié
curl http://localhost:5000/api/prospection/test/pole-emploi \
  -H "Authorization: Bearer TON_TOKEN"
```

**✅ Si ça marche :**
```json
{
  "success": true,
  "message": "Connexion à Pôle Emploi réussie",
  "configured": true
}
```

**❌ Si erreur :**
```json
{
  "success": false,
  "message": "Impossible d'obtenir le token Pôle Emploi: invalid_client",
  "configured": true
}
```
→ Vérifie tes clés dans `.env`

### Étape 4 : Recherche d'opportunités

```bash
# Recherche d'offres avec mot-clé "web"
curl "http://localhost:5000/api/prospection/search?keywords=web&location=75" \
  -H "Authorization: Bearer TON_TOKEN"
```

**Résultat attendu :**
```json
{
  "success": true,
  "total": 12,
  "opportunities": [
    {
      "company_name": "Acme Corp",
      "email": "contact@acme.com",
      "city": "Paris",
      "department": "75",
      "notes": "**Offre d'emploi détectée**\nPoste: Développeur web...",
      "metadata": {
        "offer_id": "123ABC",
        "job_title": "Développeur web",
        "url": "https://candidat.pole-emploi.fr/offres/recherche/detail/123ABC"
      }
    }
  ]
}
```

---

## 🎯 Méthode 2 : Test depuis le Frontend (si build fait)

### Prérequis
```bash
cd /home/user/crm-perso/frontend
npm run build
```

### Accède à l'app
1. Ouvre ton navigateur : http://localhost:5000
2. Connecte-toi avec ton compte
3. Va dans **Leads** → Onglet **Prospection** (à créer dans le frontend)

---

## 🔍 Exemples de Recherches

### Recherche 1 : Agences web à Paris
```bash
curl "http://localhost:5000/api/prospection/search?keywords=refonte+site&location=75" \
  -H "Authorization: Bearer TON_TOKEN"
```

### Recherche 2 : Développeurs en Rhône
```bash
curl "http://localhost:5000/api/prospection/search?keywords=développeur&location=69" \
  -H "Authorization: Bearer TON_TOKEN"
```

### Recherche 3 : Communication à Lyon (rayon 30km)
```bash
curl "http://localhost:5000/api/prospection/pole-emploi/search?keywords=communication&commune=69123&distance=30" \
  -H "Authorization: Bearer TON_TOKEN"
```

### Recherche 4 : CDI uniquement
```bash
curl "http://localhost:5000/api/prospection/pole-emploi/search?keywords=web&department=75&typeContrat=CDI" \
  -H "Authorization: Bearer TON_TOKEN"
```

---

## 🐛 Debugging

### Problème : "Credentials non configurés"

**Vérifier si les clés sont chargées :**
```bash
cd /home/user/crm-perso/backend
node -e "require('dotenv').config(); console.log('CLIENT_ID:', process.env.POLE_EMPLOI_CLIENT_ID); console.log('SECRET:', process.env.POLE_EMPLOI_CLIENT_SECRET ? '✓ Défini' : '✗ Manquant');"
```

**Résultat attendu :**
```
CLIENT_ID: PAR_votreidici_xxxxx
SECRET: ✓ Défini
```

### Problème : "invalid_client"

→ **Clés incorrectes**, vérifie sur https://pole-emploi.io/compte/applications

### Problème : "Token expiré"

Le token d'accès OAuth2 expire après 25 minutes mais est géré automatiquement. Si erreur :
```bash
# Redémarre le serveur
# Ctrl+C puis npm run dev
```

---

## 📊 Logs Backend à Surveiller

Quand tu fais une requête, tu devrais voir dans le terminal backend :

```
[Pôle Emploi] Demande d'un nouveau token...
[Pôle Emploi] ✓ Token obtenu (expire dans 1439s)
[Prospection] Recherche Pôle Emploi: "web"
[Pôle Emploi] Recherche avec params: { motsCles: 'web', departement: '75' }
[Pôle Emploi] ✓ 15 offres trouvées
[Pôle Emploi] 15 opportunités détectées pour "web"
[Prospection] ✓ Pôle Emploi: 15 résultats
```

---

## ✅ Checklist Rapide

Avant de tester :

- [ ] PostgreSQL démarré (`sudo systemctl status postgresql`)
- [ ] Base `crm_db` créée
- [ ] Fichier `backend/.env` existe
- [ ] Clés Pôle Emploi ajoutées dans `.env`
- [ ] Backend démarré (`npm run dev`)
- [ ] Aucune erreur au démarrage
- [ ] Token JWT récupéré via `/api/auth/login`

Ensuite :

- [ ] Test de connexion : `/api/prospection/test/pole-emploi`
- [ ] Recherche test : `/api/prospection/search?keywords=web&location=75`

---

## 🎉 Si tout fonctionne

Tu devrais recevoir des offres d'emploi de Pôle Emploi, automatiquement transformées en format leads CRM avec :
- Nom de l'entreprise
- Email/téléphone (si disponible)
- Ville et département
- Description du besoin
- Lien vers l'offre complète
- Compétences recherchées

Ces leads peuvent ensuite être importés dans ton CRM avec :
```bash
curl -X POST http://localhost:5000/api/prospection/import-lead \
  -H "Authorization: Bearer TON_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"opportunity": {...}}'
```

---

## 📚 Documentation Complète

Pour plus de détails, consulte :
- `PROSPECTION_POLE_EMPLOI_USAGE.md` - Guide complet avec tous les endpoints
- `POLE_EMPLOI_GUIDE.md` - Guide pour obtenir les clés API
