"""Configuration du worker SEO.

MULTI-SITE : les sites suivis sont dans la table seo_sites, geree depuis l'UI du CRM
(page SEO > roue crantee a cote du selecteur). Le worker la lit au demarrage de chaque
job. Ajouter un site ne demande plus ni modification de code ni redeploiement.
Une seule connexion Google sert tous les sites (gsc_property par site).
"""

import os

# Filtre géographique / appareil des positions Search Console — pour que la position
# affichée colle au SERP RÉEL (et pas à une moyenne mondiale tous appareils).
#   GSC_COUNTRY : code pays ISO-3166 alpha-3 minuscule (ex 'fra'). Vide = monde entier.
#   GSC_DEVICE  : 'desktop' | 'mobile' | 'tablet'. Vide = tous appareils confondus.
GSC_COUNTRY = os.getenv("GSC_COUNTRY", "fra").strip().lower()
GSC_DEVICE = os.getenv("GSC_DEVICE", "").strip().lower()

# Amorce : inseres UNIQUEMENT si seo_sites est VIDE (premiere installation). Ensuite la
# table fait foi et cette liste est ignoree, sinon un redemarrage du worker ecraserait
# les modifications faites dans l'UI.
SEED_SITES = [
    {
        "domain": "jurojin.net",
        "wp_base_url": "https://jurojin.net",
        "gsc_property": "sc-domain:jurojin.net",
    },
    {
        "domain": "pixfeed.net",
        "wp_base_url": "https://pixfeed.net",
        "gsc_property": "sc-domain:pixfeed.net",
    },
]

# Heuristique value_score (0..100), TEMPORAIRE (remplacée par les impressions GSC à l'étape 2).
# Correspondance par sous-chaîne (insensible à la casse) sur catégorie + url + type.
# Pilier 90 réservé au VRAI contenu 3D/Blender (et au CPT "glossaire" = glossaire 3D).
PILLAR_3D = [
    "blender", "3d", "modélisation", "modelisation", "rendu", "render", "shader",
    "sculpt", "geometry node", "nodes", "uv mapping", "texturing", "topologie", "rigging",
]
# CPT (type) considérés comme piliers 3D.
PILLAR_TYPES = ["glossaire"]
# Tech/conso grand public -> faible valeur (ne PAS confondre avec les piliers 3D).
TECH_CONSO = [
    "guide-achat", "guide-d-achat", "/achat", "meilleur", "comparatif", "/test-",
    "aspirateur", "iphone", "samsung", "galaxy", "smartphone", "montre", "ecouteurs",
    "écouteurs", "televiseur", "téléviseur", "pc-portable", "casque", "imprimante",
]
# Tutoriels/guides génériques (valeur moyenne) si pas tech-conso ni 3D.
GENERIC_GUIDE = ["tutoriel", "tutorial", "tuto", "guide"]

VALUE_PILLAR = 90
VALUE_GENERIC = 60
VALUE_TECH_CONSO = 30
VALUE_DEFAULT = 40          # catégorie inconnue
VALUE_HOME_HUB = 100        # accueil / hubs

# Types WordPress à NE JAMAIS enregistrer comme pages (médias / pièces jointes).
EXCLUDE_TYPES = {"attachment"}

# Seuils de santé (sur le pagerank normalisé 0..1 relatif au max du site).
HEALTH_AFFAMEE_PR_RATIO = 0.25   # pagerank < 25% du max
HEALTH_AFFAMEE_VALUE_MIN = 70    # et value_score élevé -> "affamée"
HEALTH_RESERVOIR_PR_RATIO = 0.6  # pagerank >= 60% du max -> réservoir/hub

# User-Agent du crawler.
USER_AGENT = "PixFeedSEO/1.0 (+https://crm.pixfeed.net)"
HTTP_TIMEOUT = 20
MAX_REDIRECTS = 5            # limite de redirections (évite les boucles "Exceeded 30 redirects")
COMMIT_BATCH = 25           # commit tous les N pages traitées (persistance + reprise)
# Reparse force d'une page non revue depuis N jours, meme si WordPress la dit
# inchangee : un reglage Yoast (description, canonique, gabarit de titre) ne
# modifie pas post_modified, donc la page resterait figee indefiniment.
RECRAWL_META_DAYS = 30
POLITENESS_DELAY = 0.5      # pause (s) entre deux fetch de pages (ne pas marteler les sites)
POLL_INTERVAL = 10          # mode --serve : intervalle (s) de vérification de la file de jobs

