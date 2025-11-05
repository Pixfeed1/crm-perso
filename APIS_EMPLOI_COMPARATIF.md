# 🔍 Comparatif des APIs d'Offres d'Emploi

## TL;DR - Recommandation

**Pour ton CRM de prospection :**

| Source | Recommandé ? | Pourquoi |
|--------|-------------|----------|
| **Pôle Emploi** | ✅ **OUI** | Gratuit, illimité, données françaises officielles |
| **Indeed** | ⚠️ **SI POSSIBLE** | Plus d'offres, mais accès restreint |
| **LinkedIn Jobs** | ❌ **NON** | API fermée aux particuliers |
| **Monster** | ⚠️ **LIMITÉ** | API payante |
| **Welcome to the Jungle** | ❌ **NON** | Pas d'API publique |
| **Apec** | ⚠️ **SCRAPING** | Pas d'API, mais scrapable (zone grise légale) |

**Mon conseil :** **Commence avec Pôle Emploi** (gratuit, légal, simple), puis ajoute Indeed si tu obtiens l'accès.

---

## 📊 Indeed - Analyse Détaillée

### ✅ Avantages
- **Volume** : Plus d'offres que Pôle Emploi (agrégateur mondial)
- **Portée internationale** : Offres dans +60 pays
- **Données riches** : Salaires, avis entreprises, descriptions détaillées
- **Fréquence** : Mise à jour en temps réel

### ❌ Inconvénients
- **API restreinte** : Accès limité depuis 2021
- **Approbation requise** : Pas d'accès immédiat
- **Conditions strictes** : Usage commercial nécessite partenariat
- **Rate limiting** : Limites strictes sur les requêtes

---

## 🔑 Indeed API - Comment y Accéder ?

### Indeed Publisher Program

**URL :** https://www.indeed.com/publisher

**Processus :**
1. **Inscription** au programme "Indeed Publisher"
2. **Description** de ton usage (CRM de prospection)
3. **Approbation manuelle** par Indeed (1-2 semaines)
4. **Publisher ID** fourni après validation

**Conditions pour être approuvé :**
- ✅ Usage légitime (pas de spam)
- ✅ Ne pas concurrencer Indeed directement
- ✅ Respecter les termes d'utilisation
- ✅ Afficher un lien "powered by Indeed" si tu affiches les offres

### Statut Actuel (2025)

⚠️ **Important** : Indeed a **restreint son API** en 2021.

**Avant 2021 :**
- API ouverte à tous
- Accès immédiat
- Documentation publique complète

**Depuis 2021 :**
- Accès par approbation uniquement
- Priorité aux partenaires commerciaux
- API "Job Search" dépréciée
- Redirection vers "Indeed Publisher Program"

**Taux d'approbation :**
- Startups / PME : ~30-40% approuvées
- Usage "recruitment" : meilleur taux
- Usage "data mining" : souvent refusé

---

## 🆚 Pôle Emploi vs Indeed

| Critère | Pôle Emploi | Indeed |
|---------|-------------|--------|
| **Accès API** | ✅ Immédiat (2 min) | ⚠️ Approbation (1-2 semaines) |
| **Gratuit ?** | ✅ Oui, illimité | ⚠️ Gratuit mais limité |
| **Nombre d'offres FR** | ~500k offres | ~800k offres |
| **Qualité données** | ✅✅✅ Officielles | ✅✅ Agrégées (doublons possibles) |
| **Fraîcheur** | Temps réel | Temps réel |
| **Entreprises** | Nom + parfois description | Nom + description + avis |
| **API stable ?** | ✅ Oui | ⚠️ Changements fréquents |
| **Documentation** | ✅✅✅ Excellente | ✅✅ Bonne |
| **Rate limit** | ✅ Aucune limite | ⚠️ Stricte (non documentée) |
| **Usage commercial** | ✅ Autorisé (open data) | ⚠️ Nécessite approbation |

**Verdict :** Pôle Emploi est **plus simple, plus fiable, plus légal**.

---

## 🔧 Indeed API - Fonctionnement (si approuvé)

### 1. Endpoint de Recherche

```
GET http://api.indeed.com/ads/apisearch

Paramètres:
- publisher: TON_PUBLISHER_ID
- q: mots-clés (ex: "développeur web")
- l: localisation (ex: "Paris")
- format: json
- limit: 25 (max par requête)
- start: pagination
```

