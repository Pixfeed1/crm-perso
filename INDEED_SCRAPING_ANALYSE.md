# 🤖 Indeed Scraping - Analyse Technique et Légale

## TL;DR - Mon Avis

❌ **NE PAS scraper Indeed directement**

✅ **Alternatives recommandées :**
1. Pôle Emploi (déjà prévu)
2. Google for Jobs (gratuit, agrège Indeed + autres)
3. SerpAPI Indeed wrapper (payant mais légal - $50/mois)

---

## ⚖️ Légalité du Scraping Indeed

### 🚨 Problèmes Légaux

**Terms of Service Indeed (2025) :**
```
"You may not use automated means, including spiders,
robots, crawlers, data mining tools, or the like to
download or scrape data from the Service."
```

**Conséquences possibles :**
- ⚠️ Blocage IP permanent
- ⚠️ Mise en demeure (cease and desist)
- ⚠️ Poursuites judiciaires (rare mais possible)
- ⚠️ RGPD : données personnelles = risque majeur

**Précédents juridiques :**
- **hiQ Labs vs LinkedIn (2022)** : Scraping autorisé SI données publiques
- **Clearview AI (2021)** : Scraping condamné pour usage commercial
- **Ryanair vs PR Aviation (2020)** : Scraping interdit même pour comparateurs

**Verdict :** Zone grise légale. Pour un usage commercial (CRM), **risqué**.

---

## 🛡️ Difficultés Techniques

### 1. Protection Anti-Bot Indeed

Indeed utilise :
- ✅ **Cloudflare** : Détection JavaScript
- ✅ **Captcha** : reCAPTCHA v3
- ✅ **Rate limiting** : Détection patterns
- ✅ **User-Agent detection** : Blocage des bots connus
- ✅ **IP fingerprinting** : Bannissement d'IP

**Contourner ça nécessite :**
```javascript
// Puppeteer avec stealth
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// + Proxies rotatifs (coût)
// + Résolution captchas (2captcha = $2.99/1000)
// + Randomisation comportement
// + Maintenance constante (Indeed change les protections)
```

**Coût réel :**
- Proxies : ~$50/mois
- Résolution captchas : ~$20/mois
- Maintenance : ~5h/mois
- **Total : ~$200/mois** (temps + argent)

### 2. Structure HTML Changeante

Indeed change régulièrement ses sélecteurs CSS :
```javascript
// Aujourd'hui
'.jobTitle > a'

// Demain
'.job-card-title > span > a'

// Après-demain
'[data-testid="job-title-link"]'
```

**Résultat :** Code casse tous les 2-3 mois.

---

## 🆚 Scraping vs Alternatives

| Critère | Scraping Indeed | SerpAPI Indeed | Google Jobs | Pôle Emploi |
|---------|----------------|----------------|-------------|-------------|
| **Légal ?** | ⚠️ Zone grise | ✅ Oui | ✅ Oui | ✅ Oui |
| **Stable ?** | ❌ Casse souvent | ✅ Oui | ✅ Oui | ✅ Oui |
| **Coût** | $70/mois (proxies+captchas) | $50/mois | Gratuit ou $50/mois | Gratuit |
| **Maintenance** | 5h/mois | 0h | 0h | 0h |
| **Données** | Complètes | Complètes | Partielles | Complètes |
| **Risque blocage** | ⚠️ Élevé | ✅ Aucun | ✅ Aucun | ✅ Aucun |

---

## ✅ Recommandation : Google for Jobs

### C'est quoi Google for Jobs ?

Google agrège automatiquement les offres d'emploi de :
- ✅ Indeed
- ✅ LinkedIn
- ✅ Monster
- ✅ Sites d'entreprises
- ✅ Et 100+ autres sources

**Avantage :** Tu récupères Indeed + autres **SANS scraper** !

### Comment y accéder ?

#### Option 1 : SerpAPI (Recommandé)
**URL :** https://serpapi.com/google-jobs-api

**Prix :**
- 100 recherches/mois : **Gratuit** ✅
- 5000 recherches/mois : $50/mois
- 15000 recherches/mois : $125/mois

