#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cc_prospector — Détecteur de prospects e-commerce (PrestaShop / WooCommerce)
============================================================================

Outil de prospection en 2 étapes, 100% sans budget :

  1. discover : interroge Common Crawl (via DuckDB) pour sortir une liste de
                domaines .fr candidats. Pas de fichiers WARC, pas de compte AWS.
  2. detect   : récupère en direct la page d'accueil de chaque domaine, détecte
                la techno (WooCommerce, PrestaShop, Shopify, WordPress) ET enrichit
                (email, téléphone, réseaux sociaux, version, TLS). Export CSV.

La partie envoi d'emails N'EST PAS incluse (volontairement).

Colonnes CSV enrichies (ingérées par le CRM) :
  domain, platform, platform_version, signals, http_status, final_url, title,
  email, phone, facebook_url, instagram_url, ssl_ok, protected, lang, parked,
  + audit gratuit (0 token IA) : mobile_ok, meta_desc, h1_present,
  mentions_legales, rgpd_confidentialite, cookie_banner, analytics, poids_ko,
  copyright_annee, serveur_php, spf, dmarc, ssl_expire_jours,
  + pré-tri prospect : site_type (asso/agence/commerce/autre), ecommerce_actif, error
"""

import argparse
import asyncio
import csv
import gzip
import re
import sys
from pathlib import Path

import httpx

# --------------------------------------------------------------------------- #
#  DÉTECTION DE PLATEFORME
# --------------------------------------------------------------------------- #

HTML_SIGNATURES = {
    "WooCommerce": [
        "wp-content/plugins/woocommerce",
        "woocommerce-page",
        "/wp-json/wc/",
        'content="woocommerce',
        'class="woocommerce',
    ],
    "PrestaShop": [
        'content="prestashop"',
        "var prestashop",
        "/modules/ps_",
        "prestashop-",
        "propulsé par prestashop",
    ],
    "Shopify": [
        "cdn.shopify.com",
        "shopify.theme",
        ".myshopify.com",
    ],
    "WordPress": [
        "wp-content",
        "wp-includes",
        'content="wordpress',
    ],
    # SPIP : CMS très répandu en FR (assos, collectivités, sites institutionnels).
    "SPIP": [
        'content="spip',
        "spip.php",
        "plugins-dist/",
        "local/cache-vignettes",
        "local/cache-gd2",
    ],
    # Drupal : CMS d'assos, agences et gros sites vieillissants (bonnes cibles).
    "Drupal": [
        "/sites/default/files",
        "drupal.settings",
        "data-drupal-",
        'content="drupal',
        "/core/misc/drupal.js",
    ],
}

HEADER_SIGNATURES = {
    "WooCommerce": [("x-powered-by", "woocommerce")],
    "PrestaShop": [("set-cookie", "prestashop"), ("powered-by", "prestashop")],
    "Shopify": [("x-shopify-stage", ""), ("x-shopid", ""), ("server", "shopify")],
    "WordPress": [("x-powered-by", "wordpress"), ("link", "/wp-json/")],
    "SPIP": [("composed-by", "spip"), ("x-spip-cache", "")],
    "Drupal": [("x-generator", "drupal"), ("x-drupal-cache", ""), ("x-drupal-dynamic-cache", "")],
}

PRIORITY = ["WooCommerce", "PrestaShop", "Shopify", "WordPress", "SPIP", "Drupal"]

# Constructeurs no-code / SaaS fermés : le marqueur n'est que dans le CORPS HTML
# (« créé avec Webador », CDN Wix…), jamais dans les entêtes ni le titre. Le crawler
# est le SEUL à voir le HTML complet, donc c'est ici qu'on doit les repérer, sinon ils
# ressortent en « Inconnu » et passent le filtre. Détectés en PRIORITÉ.
NOCODE_HTML_SIGNATURES = {
    "Webador": ["webador", "cdn.webador", "made with webador", "créé avec webador",
                "site créé sur webador", "créé sur webador"],
    "Wix": ["wixstatic", "parastorage", "wix-warmup", "static.wixstatic", "wixsite.com",
            "_wixcss", "wix.com"],
    "Squarespace": ["squarespace", "sqsp.net", "static1.squarespace"],
    "Jimdo": ["jimdo", "jimstatic"],
    "Weebly": ["weebly", "editmysite.com"],
    "e-monsite": ["e-monsite", "emonsite"],
    "SiteW": ["sitew.com", "sitew.fr"],
    "Site123": ["site123"],
    "Strikingly": ["strikingly"],
    "Webflow": ["webflow.io", "assets.website-files.com", "assets-global.website-files.com"],
    "Systeme.io": ["systeme.io", "systemeio"],
    "GoDaddy Website Builder": ["img1.wsimg.com", "websitebuilder"],
}

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
# <meta name="generator" content="WooCommerce 7.9.0"> / "PrestaShop 1.6.1.24" / "WordPress 6.5"
_GENERATOR_RE = re.compile(
    r'<meta[^>]+name=["\']generator["\'][^>]+content=["\']([^"\']+)["\']',
    re.IGNORECASE,
)
# Titres de pages anti-bot / challenge (Cloudflare, captcha) — même liste que le CRM.
ANTIBOT_PATTERNS = [
    "just a moment", "checking your browser", "attention required", "access denied",
    "security check", "verification required", "verify you are", "are you a robot",
    "captcha", "cloudflare", "ddos protection", "please wait",
    "please enable javascript", "enable cookies", "un instant", "vérification en cours",
]

# --------------------------------------------------------------------------- #
#  ENRICHISSEMENT (extraction depuis le HTML déjà en main — aucune requête en +)
# --------------------------------------------------------------------------- #

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
# Emails d'images/hash à ignorer (jamais des contacts réels).
_EMAIL_JUNK = re.compile(r"\.(png|jpe?g|gif|webp|svg|css|js)$", re.IGNORECASE)
# Téléphone FR : 0X XX XX XX XX (avec séparateurs variés) ou +33.
_PHONE_RE = re.compile(r"(?:(?:\+|00)33\s?|0)[1-9](?:[\s.\-]?\d{2}){4}")
_FB_RE = re.compile(r"https?://(?:www\.)?facebook\.com/[A-Za-z0-9_.\-/%]+", re.IGNORECASE)
_IG_RE = re.compile(r"https?://(?:www\.)?instagram\.com/[A-Za-z0-9_.\-/]+", re.IGNORECASE)
# Chemins sociaux à ignorer (pages génériques du réseau, pas le profil de la boutique).
_SOCIAL_JUNK = re.compile(
    r"/(sharer|share|dialog|plugins|tr\?|intent|home|login|policies|help|about|privacy)",
    re.IGNORECASE,
)


def is_antibot_title(title: str) -> bool:
    if not title:
        return False
    low = title.lower()
    return any(p in low for p in ANTIBOT_PATTERNS)


# Signatures de domaine "parké" / en vente / vide (aucun intérêt commercial).
_PARKED_PATTERNS = [
    "domain is for sale", "domaine à vendre", "this domain", "buy this domain",
    "parked", "sedoparking", "afternic", "dan.com", "godaddy.com/domains",
    "site en construction", "under construction", "coming soon", "bientôt disponible",
    "default web page", "apache2 ubuntu default", "welcome to nginx", "index of /",
]


def is_parked(html: str, title: str) -> bool:
    blob = (title + " " + html[:2000]).lower()
    return any(p in blob for p in _PARKED_PATTERNS)


def detect_lang(html: str) -> str:
    """Langue déclarée dans <html lang="..."> (ex 'fr'). '' si absente."""
    m = re.search(r'<html[^>]+lang=["\']([a-zA-Z-]{2,5})["\']', html, re.IGNORECASE)
    return m.group(1).split("-")[0].lower() if m else ""


def detect_platform(html: str, headers: dict) -> tuple[str, list[str]]:
    text = html.lower()
    hdr = {str(k).lower(): str(v).lower() for k, v in headers.items()}
    # No-code EN PRIORITÉ : marqueur dans le corps HTML uniquement. Si détecté, on renvoie
    # le nom du constructeur dans `platform` -> l'ingestion le classe is_nocode et l'écarte.
    for label, toks in NOCODE_HTML_SIGNATURES.items():
        m = next((t for t in toks if t in text), None)
        if m:
            return label, [f"nocode:{m}"]
    matched = {p: [] for p in PRIORITY}
    for platform, sigs in HTML_SIGNATURES.items():
        for s in sigs:
            if s in text:
                matched[platform].append(s)
    for platform, sigs in HEADER_SIGNATURES.items():
        for header_name, needle in sigs:
            val = hdr.get(header_name)
            if val is not None and (needle == "" or needle in val):
                label = f"header:{header_name}" + (f"={needle}" if needle else "")
                matched[platform].append(label)
    for platform in PRIORITY:
        if matched[platform]:
            return platform, matched[platform]
    return "Inconnu", []


def extract_title(html: str) -> str:
    m = _TITLE_RE.search(html)
    if not m:
        return ""
    title = re.sub(r"\s+", " ", m.group(1)).strip()
    return title[:120]


def extract_version(html: str, platform: str) -> str:
    """Version de la plateforme via <meta generator> (ex: 'PrestaShop 1.6.1.24')."""
    for m in _GENERATOR_RE.finditer(html):
        content = m.group(1).strip()
        # Ne garder que si ça correspond à la plateforme détectée (évite un plugin tiers).
        if platform != "Inconnu" and platform.lower() not in content.lower():
            continue
        # Version dotée (7.9.0, 6.5) ou majeure seule (Drupal souvent « Drupal 10 »).
        ver = re.search(r"\d+(?:\.\d+){0,3}", content)
        if ver:
            return f"{content.split()[0]} {ver.group(0)}"[:40]
    return ""


def extract_contacts(html: str, domain: str) -> dict:
    """Email, téléphone, Facebook, Instagram depuis le HTML de la home."""
    out = {"email": "", "phone": "", "facebook_url": "", "instagram_url": ""}

    # Email : on privilégie une adresse du même domaine (contact@la-boutique.fr).
    bare = re.sub(r"^www\.", "", domain.lower())
    emails = [e for e in _EMAIL_RE.findall(html) if not _EMAIL_JUNK.search(e)]
    emails = [e for e in emails if not e.lower().startswith(("wordpress@", "no-reply@sentry"))]
    if emails:
        same = [e for e in emails if e.lower().endswith("@" + bare) or bare in e.lower()]
        out["email"] = (same[0] if same else emails[0]).strip()[:120]

    phones = _PHONE_RE.findall(html)
    if phones:
        # Normalisation légère : on retire les séparateurs.
        out["phone"] = re.sub(r"[\s.\-]", " ", phones[0]).strip()[:20]

    for regex, key in ((_FB_RE, "facebook_url"), (_IG_RE, "instagram_url")):
        for url in regex.findall(html):
            if _SOCIAL_JUNK.search(url):
                continue
            out[key] = url.rstrip('"\').,').strip()[:200]
            break
    return out


# --------------------------------------------------------------------------- #
#  AUDIT GRATUIT DE LA PAGE (0 token IA — que du parsing HTML/entêtes)
#  Chaque signal = un argument commercial concret et vérifiable pour l'approche.
# --------------------------------------------------------------------------- #

_META_DESC_RE = re.compile(
    r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)["\']', re.IGNORECASE)
_VIEWPORT_RE = re.compile(r'<meta[^>]+name=["\']viewport["\']', re.IGNORECASE)
_H1_RE = re.compile(r"<h1[\s>]", re.IGNORECASE)
# © 2019 / &copy; 2020 / Copyright 2021  (année isolée, capturée)
_COPYRIGHT_RE = re.compile(r"(?:©|&copy;|copyright)[^0-9]{0,20}(20\d{2})", re.IGNORECASE)
# Plage d'années "2018-2024" (on prend la borne haute comme "dernière mise à jour").
_YEAR_RANGE_RE = re.compile(r"(20\d{2})\s*[-–]\s*(20\d{2})")

# Liens/pages légaux obligatoires en France (présents en pied de page sur ~toutes les home).
_MENTIONS_MARKERS = ["mentions-legales", "mentions légales", "mentions_legales",
                     "mentions-légales", "/mentions", "legal-notice"]
_PRIVACY_MARKERS = ["politique-de-confidentialite", "politique de confidentialité",
                    "confidentialité", "confidentialite", "donnees-personnelles",
                    "données personnelles", "privacy-policy", "privacy", "vie-privee",
                    "vie privée", "protection-des-donnees", "rgpd", "gdpr"]
# Bandeau cookies : CMP connues + formulations FR/EN courantes.
_COOKIE_MARKERS = ["tarteaucitron", "cookiebot", "axeptio", "didomi", "orejime",
                   "cookie-consent", "cookieconsent", "cookie-law", "cookieyes",
                   "complianz", "accepter les cookies", "gérer les cookies",
                   "politique de cookies", "we use cookies", "ce site utilise des cookies",
                   "utilise des cookies", "gestion des cookies", "consentement"]
# Mesure d'audience / pixels.
_ANALYTICS_MARKERS = ["google-analytics.com", "googletagmanager.com", "gtag/js", "gtag(",
                      "analytics.js", "matomo.js", "matomo.php", "piwik",
                      "connect.facebook.net", "fbevents.js", "fbq(", "static.hotjar.com",
                      "clarity.ms", "plausible.io"]


def analyze_site(html: str, headers: dict) -> dict:
    """Audit gratuit : SEO de base, conformité légale/RGPD, cookies, analytics,
    poids HTML, fraîcheur (année de copyright), fuite de version serveur/PHP."""
    low = html.lower()
    hdr = {str(k).lower(): str(v) for k, v in headers.items()}
    out = {}

    # SEO de base
    out["mobile_ok"] = "oui" if _VIEWPORT_RE.search(html) else "non"
    md = _META_DESC_RE.search(html)
    out["meta_desc"] = "oui" if (md and md.group(1).strip()) else "non"
    out["h1_present"] = "oui" if _H1_RE.search(html) else "non"

    # Conformité légale / RGPD (obligations françaises)
    out["mentions_legales"] = "oui" if any(m in low for m in _MENTIONS_MARKERS) else "non"
    out["rgpd_confidentialite"] = "oui" if any(m in low for m in _PRIVACY_MARKERS) else "non"
    out["cookie_banner"] = "oui" if any(m in low for m in _COOKIE_MARKERS) else "non"

    # Mesure d'audience
    out["analytics"] = "oui" if any(m in low for m in _ANALYTICS_MARKERS) else "non"

    # Poids du HTML (proxy de lourdeur) en Ko
    out["poids_ko"] = str(round(len(html.encode("utf-8", "ignore")) / 1024))

    # Fraîcheur : borne haute des années de copyright trouvées
    years = [int(y) for y in _COPYRIGHT_RE.findall(html)]
    for a, b in _YEAR_RANGE_RE.findall(html):
        years += [int(a), int(b)]
    years = [y for y in years if 2000 <= y <= 2099]
    out["copyright_annee"] = str(max(years)) if years else ""

    # Fuite de version : PHP (X-Powered-By) sinon serveur (Server) — surface d'attaque connue
    xpb = hdr.get("x-powered-by", "")
    srv = hdr.get("server", "")
    leak = ""
    mphp = re.search(r"php/\d+(?:\.\d+){1,3}", xpb, re.IGNORECASE)
    if mphp:
        leak = mphp.group(0).upper().replace("PHP/", "PHP ")
    elif re.search(r"/\d+\.\d", srv):  # Apache/2.2.15, nginx/1.10.3…
        leak = srv[:40]
    out["serveur_php"] = leak
    return out


# --------------------------------------------------------------------------- #
#  QUALIFICATION PROSPECT (pré-tri) — asso / agence / e-commerce réel
#  « Avoir un défaut technique » != « être un bon prospect ». On repère les
#  structures hors cible (sans budget commercial) pour les écarter du tri.
# --------------------------------------------------------------------------- #

# Association / structure sans budget commercial (mots-clés dans le HTML).
_ASSO_MARKERS = [
    "association", "asso loi 1901", "loi 1901", "à but non lucratif", "but non lucratif",
    "non-profit", "nonprofit", "refuge", "sanctuary", "sanctuaire", "fondation", "foundation",
    "bénévol", "benevol", "adhérent", "adherent", "cotisation", "mairie", "commune de",
    "collège", "college ", "lycée", "paroisse", "église", "eglise", "diocèse",
    "club sportif", "association sportive", "amicale", "faites un don", "faire un don",
]
# Bouton/lien « don » = signal quasi infaillible d'asso (href don/donate, ou libellé).
_DON_RE = re.compile(
    r'(faire un don|faites un don|soutenez[- ]nous|>\s*don\s*<|donate|donation|helloasso\.com|'
    r'href=["\'][^"\']*(donate|/don\b|/dons\b|faire-un-don))',
    re.IGNORECASE,
)
# Agence web / studio = concurrent, pas un client.
_AGENCE_MARKERS = [
    "agence web", "agence digitale", "agence de communication", "création de sites",
    "creation de sites", "création de site internet", "web agency", "studio digital",
    "studio web", "nos réalisations", "nos realisations", "développeur web freelance",
    "webmaster freelance", "référencement seo", "agence seo",
]
# E-commerce RÉEL : prix affichés (€) + panier/ajout au panier.
_PRIX_RE = re.compile(r"\d[\d\s.,]*\s?(?:€|eur\b)|(?:€|eur)\s?\d", re.IGNORECASE)
_PANIER_MARKERS = ["ajouter au panier", "add to cart", "add-to-cart", "/panier", "/cart",
                   "mon panier", "voir le panier", "ajouter au devis", "in den warenkorb"]


def classify_site(html: str, domain: str) -> dict:
    """Renvoie {site_type: asso|agence|commerce|autre, ecommerce_actif: oui|non}.
    Prudent : en cas de doute -> 'autre' (le pré-tri gardera le site)."""
    low = html.lower()
    d = (domain or "").lower()
    out = {"site_type": "autre", "ecommerce_actif": "non"}

    # E-commerce réel : au moins un prix ET un signal de panier (vraie boutique qui vend).
    if _PRIX_RE.search(html) and any(m in low for m in _PANIER_MARKERS):
        out["ecommerce_actif"] = "oui"

    # Association / public / sans budget (le don prime, très fiable).
    if _DON_RE.search(html) or d.endswith(".org") or ".asso.fr" in d \
            or any(m in low for m in _ASSO_MARKERS):
        out["site_type"] = "asso"
        return out

    # Agence web (concurrent).
    if any(m in low for m in _AGENCE_MARKERS):
        out["site_type"] = "agence"
        return out

    # Commerce si vraie activité e-commerce détectée.
    if out["ecommerce_actif"] == "oui":
        out["site_type"] = "commerce"
    return out


# --------------------------------------------------------------------------- #
#  ÉTAPE 2 : DÉTECTION EN DIRECT (async)
# --------------------------------------------------------------------------- #

UA = (
    "Mozilla/5.0 (compatible; PixFeedProspector/1.0; +https://pixfeed.net) "
    "AppleWebKit/537.36"
)

CSV_FIELDS = [
    "domain", "platform", "platform_version", "signals", "http_status",
    "final_url", "title", "email", "phone", "facebook_url", "instagram_url",
    "ssl_ok", "protected", "lang", "parked",
    # --- audit gratuit ajouté ---
    "mobile_ok", "meta_desc", "h1_present", "mentions_legales", "rgpd_confidentialite",
    "cookie_banner", "analytics", "poids_ko", "copyright_annee", "serveur_php",
    "spf", "dmarc", "ssl_expire_jours",
    # --- pré-tri prospect ---
    "site_type", "ecommerce_actif",
    "error",
]

# Pages où chercher un email si la home n'en donne pas (obligatoires en FR -> presque toujours là).
CONTACT_PATHS = ["/contact", "/nous-contacter", "/mentions-legales", "/contact-us"]


def _bare_domain(domain: str) -> str:
    d = re.sub(r"^https?://", "", domain.strip().lower()).split("/")[0]
    return d[4:] if d.startswith("www.") else d


async def check_dns(bare_domain: str, timeout: float, client=None) -> dict:
    """SPF / DMARC via DNS-over-HTTPS (dns.google) — pas de résolveur DNS local requis.
    'oui'/'non' si la requête aboutit, '' (inconnu) si le lookup échoue.
    `client` : client httpx partagé (réutilise la connexion à dns.google sur tout le run)."""
    out = {"spf": "", "dmarc": ""}
    if not bare_domain:
        return out
    owned = client is None
    if owned:
        client = httpx.AsyncClient(timeout=min(timeout, 6.0), follow_redirects=True,
                                   headers={"accept": "application/dns-json"})
    try:
        # Les deux lookups sont indépendants : en parallèle.
        r, r2 = await asyncio.gather(
            client.get("https://dns.google/resolve",
                       params={"name": bare_domain, "type": "TXT"}),
            client.get("https://dns.google/resolve",
                       params={"name": f"_dmarc.{bare_domain}", "type": "TXT"}),
        )
        txts = " ".join(a.get("data", "") for a in r.json().get("Answer", [])).lower()
        out["spf"] = "oui" if "v=spf1" in txts else "non"
        t2 = " ".join(a.get("data", "") for a in r2.json().get("Answer", [])).lower()
        out["dmarc"] = "oui" if "v=dmarc1" in t2 else "non"
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        pass  # lookup indisponible / réponse illisible -> inconnu
    finally:
        if owned:
            await client.aclose()
    return out


def _ssl_days_sync(host: str, timeout: float) -> str:
    """Jours restants avant expiration du certificat TLS (handshake direct sur :443)."""
    import ssl
    import socket
    from datetime import datetime, timezone
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=min(timeout, 6.0)) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ss:
                cert = ss.getpeercert()
        na = cert.get("notAfter") if cert else None
        if not na:
            return ""
        exp = datetime.strptime(na, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        return str((exp - datetime.now(timezone.utc)).days)
    except Exception:
        return ""


async def ssl_expiry_days(host: str, timeout: float) -> str:
    try:
        return await asyncio.to_thread(_ssl_days_sync, host, timeout)
    except Exception:
        return ""


async def find_email_on_contact(client, base_url, domain):
    """Fetch cible des pages contact/mentions pour récupérer un email si la home n'en a pas."""
    for path in CONTACT_PATHS:
        try:
            r = await client.get(base_url.rstrip("/") + path)
            if r.status_code == 200:
                c = extract_contacts(r.text or "", domain)
                if c["email"]:
                    return c["email"]
        except Exception:
            continue
    return ""


