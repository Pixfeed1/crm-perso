"""Configuration du worker SEO.

MULTI-SITE : ajouter un site = ajouter une entrée ici (le worker upsert seo_sites au démarrage).
Aucune reconfiguration Google nécessaire : une seule connexion sert tous les sites (étape 2).
"""

# Sites suivis. gsc_property servira à l'étape 2 (Search Console).
SITES = [
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

# ===== Audit technique on-page (extrait du HTML déjà crawlé) =====
AUDIT_TITLE_MIN = 30          # title trop court en dessous (notice)
AUDIT_TITLE_MAX = 60          # title trop long au-dessus (notice)
AUDIT_DESC_MIN = 70           # meta description trop courte en dessous (notice)
AUDIT_DESC_MAX = 160          # meta description trop longue au-dessus (notice)
AUDIT_THIN_WORDS = 300        # contenu mince en dessous (avertissement)
AUDIT_DEPTH_ALERT = 4         # profondeur de crawl >= N -> avertissement
AUDIT_SITEMAP_HEAD_CAP = 100  # nb max de HEAD sur les orphelins sitemap (1 run, +politesse)
