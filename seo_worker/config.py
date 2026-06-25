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

# Heuristique value_score par catégorie (0..100). Les piliers Blender/3D sont prioritaires.
# Correspondance par sous-chaîne (insensible à la casse) sur la catégorie/slug WP.
CATEGORY_VALUE = [
    (["blender", "3d", "modélisation", "modelisation", "rendu", "geometry", "shader"], 90),
    (["tutoriel", "tutorial", "guide", "glossaire"], 75),
    (["blog", "article", "actualité", "actualite", "news"], 50),
]
VALUE_DEFAULT = 40          # catégorie inconnue
VALUE_HOME_HUB = 100        # accueil / hubs

# Seuils de santé (sur le pagerank normalisé 0..1 relatif au max du site).
HEALTH_AFFAMEE_PR_RATIO = 0.25   # pagerank < 25% du max
HEALTH_AFFAMEE_VALUE_MIN = 70    # et value_score élevé -> "affamée"
HEALTH_RESERVOIR_PR_RATIO = 0.6  # pagerank >= 60% du max -> réservoir/hub

# User-Agent du crawler.
USER_AGENT = "PixFeedSEO/1.0 (+https://crm.pixfeed.net)"
HTTP_TIMEOUT = 20