def candidate_urls(domain: str) -> list[str]:
    d = domain.strip().lower()
    d = re.sub(r"^https?://", "", d)
    d = d.split("/")[0]
    if not d:
        return []
    bare = d[4:] if d.startswith("www.") else d
    return [f"https://{bare}", f"https://www.{bare}", f"http://{bare}"]


# Plafond de lecture d'une page : une home fait 50 à 500 Ko ; au-delà de 3 Mo c'est
# un fichier aberrant qui monopoliserait un slot de concurrence pour rien.
MAX_HTML_BYTES = 3 * 1024 * 1024

# Erreurs réseau TRANSITOIRES : ça vaut le coup de retenter (un site lent une fois
# n'est pas un site mort — sans retry on perd le prospect définitivement).
TRANSIENT_ERRORS = (
    httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout,
    httpx.ConnectError, httpx.ReadError, httpx.RemoteProtocolError,
)


def _is_tls_error(exc: Exception) -> bool:
    """httpx enveloppe les erreurs TLS dans ConnectError : on regarde aussi la cause."""
    cause = getattr(exc, "__cause__", None)
    blob = f"{type(exc).__name__} {exc} {type(cause).__name__} {cause}".lower()
    return "ssl" in blob or "certificate" in blob or "tlsv1" in blob