**Exemple de requête :**
```javascript
const SerpApi = require('google-search-results-nodejs');
const search = new SerpApi.GoogleSearch(process.env.SERPAPI_KEY);

const params = {
  engine: "google_jobs",
  q: "développeur web",
  location: "Paris, France",
  hl: "fr"
};

search.json(params, (data) => {
  console.log(data.jobs_results);
  // [
  //   {
  //     title: "Développeur Web Full Stack",
  //     company_name: "Acme Corp",
  //     location: "Paris",
  //     via: "Indeed",
  //     description: "...",
  //     job_highlights: [...],
  //     related_links: [...]
  //   }
  // ]
});
```

**Ce que tu obtiens :**
```json
{
  "jobs_results": [
    {
      "title": "Développeur Web",
      "company_name": "Acme Corp",
      "location": "Paris, France",
      "via": "Indeed",  // ← Source (Indeed, LinkedIn, etc.)
      "description": "Nous recherchons...",
      "detected_extensions": {
        "posted_at": "Il y a 2 jours",
        "schedule_type": "Temps plein"
      },
      "job_highlights": [
        {
          "title": "Qualifications",
          "items": ["5 ans d'expérience", "React, Node.js"]
        }
      ]
    }
  ]
}
```

**Avantages :**
- ✅ **Légal** : Google autorise via SerpAPI
- ✅ **Stable** : API maintenue par SerpAPI
- ✅ **Multi-sources** : Indeed + LinkedIn + autres
- ✅ **100 req/mois gratuit** = largement suffisant pour tester

#### Option 2 : ScraperAPI + Google (Alternative)
**URL :** https://www.scraperapi.com

Similar à SerpAPI mais plus généraliste.

#### Option 3 : Bright Data Google Jobs API
**URL :** https://brightdata.com/products/serp-api

Plus cher mais très robuste.

---

## 🎯 Architecture Multi-Sources Finale

### Stack Recommandé

```
┌─────────────────────────────────────────────────┐
│         BACKEND - Orchestration                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. Pôle Emploi (Gratuit, 500k offres FR)      │
│     └─ API Officielle                          │
│                                                 │
│  2. Google Jobs (Gratuit 100 req/mois)         │
│     └─ SerpAPI                                 │
│     └─ Agrège: Indeed, LinkedIn, Monster, etc. │
│                                                 │
│  3. Data.gouv (Gratuit, enrichissement)        │
│     └─ SIRENE, infos entreprises              │
│                                                 │
│  4. BOAMP (Gratuit, marchés publics)           │
│     └─ Appels d'offres                         │
│                                                 │
│  5. Pappers (100 req/j gratuit, enrichissement)│
│     └─ Dirigeants, CA, effectif               │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Code d'Orchestration

```javascript
// backend/services/prospectionService.js
class ProspectionService {
  async searchOpportunities(query, location) {
    const results = [];

    // 1. Pôle Emploi (base française)
    const poleEmploiJobs = await this.poleEmploiService.search(query, location);
    results.push(...poleEmploiJobs.map(job => ({
      ...job,
      source: 'pole-emploi',
      priority: 1  // Priorité haute (données officielles FR)
    })));

    // 2. Google Jobs (agrégateur Indeed + autres)
    if (process.env.SERPAPI_KEY) {
      const googleJobs = await this.googleJobsService.search(query, location);
      results.push(...googleJobs.map(job => ({
        ...job,
        source: job.via,  // 'Indeed', 'LinkedIn', etc.
        priority: 2
      })));
    }

    // 3. Dédoublonner (même entreprise + même titre)
    const deduplicated = this.deduplicateJobs(results);

    // 4. Enrichir avec Data.gouv + Pappers
    const enriched = await this.enrichCompanies(deduplicated);

    // 5. Calculer le score
    return enriched.map(opp => ({
      ...opp,
      score: this.calculateScore(opp)
    }));
  }

