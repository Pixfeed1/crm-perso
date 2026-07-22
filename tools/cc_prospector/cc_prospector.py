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
  email, phone, facebook_url, instagram_url, ssl_ok, protected, error
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
}

HEADER_SIGNATURES = {
    "WooCommerce": [("x-powered-by", "woocommerce")],
    "PrestaShop": [("set-cookie", "prestashop"), ("powered-by", "prestashop")],
    "Shopify": [("x-shopify-stage", ""), ("x-shopid", ""), ("server", "shopify")],
    "WordPress": [("x-powered-by", "wordpress"), ("link", "/wp-json/")],
}

PRIORITY = ["WooCommerce", "PrestaShop", "Shopify", "WordPress"]

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
        ver = re.search(r"\d+(?:\.\d+){1,3}", content)
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
#  ÉTAPE 2 : DÉTECTION EN DIRECT (async)
# --------------------------------------------------------------------------- #

UA = (
    "Mozilla/5.0 (compatible; PixFeedProspector/1.0; +https://pixfeed.net) "
    "AppleWebKit/537.36"
)

CSV_FIELDS = [
    "domain", "platform", "platform_version", "signals", "http_status",
    "final_url", "title", "email", "phone", "facebook_url", "instagram_url",
    "ssl_ok", "protected", "lang", "parked", "error",
]

# Pages où chercher un email si la home n'en donne pas (obligatoires en FR -> presque toujours là).
CONTACT_PATHS = ["/contact", "/nous-contacter", "/mentions-legales", "/contact-us"]


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


async def _fetch(client, url, verify):
    """Un GET. verify=True d'abord (pour capter ssl_ok), sinon retombe sur verify=False."""
    return await client.get(url)


async def detect_one(domain: str, sem, timeout: float) -> dict:
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
                try:
                    async with httpx.AsyncClient(
                        headers={"User-Agent": UA}, follow_redirects=True,
                        timeout=timeout, verify=verify,
                    ) as client:
                        r = await client.get(url)
                        html = r.text or ""
                        platform, signals = detect_platform(html, dict(r.headers))
                        title = extract_title(html)
                        protected = is_antibot_title(title)
                        contacts = extract_contacts(html, domain)
                        # Email de secours : si la home n'en donne pas, on tente les pages contact.
                        if not contacts["email"] and not protected:
                            contacts["email"] = await find_email_on_contact(client, str(r.url), domain)
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
                        error="",
                        **contacts,
                    )
                    return result
                except (httpx.ConnectError, httpx.ConnectTimeout, Exception) as e:
                    name = type(e).__name__
                    last_err = f"{name}: {str(e)[:80]}"
                    is_tls = "ssl" in name.lower() or "certificate" in str(e).lower()
                    if verify and is_tls and is_https:
                        continue  # on retente le MÊME url sans vérif TLS
                    break  # autre erreur -> on passe à l'URL candidate suivante
        result["error"] = last_err or "no response"
        return result


async def run_detect(domains, output, concurrency, timeout):
    sem = asyncio.Semaphore(concurrency)
    total = len(domains)
    done = 0
    counts = {}
    enriched = {"email": 0, "phone": 0, "social": 0}

    with open(output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        tasks = [detect_one(d, sem, timeout) for d in domains]
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

    r = sub.add_parser("run", help="discover puis detect")
    r.add_argument("--crawl", required=True)
    r.add_argument("--tld", default="fr")
    r.add_argument("--mode", choices=["ecommerce", "woocommerce", "prestashop", "html"], default="ecommerce")
    r.add_argument("--max-domains", type=int, default=0)
    r.add_argument("--output", default="prospects.csv")
    r.add_argument("--exclude", default="")
    r.add_argument("--concurrency", type=int, default=10)
    r.add_argument("--timeout", type=float, default=10.0)
    r.add_argument("--parquet", default="")

    args = parser.parse_args()

    if args.command == "discover":
        discover(args.crawl, args.tld, args.mode, args.max_domains, args.output, args.parquet, args.exclude)
    elif args.command == "detect":
        domains = load_domains(args.input)
        if not domains:
            sys.exit("Aucun domaine à traiter.")
        print(f"Détection sur {len(domains)} domaines (concurrence {args.concurrency})...")
        asyncio.run(run_detect(domains, args.output, args.concurrency, args.timeout))
    elif args.command == "run":
        discover(args.crawl, args.tld, args.mode, args.max_domains, "domains.txt", args.parquet, args.exclude)
        domains = load_domains("domains.txt")
        if not domains:
            sys.exit("Aucun domaine trouvé.")
        print(f"\nDétection sur {len(domains)} domaines...")
        asyncio.run(run_detect(domains, args.output, args.concurrency, args.timeout))


if __name__ == "__main__":
    main()