async def _get_capped(client, url: str):
    """GET avec plafond de lecture. Retourne (response, html)."""
    async with client.stream("GET", url) as r:
        chunks, total = [], 0
        async for chunk in r.aiter_bytes():
            chunks.append(chunk)
            total += len(chunk)
            if total >= MAX_HTML_BYTES:
                break
        body = b"".join(chunks)
    try:
        html = body.decode(r.encoding or "utf-8", "replace")
    except (LookupError, UnicodeDecodeError):
        html = body.decode("utf-8", "replace")
    return r, html


async def _fetch_with_retry(client, url: str, retries: int):
    """GET plafonné + retry court sur erreur transitoire.
    Retourne (response|None, html, erreur, erreur_tls).
    N'attrape QUE les erreurs réseau : un bug de code remonte au lieu d'être
    maquillé en « site injoignable »."""
    last_err, tls = "", False
    for attempt in range(retries + 1):
        try:
            r, html = await _get_capped(client, url)
            return r, html, "", False
        except httpx.HTTPError as e:
            last_err = f"{type(e).__name__}: {str(e)[:80]}"
            tls = _is_tls_error(e)
            # Inutile de retenter à l'identique une erreur TLS ou non transitoire.
            if tls or not isinstance(e, TRANSIENT_ERRORS) or attempt == retries:
                break
            await asyncio.sleep(0.5 * (attempt + 1))
    return None, "", last_err, tls