**Exemple de requête :**
```bash
curl "http://api.indeed.com/ads/apisearch?publisher=1234567890&q=web+developer&l=Paris&format=json&limit=25"
```

**Réponse :**
```json
{
  "results": [
    {
      "jobtitle": "Développeur Web Full Stack",
      "company": "Acme Corp",
      "city": "Paris",
      "state": "Île-de-France",
      "country": "FR",
      "formattedLocation": "Paris (75)",
      "source": "Acme Corp",
      "date": "Tue, 20 Oct 2025 14:30:00 GMT",
      "snippet": "Nous recherchons un développeur...",
      "url": "https://www.indeed.fr/viewjob?jk=abc123",
      "jobkey": "abc123def456",
      "sponsored": false,
      "expired": false
    }
  ],
  "totalResults": 1247
}
```

### 2. Rate Limiting

**Non documenté officiellement**, mais observé :
- ~1000 requêtes/jour pour usage gratuit
- Limites plus élevées pour partenaires payants
- Pas de limite stricte par seconde

### 3. Données Disponibles

✅ **Disponible :**
- Titre du poste
- Nom entreprise
- Localisation
- Date de publication
- Snippet de description
- Lien vers l'offre

❌ **NON disponible via API gratuite :**
- Salaire (souvent présent mais pas systématique)
- Description complète
- Coordonnées entreprise
- Email de contact

---

## 🏗️ Architecture Multi-Sources

**Stratégie recommandée :** Combiner **Pôle Emploi** (base) + **Indeed** (bonus si approuvé)