  deduplicateJobs(jobs) {
    const seen = new Map();

    return jobs.filter(job => {
      const key = `${job.company.toLowerCase().trim()}-${job.title.toLowerCase().trim()}`;

      if (seen.has(key)) {
        // Garder celui avec la meilleure priorité
        if (job.priority < seen.get(key).priority) {
          seen.set(key, job);
          return true;
        }
        return false;
      }

      seen.set(key, job);
      return true;
    });
  }
}
```

**Résultat :**
```
Recherche "web Paris" :
- 50 offres Pôle Emploi
- 80 offres Google Jobs (dont 30 Indeed, 20 LinkedIn, 30 autres)
- Dédoublonnage → 95 offres uniques
- Enrichissement → 95 entreprises avec infos complètes
- Scoring → Tri par potentiel business
```

---

## 💰 Coûts Comparés

### Scénario : 1000 recherches/mois

| Solution | Coût/mois | Maintenance | Total réel |
|----------|-----------|-------------|------------|
| **Scraping Indeed** | $70 (proxies) | 5h × $50/h = $250 | **$320/mois** |
| **SerpAPI Google Jobs** | $50 | 0h | **$50/mois** |
| **Pôle Emploi seul** | $0 | 0h | **$0/mois** |
| **Combo recommandé** | $50 SerpAPI | 0h | **$50/mois** |

**Combo recommandé :**
- Pôle Emploi (gratuit)
- Google Jobs via SerpAPI ($50/mois)
- Data.gouv (gratuit)
- BOAMP (gratuit)
- Pappers gratuit (100/j)

**= $50/mois pour un système ultra-complet et 100% légal**

---

## 📋 Mon Conseil Final

### ✅ À FAIRE

1. **Pôle Emploi** → Intégration immédiate (tu as les clés)
2. **Google Jobs (SerpAPI)** → S'inscrire (100 req/mois gratuit pour tester)
3. **Data.gouv + BOAMP** → Gratuits, aucune raison de s'en priver
4. **Pappers gratuit** → 100 req/j pour enrichissement

**Total : $0/mois pour commencer**, puis $50/mois si tu valides Google Jobs.

### ❌ À ÉVITER

1. **Scraping Indeed directement** → Risques juridiques + techniques + coût élevé
2. **APIs payantes Indeed/LinkedIn** → Trop cher pour commencer
3. **Solutions complexes** → KISS (Keep It Simple)

---

## 🚀 Prochaines Étapes

### Maintenant (Gratuit)
1. Je code service **Pôle Emploi** avec tes clés
2. Je code service **Data.gouv** (enrichissement)
3. Je code service **BOAMP** (marchés publics)
4. On teste avec données réelles

**→ Système opérationnel 100% gratuit**

### Dans 1 semaine (Validation)
1. Tu t'inscris **SerpAPI** (gratuit 100 req/mois)
2. Je code service **Google Jobs**
3. On compare Pôle Emploi vs Google Jobs
4. Tu décides si Google Jobs vaut $50/mois

### Dans 1 mois (Scaling)
1. Si ça fonctionne bien → passer à $50/mois SerpAPI
2. Si besoin de plus → Pappers Pro $29/mois
3. **Budget total max : $79/mois** pour un système complet

---

## 🎯 Verdict Indeed

**Question :** Scraper Indeed ?

**Réponse :** ❌ **NON**

**Pourquoi :**
- Google Jobs te donne déjà Indeed (+ autres)
- Moins cher ($50 vs $320/mois)
- Zéro risque légal
- Zéro maintenance
- Plus de sources (Indeed + LinkedIn + Monster + etc.)

**Indeed via Google Jobs = Meilleur des deux mondes** ✅

---

## 🔑 Clés Nécessaires

```bash
# backend/.env

# Pôle Emploi (TU AS DÉJÀ ✅)
POLE_EMPLOI_CLIENT_ID=ton_id
POLE_EMPLOI_CLIENT_SECRET=ton_secret

# SerpAPI (Gratuit 100 req/mois)
SERPAPI_KEY=ta_cle  # ← À obtenir sur https://serpapi.com

# Pappers (Optionnel, gratuit 100 req/j)
PAPPERS_API_KEY=ta_cle  # ← À obtenir sur https://pappers.fr/api
```

**Tu veux que je commence avec Pôle Emploi + Data.gouv + BOAMP maintenant ?**

(Google Jobs on l'ajoutera après quand tu auras la clé SerpAPI)
