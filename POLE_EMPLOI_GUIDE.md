# 🔑 Guide : Obtenir les Clés API Pôle Emploi (GRATUIT)

## ✅ C'EST GRATUIT - Aucun paiement requis

Pôle Emploi propose des **APIs publiques gratuites** pour tous les développeurs.

---

## 📋 Étape par Étape

### 1️⃣ Créer un Compte Développeur

**Lien :** https://pole-emploi.io/inscription

Remplis le formulaire :
- Nom / Prénom
- Email pro
- Entreprise (ou "Indépendant")
- Description projet : "CRM de prospection pour détecter opportunités business"

**⏱️ Validation** : Immédiate (pas d'attente)

---

### 2️⃣ Se Connecter à l'Espace Développeur

**Lien :** https://pole-emploi.io/connexion

Une fois connecté, tu arrives sur le **tableau de bord**.

---

### 3️⃣ Créer une Application

1. Clique sur **"Mes applications"**
2. Clique sur **"Créer une application"**
3. Remplis :
   - **Nom** : "CRM Prospection"
   - **Description** : "Système de détection d'opportunités business via offres d'emploi"
   - **URL de redirection** : `http://localhost:5000/callback` (pour le dev)
   - **Scopes à cocher** :
     - ✅ `api_offresdemploiv2` (Offres d'emploi)
     - ✅ `o2dsoffre` (Détails des offres)

4. Valide

---

### 4️⃣ Récupérer tes Clés

Tu vas obtenir :

```
Client ID: abc123def456...
Client Secret: xyz789ghi012...
```

**⚠️ IMPORTANT** : Copie-les et garde-les précieusement !

---

### 5️⃣ Ajouter les Clés dans ton CRM

Dans ton fichier **`backend/.env`** :

```bash
# API Pôle Emploi (GRATUIT)
POLE_EMPLOI_CLIENT_ID=ton_client_id_ici
POLE_EMPLOI_CLIENT_SECRET=ton_secret_ici
POLE_EMPLOI_SCOPE=api_offresdemploiv2 o2dsoffre
```

---

## 🎯 APIs Disponibles (toutes GRATUITES)

### 1. Offres d'Emploi
```
GET https://api.emploi-store.fr/partenaire/offresdemploi/v2/offres/search
```

**Paramètres utiles :**
- `motsCles` : "web", "développeur", "3D", etc.
- `commune` : Code INSEE (ex: 75056 = Paris)
- `departement` : "75", "69", etc.
- `typeContrat` : "CDI", "CDD"
- `experience` : "1", "2", "3"

**Limite :**
- ✅ **Illimité** en nombre de requêtes/jour
- ✅ 150 résultats max par requête (pagination disponible)

**Exemple de requête :**
```bash
curl "https://api.emploi-store.fr/partenaire/offresdemploi/v2/offres/search?motsCles=refonte+site&range=0-20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 2. Détails d'une Offre
```
GET https://api.emploi-store.fr/partenaire/offresdemploi/v2/offres/{id}
```

**Ce que tu obtiens :**
```json
{
  "id": "123ABC",
  "intitule": "Chef de projet web - Refonte site institutionnel",
  "description": "Nous recherchons...",
  "entreprise": {
    "nom": "Acme Corp",
    "description": "PME de 50 personnes...",
    "entrepriseAdaptee": false
  },
  "lieuTravail": {
    "libelle": "75 - PARIS 15",
    "commune": "75115",
    "codePostal": "75015"
  },
  "typeContrat": "CDI",
  "salaire": {
    "libelle": "40-50K€"
  },
  "dureeTravailLibelle": "Temps plein",
  "experienceExige": "2 An(s)",
  "competences": [
    {
      "code": "C001",
      "libelle": "Développement web"
    }
  ],
  "dateCreation": "2025-10-20T14:30:00Z",
  "dateActualisation": "2025-10-25T10:00:00Z"
}
```

---

## 🌐 Autres APIs Publiques GRATUITES

### 1. 🏢 Data.gouv - Entreprises
**URL :** https://entreprise.data.gouv.fr/api_doc

**Clé API ?** ❌ NON - Public et gratuit

**Ce qu'on récupère :**
- Infos SIRENE (nom, SIREN, adresse, NAF)
- Données INSEE
- Associations (RNA)

**Exemple :**
```bash
curl "https://entreprise.data.gouv.fr/api/sirene/v3/unites_legales/search?q=acme"
```

**Limite :**
- ✅ **7 requêtes/seconde**
- ✅ Pas de limite quotidienne

---

### 2. 📄 BOAMP - Marchés Publics
**URL :** https://data.economie.gouv.fr/explore/dataset/boamp/api/

**Clé API ?** ❌ NON - Public et gratuit

**Ce qu'on récupère :**
- Appels d'offres publics
- Marchés en cours
- Montants, dates limites
- Acheteurs publics

**Exemple :**
```bash
curl "https://data.economie.gouv.fr/api/records/1.0/search/?dataset=boamp&q=refonte+site&rows=20"
```

**Limite :**
- ✅ **Illimité**
- ⚠️ Données parfois avec délai (J-1)

---

### 3. 📊 Pappers (Optionnel - Enrichissement Premium)
**URL :** https://www.pappers.fr/api

**Clé API ?** ✅ OUI - Mais **gratuit jusqu'à 100 req/jour**

**Ce qu'on récupère EN PLUS de Data.gouv :**
- Nom du dirigeant
- Effectif précis
- Chiffre d'affaires
- Bénéfice net
- Site web
- Bénéficiaire effectif

**Inscription :**
1. Créer compte sur https://www.pappers.fr/api/documentation
2. Récupérer ta clé API dans ton profil
3. Ajouter dans `.env` :
   ```bash
   PAPPERS_API_KEY=ta_cle_ici
   ```

**Tarifs :**
- ✅ **Gratuit** : 100 requêtes/jour
- 💰 **Pro** : 29€/mois = 10 000 requêtes/mois
- 💰 **Business** : 99€/mois = 50 000 requêtes/mois

**Mon conseil :**
- Commence avec le **gratuit** (100/jour)
- Si tu fais beaucoup d'enrichissement, passe au Pro

---

## 🚀 Récapitulatif

| API | Gratuit ? | Clé nécessaire ? | Limite |
|-----|-----------|------------------|--------|
| **Pôle Emploi** | ✅ OUI | ✅ Client ID + Secret | Illimité |
| **Data.gouv (SIRENE)** | ✅ OUI | ❌ NON | 7 req/sec |
| **BOAMP** | ✅ OUI | ❌ NON | Illimité |
| **Pappers** | ✅ 100/j | ✅ API Key | 100 req/j gratuit |

---

## 📧 OAuth2 Pôle Emploi - Comment ça marche ?

Pôle Emploi utilise OAuth2. Voici le flux :

### 1. Obtenir un Access Token
```bash
curl -X POST "https://entreprise.pole-emploi.fr/connexion/oauth2/access_token?realm=/partenaire" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=TON_CLIENT_ID" \
  -d "client_secret=TON_SECRET" \
  -d "scope=api_offresdemploiv2 o2dsoffre"
```

**Réponse :**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 1499
}
```

**⏱️ Durée de vie :** ~25 minutes

### 2. Utiliser l'Access Token
```bash
curl "https://api.emploi-store.fr/partenaire/offresdemploi/v2/offres/search?motsCles=web" \
  -H "Authorization: Bearer TON_ACCESS_TOKEN"
```

**🔄 Gestion automatique dans le service :**
Le service backend va :
1. Demander un token
2. Le stocker en cache
3. Le réutiliser pendant 25 min
4. En redemander automatiquement quand expiré

---

## ⚡ Service Backend - Gestion Automatique

Je vais créer un service qui gère tout automatiquement :

```javascript
// backend/services/poleEmploiService.js
class PoleEmploiService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    // Si token valide, le réutiliser
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    // Sinon, en demander un nouveau
    const response = await axios.post(
      'https://entreprise.pole-emploi.fr/connexion/oauth2/access_token?realm=/partenaire',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.POLE_EMPLOI_CLIENT_ID,
        client_secret: process.env.POLE_EMPLOI_CLIENT_SECRET,
        scope: process.env.POLE_EMPLOI_SCOPE
      })
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

    return this.accessToken;
  }

  async searchOffers(keywords, location) {
    const token = await this.getAccessToken();

    const response = await axios.get(
      'https://api.emploi-store.fr/partenaire/offresdemploi/v2/offres/search',
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { motsCles: keywords, commune: location }
      }
    );

    return response.data;
  }
}
```

**Tu n'as rien à gérer** - Le service s'occupe de tout !

---

## 🎯 Prochaines Étapes

1. **Va sur** https://pole-emploi.io/inscription
2. **Crée ton compte** (2 minutes)
3. **Crée une application** "CRM Prospection"
4. **Copie** ton Client ID + Secret
5. **Envoie-les moi** (ou ajoute-les dans `.env`)
6. **Je code** les services pendant ce temps !

---

## ❓ Questions Fréquentes

### "Est-ce que c'est vraiment gratuit ?"
✅ **OUI** - Pôle Emploi, Data.gouv et BOAMP sont des **services publics français**.
C'est financé par l'État pour encourager l'innovation.

### "Y a-t-il des limites cachées ?"
✅ **NON** - Les seules limites sont techniques (ex: 150 résultats/requête).
Pas de limite quotidienne, pas de carte bancaire demandée.

### "Ai-je besoin d'un SIRET ?"
❌ **NON** - Tu peux t'inscrire en tant qu'indépendant ou avec le SIRET de ton activité.

### "Les données sont-elles à jour ?"
✅ **OUI** - Pôle Emploi : temps réel. BOAMP : J-1. SIRENE : mis à jour quotidiennement.

### "Puis-je utiliser ces données commercialement ?"
✅ **OUI** - C'est de l'open data. Tu peux l'utiliser dans ton CRM commercial.

---

## 🆘 Besoin d'Aide ?

Si tu as le moindre souci lors de l'inscription :
1. Fais des screenshots
2. Envoie-moi le message d'erreur
3. Je t'aide à débloquer

**Let's go ! 🚀**