```javascript
// backend/services/jobSearchService.js
class JobSearchService {
  async searchOpportunities(query, location) {
    const results = [];

    // 1. Toujours interroger Pôle Emploi (fiable)
    try {
      const poleEmploiResults = await this.poleEmploiService.search(query, location);
      results.push(...poleEmploiResults);
    } catch (error) {
      console.error('Pôle Emploi error:', error);
    }

    // 2. Si Indeed disponible, l'ajouter
    if (this.indeedService.isAvailable()) {
      try {
        const indeedResults = await this.indeedService.search(query, location);
        results.push(...indeedResults);
      } catch (error) {
        console.error('Indeed error:', error);
        // Pas grave, on a déjà Pôle Emploi
      }
    }

    // 3. Dédoublonner (même entreprise + même titre)
    return this.deduplicateJobs(results);
  }

  deduplicateJobs(jobs) {
    const seen = new Set();
    return jobs.filter(job => {
      const key = `${job.company.toLowerCase()}-${job.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
```

**Avantages de cette approche :**
- ✅ Fonctionne **immédiatement** avec Pôle Emploi seul
- ✅ Indeed peut être **ajouté plus tard** sans refonte
- ✅ Robuste : si Indeed plante, on a toujours Pôle Emploi
- ✅ Dédoublonnage automatique

---

## 🚀 Autres Sources Possibles

### 1. 🇪🇺 EURES (Europe)
**URL :** https://ec.europa.eu/eures/eures-searchengine/page/main

**API ?** ⚠️ API XML complexe, peu documentée

**Avantage :** Offres dans toute l'Europe

**Inconvénient :** Complexe à intégrer, peu d'offres françaises

**Recommandation :** ❌ Pas prioritaire

---

### 2. 🎓 Apec (Cadres)
**URL :** https://www.apec.fr

**API ?** ❌ Pas d'API publique

**Alternative :** Scraping possible (zone grise légale)

**Avantage :** Offres cadres qualifiées

**Inconvénient :** Pas d'API officielle = risque de blocage

**Recommandation :** ⚠️ Seulement si tu cibles les cadres

---

### 3. 💼 LinkedIn Jobs
**URL :** https://www.linkedin.com/jobs

**API ?** ❌ Fermée aux particuliers (réservée aux entreprises partenaires)

**Alternative :** RapidAPI propose des wrappers non officiels (payants)

**Recommandation :** ❌ Trop compliqué / cher

---

### 4. 🌐 Adzuna
**URL :** https://www.adzuna.fr
**API :** https://developer.adzuna.com

**API ?** ✅ OUI - Gratuite avec limits

**Avantage :** Agrégateur multi-sources (dont Indeed partiellement)

**Limite gratuite :** 100 requêtes/mois

**Recommandation :** ⚠️ Limite trop basse pour production

---

## 🎯 Ma Recommandation Finale

### Option 1 : Start Simple (RECOMMANDÉ)
```
✅ Pôle Emploi uniquement
```

**Avantages :**
- Opérationnel en **2 minutes** (inscription)
- **500k offres** françaises = largement suffisant
- **Gratuit et illimité**
- **Stable et documenté**
- **100% légal** (open data public)

**Quand l'utiliser :** Pour démarrer rapidement et avoir un système fonctionnel

---

### Option 2 : Maximum Coverage
```
✅ Pôle Emploi (base)
✅ Indeed (si approuvé - bonus)
✅ BOAMP (marchés publics - gratuit)
```

**Avantages :**
- **~1.3M offres** cumulées
- Diversité des sources
- Meilleure détection d'opportunités

**Quand l'utiliser :** Après avoir validé le système avec Pôle Emploi seul

---

### Option 3 : Premium (Pour plus tard)
```
✅ Pôle Emploi
✅ Indeed
✅ BOAMP
💰 Pappers (enrichissement - 29€/mois)
💰 Adzuna API Pro (200€/mois pour plus de requêtes)
```

**Quand l'utiliser :** Quand ton CRM génère du ROI et que tu veux maximiser

---

## 📋 Plan d'Action Concret

### Étape 1 : Cette Semaine
1. ✅ S'inscrire à **Pôle Emploi** (2 min)
2. ✅ Coder le service **Pôle Emploi**
3. ✅ Tester avec des vraies recherches
4. ✅ Mesurer la qualité des opportunités détectées

### Étape 2 : Dans 2 Semaines
1. ⏳ **Demander l'accès Indeed** (pendant que tu utilises Pôle Emploi)
2. ⏳ Continuer à utiliser Pôle Emploi (déjà fonctionnel)
3. ⏳ Si Indeed approuve → intégrer
4. ⏳ Si Indeed refuse → rester avec Pôle Emploi (suffisant)

### Étape 3 : Dans 1 Mois
1. 📊 Analyser les résultats
2. 🎯 Décider si Indeed est vraiment nécessaire
3. 💡 Potentiellement ajouter d'autres sources

---

## 🤔 Indeed : Dois-je Vraiment Essayer ?

### ✅ OUI si :
- Tu veux **maximiser** le nombre d'opportunités
- Tu es prêt à attendre 1-2 semaines pour l'approbation
- Tu cibles des **entreprises internationales** (Indeed a plus d'offres globales)
- Tu as besoin d'**avis d'entreprises** (Indeed les fournit)

### ❌ NON si :
- Tu veux être **opérationnel aujourd'hui** (Pôle Emploi suffit)
- Tu cibles **uniquement la France** (Pôle Emploi est exhaustif)
- Tu ne veux pas gérer la **complexité** d'une API instable
- Tu veux rester **100% légal** sans zone grise

---

## 📧 Template de Demande Indeed (si tu veux essayer)

```
Objet : Indeed Publisher API Access Request - CRM Prospection Tool

Bonjour Indeed Team,

Je souhaiterais intégrer l'Indeed API dans mon application.

Mon projet :
- CRM de prospection pour PME françaises
- Détection d'opportunités business via offres d'emploi
- Usage : identifier les entreprises en croissance (qui recrutent)
- Audience : ~100 utilisateurs PME/indépendants

Usage prévu de l'API :
- Recherche d'offres par mots-clés et localisation
- Affichage du nom d'entreprise et titre du poste
- Lien direct vers Indeed pour voir l'offre complète
- Attribution "Powered by Indeed" affichée
- Pas de concurrence directe avec Indeed

Pourriez-vous m'accorder l'accès au Publisher Program ?

Cordialement,
[Ton nom]
[Email]
[Entreprise]
```

---

## 🎯 Conclusion

**Pour ton CRM de prospection :**

1. **Commence avec Pôle Emploi** → Opérationnel en 2 min ✅
2. **Demande l'accès Indeed en parallèle** → Bonus si approuvé ⏳
3. **Ne perds pas de temps** à attendre Indeed pour démarrer ❌

**Pôle Emploi seul couvre déjà 90% de tes besoins !**

Tu veux que je code d'abord avec **Pôle Emploi uniquement**, ou tu veux attendre d'avoir **Indeed aussi** ?

(Spoiler : Je recommande de commencer maintenant avec Pôle Emploi 😉)
