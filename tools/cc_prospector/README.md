# cc_prospector

Détecteur de prospects e-commerce **PrestaShop / WooCommerce**, 100 % sans budget.
Génère le CSV ingéré par le module Crawl du CRM.

Deux étapes :

1. **`discover`** — interroge **Common Crawl** (DuckDB, en local) → domaines `.fr` candidats.
   Pas de WARC, pas de compte AWS.
2. **`detect`** — récupère **en direct** la home de chaque domaine : détecte la techno
   (WooCommerce / PrestaShop / Shopify / WordPress) **et enrichit** — email, téléphone,
   Facebook, Instagram, version de la plateforme, validité TLS.

> L'envoi d'emails n'est pas inclus (volontairement).

## Installation
```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
```

## Utilisation
```bash
# Test rapide de la détection sur des sites connus
printf "ma-boutique.fr\nautre-shop.fr\n" > test.txt
python cc_prospector.py detect --input test.txt --output prospects.csv

# Découverte Common Crawl (dernier crawl sur index.commoncrawl.org)
python cc_prospector.py discover --crawl CC-MAIN-2026-XX --mode woocommerce \
    --max-domains 500 --output domains.txt --exclude exclude.txt

# Détection + enrichissement
python cc_prospector.py detect --input domains.txt --output prospects.csv

# Tout d'un coup
python cc_prospector.py run --crawl CC-MAIN-2026-XX --mode ecommerce --max-domains 500 \
    --exclude exclude.txt --output prospects.csv
```

## Ne jamais re-prospecter un domaine déjà connu
Le CRM expose la liste des domaines déjà vus (crawl + leads) :
```bash
curl -H "Authorization: Bearer <JWT>" \
     https://crm.pixfeed.net/api/portefeuille/crawl/exclude.txt -o exclude.txt
python cc_prospector.py discover --crawl CC-MAIN-2026-XX --exclude exclude.txt ...
```

## Colonnes du CSV (toutes ingérées par le CRM)
| colonne | description |
|---|---|
| `domain` | domaine testé |
| `platform` | WooCommerce / PrestaShop / Shopify / WordPress / Inconnu |
| `platform_version` | ex. `PrestaShop 1.6.1.24` (via `<meta generator>`) → angle commercial si obsolète |
| `signals` | signatures qui ont matché (audit) |
| `http_status` | code HTTP |
| `final_url` | URL après redirections |
| `title` | titre de la home (vidé si page anti-bot) |
| `email` | email de contact (priorité au même domaine) |
| `phone` | téléphone FR |
| `facebook_url` / `instagram_url` | profil social (pré-remplit le lead pour l'Outreach multi-canal) |
| `ssl_ok` | `oui`/`non` — certificat TLS valide (`non` = prospect chaud) |
| `protected` | `oui` si la home est derrière un anti-bot (Cloudflare) |
| `error` | erreur éventuelle (timeout, DNS, SSL…) |

## Notes
- **Enrichissement gratuit** : email/tél/réseaux/version sont extraits du HTML **déjà en main**
  au `detect` — aucune requête réseau en plus.
- **TLS** : `detect` tente d'abord une vérif stricte (→ `ssl_ok`), retombe sans vérif en cas
  d'erreur TLS pour ne pas perdre le prospect.
- **Anti-bot** : les titres de page Cloudflare (« Just a moment… ») sont filtrés (comme le CRM),
  et le site est marqué `protected`.