async def detect_one(domain: str, sem, timeout: float, clients: dict, retries: int = 1) -> dict:
    result = {k: "" for k in CSV_FIELDS}
    result["domain"] = domain
    result["platform"] = "Inconnu"
    async with sem:
        last_err = ""
        for url in candidate_urls(domain):
            is_https = url.startswith("https://")
            # 1) Essai avec vérification TLS stricte -> ssl_ok = oui/non (signal de vente).
            #    2) Si l'erreur est TLS, on refait sans vérif pour ne pas perdre le prospect.
            for verify in (True, False):
                client = clients[verify]
                r, html, err, tls = await _fetch_with_retry(client, url, retries)
                if r is None:
                    last_err = err or last_err
                    if verify and tls and is_https:
                        continue  # on retente le MÊME url sans vérif TLS
                    break         # autre erreur -> URL candidate suivante

                platform, signals = detect_platform(html, dict(r.headers))
                title = extract_title(html)
                protected = is_antibot_title(title)
                contacts = extract_contacts(html, domain)
                # Email de secours : si la home n'en donne pas, on tente les pages contact.
                if not contacts["email"] and not protected:
                    contacts["email"] = await find_email_on_contact(client, str(r.url), domain)
                # Audit gratuit (HTML/entêtes) + DNS (SPF/DMARC) + expiration TLS.
                site = analyze_site(html, dict(r.headers))
                site.update(classify_site(html, domain))  # pré-tri : asso/agence/commerce
                bare = _bare_domain(domain)
                final_https = str(r.url).lower().startswith("https")
                # DNS et handshake TLS sont indépendants -> en parallèle (2 attentes -> 1).
                if final_https:
                    dns, ssl_days = await asyncio.gather(
                        check_dns(bare, timeout, clients.get("dns")),
                        ssl_expiry_days(r.url.host or bare, timeout),
                    )
                else:
                    dns, ssl_days = await check_dns(bare, timeout, clients.get("dns")), ""
                result.update(
                    platform=platform,
                    platform_version=extract_version(html, platform),
                    signals=" | ".join(signals),
                    http_status=str(r.status_code),
                    final_url=str(r.url),
                    title="" if protected else title,
                    ssl_ok=("oui" if (is_https and verify) else ("non" if is_https else "")),
                    protected=("oui" if protected else "non"),
                    lang=detect_lang(html),
                    parked=("oui" if is_parked(html, title) else "non"),
                    ssl_expire_jours=ssl_days,
                    error="",
                    **contacts,
                    **site,
                    **dns,
                )
                return result
        result["error"] = last_err or "no response"
        return result