# ===== Étape 2 — Google Search Console =====
GSC_SCOPES = ["https://www.googleapis.com/auth/webmasters"]
GSC_INITIAL_DAYS = 180          # backfill au tout premier sync (puis incrémental quotidien)
GSC_LAG_DAYS = 3                # latence des données GSC : on s'arrête à aujourd'hui - 3 jours
GSC_ROW_LIMIT = 25000           # lignes max par page de réponse Search Analytics (pagination)
GSC_INSPECT_DAILY_CAP = 2000    # plafond URL Inspection / run / propriété (quota Google)
GSC_INSPECT_TTL_DAYS = 14       # ne pas réinspecter une page vue il y a moins de N jours
GSC_VALUE_WINDOW_DAYS = 90      # fenêtre d'impressions servant au value_score réel
GSC_OAUTH_REDIRECT_PORT = 8765  # port du mini-serveur local pour le consentement (gsc_auth.py)
# Retention du detail quotidien (date x page x requete). Google lui-meme ne garde que
# 16 mois ; au-dela, le snapshot mensuel (seo_metrics_monthly, par page) prend le relais
# et le detail est purge apres chaque synchro. 0 = ne jamais purger.
GSC_RETENTION_MONTHS = int(os.getenv("GSC_RETENTION_MONTHS", "16"))

# ===== Planification quotidienne (mode --serve) =====
# Chaque nuit a SCHEDULE_HOUR (heure SCHEDULE_TZ), pour chaque site et dans l'ordre :
# crawl incremental (complet le SCHEDULE_FULL_WEEKDAY : 0 = lundi ... 6 = dimanche, -1 =
# jamais), synchro Search Console, mesure de vitesse. Passe par la file seo_jobs comme
# l'UI. 4 h : Google a publie la journee GSC pendant la nuit, et le quota d'inspection
# (remis a zero a minuit heure de Californie = 9 h a Paris) reste entier pour les tests
# manuels de la journee. SEO_SCHEDULE=0 desactive.
SCHEDULE_ENABLED = os.getenv("SEO_SCHEDULE", "1").strip() not in ("0", "false", "non", "")
SCHEDULE_HOUR = int(os.getenv("SEO_SCHEDULE_HOUR", "4"))
SCHEDULE_TZ = os.getenv("SEO_SCHEDULE_TZ", "Europe/Paris")
SCHEDULE_FULL_WEEKDAY = int(os.getenv("SEO_SCHEDULE_FULL_WEEKDAY", "6"))

# ===== Core Web Vitals / PageSpeed Insights (job 'pagespeed') =====
# Un appel = 10 a 40 s (Lighthouse tourne chez Google). Le site entier est donc couvert en
# ROTATION, pas en un run geant : a chaque run, l'accueil + PSI_TOP_PAGES pages les plus
# vues (mobile ET desktop, pour la tendance), plus PSI_ROTATION_PAGES pages jamais
# mesurees ou les plus anciennes (mobile seul). Avec 10 + 30 : ~50 appels, 15 a 30 min
# par run, un site de 1 200 pages couvert en ~40 runs (quotidiens : ~6 semaines).
# Cle : PAGESPEED_API_KEY (ou CRUX_API_KEY) dans le .env du backend (gratuite) ; sans cle,
# le quota anonyme par IP est tres bas et le run s'arrete en 429.
PSI_TOP_PAGES = int(os.getenv("PSI_TOP_PAGES", "10"))
PSI_ROTATION_PAGES = int(os.getenv("PSI_ROTATION_PAGES", "30"))
PSI_STRATEGIES = ["mobile", "desktop"]   # pages cles ; la rotation reste en mobile (index Google)
PSI_TIMEOUT = 120                        # s, par appel
PSI_DELAY = 1.0                          # s entre deux appels (quota par minute)
PSI_HISTORY_KEEP = 30                    # mesures conservees par (url, strategie)

# ===== Audit technique on-page (extrait du HTML déjà crawlé) =====
AUDIT_TITLE_MIN = 30          # title trop court en dessous (notice)
AUDIT_TITLE_MAX = 60          # title trop long au-dessus (notice)
AUDIT_DESC_MIN = 70           # meta description trop courte en dessous (notice)
AUDIT_DESC_MAX = 160          # meta description trop longue au-dessus (notice)
AUDIT_THIN_WORDS = 300        # contenu mince en dessous (avertissement)
AUDIT_DEPTH_ALERT = 4         # profondeur de crawl >= N -> avertissement
AUDIT_SITEMAP_HEAD_CAP = 100  # nb max de HEAD sur les orphelins sitemap (1 run, +politesse)