async def run_detect(domains, output, concurrency, timeout, retries=1):
    sem = asyncio.Semaphore(concurrency)
    total = len(domains)
    done = 0
    counts = {}
    enriched = {"email": 0, "phone": 0, "social": 0}
    audit = {"mentions_ko": 0, "mobile_ko": 0, "spf_ko": 0, "ssl_bientot": 0}

    # Clients HTTP créés UNE FOIS pour tout le run (au lieu d'un par tentative) :
    # le pool de connexions et les contextes TLS sont réutilisés. Deux clients car
    # `verify` se fixe à la construction : strict d'abord, permissif en repli.
    limits = httpx.Limits(max_connections=max(concurrency * 2, 10),
                          max_keepalive_connections=max(concurrency, 5))
    common = dict(headers={"User-Agent": UA}, follow_redirects=True,
                  timeout=timeout, limits=limits)

    with open(output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        async with httpx.AsyncClient(verify=True, **common) as c_strict, \
                httpx.AsyncClient(verify=False, **common) as c_loose, \
                httpx.AsyncClient(timeout=min(timeout, 6.0), follow_redirects=True,
                                  headers={"accept": "application/dns-json"},
                                  limits=limits) as c_dns:
            clients = {True: c_strict, False: c_loose, "dns": c_dns}
            tasks = [detect_one(d, sem, timeout, clients, retries) for d in domains]
            for coro in asyncio.as_completed(tasks):
                res = await coro
                writer.writerow(res)
                f.flush()
                done += 1
                counts[res["platform"]] = counts.get(res["platform"], 0) + 1
                if res["email"]:
                    enriched["email"] += 1
                if res["phone"]:
                    enriched["phone"] += 1
                if res["facebook_url"] or res["instagram_url"]:
                    enriched["social"] += 1
                if res.get("mentions_legales") == "non":
                    audit["mentions_ko"] += 1
                if res.get("mobile_ok") == "non":
                    audit["mobile_ko"] += 1
                if res.get("spf") == "non":
                    audit["spf_ko"] += 1
                sd = res.get("ssl_expire_jours")
                if sd not in (None, "") and sd.lstrip("-").isdigit() and int(sd) < 30:
                    audit["ssl_bientot"] += 1
                if done % 25 == 0 or done == total:
                    print(f"  ... {done}/{total} traités", file=sys.stderr)

    print(f"\nTerminé : {total} domaines -> {output}")
    print("Répartition plateforme :")
    for platform in sorted(counts, key=lambda p: -counts[p]):
        print(f"  {platform:14} {counts[platform]}")
    print("Enrichissement :")
    print(f"  email          {enriched['email']}")
    print(f"  téléphone      {enriched['phone']}")
    print(f"  réseau social  {enriched['social']}")
    print("Signaux d'approche (audit gratuit) :")
    print(f"  sans mentions légales   {audit['mentions_ko']}")
    print(f"  non responsive (mobile) {audit['mobile_ko']}")
    print(f"  sans SPF (emails->spam) {audit['spf_ko']}")
    print(f"  SSL expire < 30 j       {audit['ssl_bientot']}")


# --------------------------------------------------------------------------- #
#  ÉTAPE 1 : DÉCOUVERTE VIA COMMON CRAWL (DuckDB) — inchangée
# --------------------------------------------------------------------------- #

CC_READ_BASE = "https://data.commoncrawl.org"
CC_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
         "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


def list_cc_parquet_urls(crawl: str) -> list[str]:
    manifest_url = f"{CC_READ_BASE}/crawl-data/{crawl}/cc-index-table.paths.gz"
    with httpx.Client(timeout=60.0, follow_redirects=True,
                      headers={"User-Agent": CC_UA}) as client:
        r = client.get(manifest_url)
        r.raise_for_status()
        text = gzip.decompress(r.content).decode("utf-8", errors="replace")
    urls = []
    for line in text.splitlines():
        line = line.strip()
        if not line or not line.endswith(".parquet"):
            continue
        if "/subset=warc/" not in line:
            continue
        urls.append(line if line.startswith("http") else f"{CC_READ_BASE}/{line.lstrip('/')}")
    return urls


def build_discover_sql(file_array, tld, mode, max_domains, exclude=None):
    where = [f"url_host_tld = '{tld}'", "fetch_status = 200"]
    woo = ("url_path LIKE '%/product-category/%' OR url_path LIKE '%/product/%' "
           "OR url_query LIKE '%add-to-cart=%'")
    presta = ("url_query LIKE '%id_product=%' OR url_query LIKE '%controller=product%' "
              "OR url_query LIKE '%controller=category%'")
    if mode == "woocommerce":
        where += ["content_mime_type = 'text/html'", f"({woo})"]
    elif mode == "prestashop":
        where += ["content_mime_type = 'text/html'", f"({presta})"]
    elif mode == "ecommerce":
        where += ["content_mime_type = 'text/html'", f"({woo} OR {presta})"]
    elif mode == "html":
        where.append("content_mime_type = 'text/html'")
    if exclude:
        in_list = ", ".join("'" + d.replace("'", "''") + "'" for d in exclude)
        where.append(f"url_host_registered_domain NOT IN ({in_list})")
    limit = f"\nLIMIT {max_domains}" if max_domains else ""
    return ("SELECT DISTINCT url_host_registered_domain AS domain\n"
            f"FROM read_parquet({file_array})\nWHERE {' AND '.join(where)}{limit}")


def discover(crawl, tld, mode, max_domains, output, parquet, exclude_file=""):
    import duckdb
    print("Listage des fichiers de l'index Common Crawl (HTTPS anonyme)...", file=sys.stderr)
    try:
        files = list_cc_parquet_urls(crawl)
    except Exception as e:
        print(f"\nÉchec du listage : {e}", file=sys.stderr)
        sys.exit(1)
    if not files:
        print(f"\nAucun fichier pour le crawl '{crawl}'.", file=sys.stderr)
        sys.exit(1)
    print(f"{len(files)} fichiers Parquet trouvés.", file=sys.stderr)

    file_array = "[" + ", ".join("'" + u + "'" for u in files) + "]"
    exclude = []
    if exclude_file and Path(exclude_file).exists():
        exclude = [d.strip() for d in Path(exclude_file).read_text(encoding="utf-8").splitlines() if d.strip()]
        if exclude:
            print(f"{len(exclude)} domaines déjà connus seront exclus.", file=sys.stderr)
    sql = build_discover_sql(file_array, tld, mode, max_domains, exclude)
    print("Requête (lecture HTTPS anonyme) :\n" + "-" * 60)
    print(sql.replace(file_array, f"[{len(files)} fichiers Parquet HTTPS...]"))
    print("-" * 60)
    if mode == "html":
        print("ATTENTION : mode 'html' = scan large, plusieurs Go. Mets --max-domains.", file=sys.stderr)

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    try:
        con.execute("CREATE SECRET cc_http (TYPE HTTP, EXTRA_HTTP_HEADERS MAP "
                    "{'User-Agent': '" + CC_UA + "'})")
    except Exception:
        pass
    print("Lecture de l'index en cours...", file=sys.stderr)
    try:
        rows = con.execute(sql).fetchall()
    except Exception as e:
        print(f"\nÉchec de la requête : {e}", file=sys.stderr)
        sys.exit(1)
    domains = sorted({r[0] for r in rows if r[0]})
    Path(output).write_text("\n".join(domains) + "\n", encoding="utf-8")
    print(f"\n{len(domains)} domaines uniques -> {output}")


# --------------------------------------------------------------------------- #
#  ENTRÉE / SORTIE & CLI
# --------------------------------------------------------------------------- #

def load_domains(path: str) -> list[str]:
    p = Path(path)
    if not p.exists():
        sys.exit(f"Fichier introuvable : {path}")
    domains = []
    if p.suffix.lower() == ".csv":
        with open(p, newline="", encoding="utf-8") as f:
            for row in csv.reader(f):
                if row and row[0] and row[0].lower() != "domain":
                    domains.append(row[0].strip())
    else:
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                domains.append(line)
    seen, out = set(), []
    for d in domains:
        if d not in seen:
            seen.add(d)
            out.append(d)
    return out


def main():
    parser = argparse.ArgumentParser(
        description="Détecteur de prospects e-commerce via Common Crawl + détection en direct.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    d = sub.add_parser("discover", help="Sortir des domaines depuis Common Crawl")
    d.add_argument("--crawl", required=True, help="ID du crawl (voir index.commoncrawl.org)")
    d.add_argument("--tld", default="fr")
    d.add_argument("--mode", choices=["ecommerce", "woocommerce", "prestashop", "html"], default="ecommerce")
    d.add_argument("--max-domains", type=int, default=0)
    d.add_argument("--output", default="domains.txt")
    d.add_argument("--exclude", default="")
    d.add_argument("--parquet", default="")

    det = sub.add_parser("detect", help="Détecter la techno + enrichir en direct")
    det.add_argument("--input", required=True)
    det.add_argument("--output", default="prospects.csv")
    det.add_argument("--concurrency", type=int, default=10)
    det.add_argument("--timeout", type=float, default=10.0)
    det.add_argument("--retries", type=int, default=1,
                     help="Tentatives supplémentaires sur erreur réseau transitoire")

    r = sub.add_parser("run", help="discover puis detect")
    r.add_argument("--crawl", required=True)
    r.add_argument("--tld", default="fr")
    r.add_argument("--mode", choices=["ecommerce", "woocommerce", "prestashop", "html"], default="ecommerce")
    r.add_argument("--max-domains", type=int, default=0)
    r.add_argument("--output", default="prospects.csv")
    r.add_argument("--exclude", default="")
    r.add_argument("--concurrency", type=int, default=10)
    r.add_argument("--timeout", type=float, default=10.0)
    r.add_argument("--retries", type=int, default=1,
                   help="Tentatives supplémentaires sur erreur réseau transitoire")
    r.add_argument("--parquet", default="")

    args = parser.parse_args()

    if args.command == "discover":
        discover(args.crawl, args.tld, args.mode, args.max_domains, args.output, args.parquet, args.exclude)
    elif args.command == "detect":
        domains = load_domains(args.input)
        if not domains:
            sys.exit("Aucun domaine à traiter.")
        print(f"Détection sur {len(domains)} domaines (concurrence {args.concurrency})...")
        asyncio.run(run_detect(domains, args.output, args.concurrency, args.timeout, args.retries))
    elif args.command == "run":
        discover(args.crawl, args.tld, args.mode, args.max_domains, "domains.txt", args.parquet, args.exclude)
        domains = load_domains("domains.txt")
        if not domains:
            sys.exit("Aucun domaine trouvé.")
        print(f"\nDétection sur {len(domains)} domaines...")
        asyncio.run(run_detect(domains, args.output, args.concurrency, args.timeout, args.retries))


if __name__ == "__main__":
    main()
