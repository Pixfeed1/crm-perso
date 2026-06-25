"""Lecture WordPress via l'API REST, TOLÉRANTE (aucune dépendance à un plugin précis).

- Découverte dynamique des types de contenu exposés (posts, pages, CPT) via /wp-json/wp/v2/types.
- Listing paginé (per_page=100).
- Métadonnées SEO extraites du <head> HTML (marche sur Yoast / Rank Math / SEOPress / natif)
  + bonus yoast_head_json si présent.
- Extraction des liens internes (même domaine).
"""
import re
from urllib.parse import urljoin, urlparse, urldefrag

import requests
from bs4 import BeautifulSoup

import config

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": config.USER_AGENT})
_SESSION.max_redirects = config.MAX_REDIRECTS  # évite les boucles de redirection

_SKIP_EXT = re.compile(r"\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|mp3|css|js|ico)(\?|$)", re.I)
_SKIP_PATH = re.compile(r"/(wp-admin|wp-login|wp-json|feed|comments)(/|$)", re.I)


def _get(url, **kw):
    return _SESSION.get(url, timeout=config.HTTP_TIMEOUT, **kw)


def normalize_url(url):
    """Canonicalise : sans fragment, host en minuscules, sans slash final (sauf racine)."""
    if not url:
        return None
    url, _ = urldefrag(url)
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        return None
    path = p.path or "/"
    if len(path) > 1 and path.endswith("/"):
        path = path[:-1]
    netloc = p.netloc.lower()
    # On ignore la query pour rattacher les liens aux permaliens (évite les doublons).
    return f"{p.scheme}://{netloc}{path}"


def same_domain(url, domain):
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return False
    return host == domain or host.endswith("." + domain)


def discover_content_types(base_url):
    """Renvoie la liste des rest_base des types exposés (posts, pages, CPT)."""
    try:
        r = _get(f"{base_url}/wp-json/wp/v2/types")
        r.raise_for_status()
        types = r.json()
    except Exception as e:
        print(f"[wp] découverte types échouée ({base_url}): {e}")
        return ["posts", "pages"]
    bases = []
    for _, meta in (types or {}).items():
        rb = meta.get("rest_base")
        if rb:
            bases.append(rb)
    # Toujours au moins posts + pages.
    for must in ("posts", "pages"):
        if must not in bases:
            bases.append(must)
    return bases


def list_content(base_url):
    """Liste TOUS les contenus (métadonnées seulement, sans HTML) de tous les types exposés,
    triés par wp_id croissant. Matérialisé en liste -> permet d'afficher i/N et de reprendre.
    Ordre par id asc (orderby=id&order=asc) pour une reprise déterministe via last_wp_id.
    """
    items = []
    for rest_base in discover_content_types(base_url):
        page = 1
        while True:
            try:
                r = _get(
                    f"{base_url}/wp-json/wp/v2/{rest_base}",
                    params={"per_page": 100, "page": page, "_embed": 1,
                            "orderby": "id", "order": "asc"},
                )
            except Exception as e:
                print(f"[wp] {rest_base} p{page} erreur: {e}")
                break
            if r.status_code == 400:
                break  # page au-delà de la dernière
            if not r.ok:
                print(f"[wp] {rest_base} p{page} HTTP {r.status_code}")
                break
            try:
                data = r.json()
            except Exception as e:
                print(f"[wp] {rest_base} p{page} JSON invalide: {e}")
                break
            if not isinstance(data, list) or not data:
                break
            for it in data:
                items.append(_normalize_item(it, rest_base))
            total_pages = int(r.headers.get("X-WP-TotalPages", "1") or 1)
            if page >= total_pages:
                break
            page += 1
    # Tri global par wp_id croissant (None en dernier).
    items.sort(key=lambda x: (x["wp_id"] is None, x["wp_id"] or 0))
    return items


def _normalize_item(it, rest_base):
    url = normalize_url(it.get("link"))
    title = ""
    if isinstance(it.get("title"), dict):
        title = it["title"].get("rendered", "")
    category = _first_category(it)
    return {
        "wp_id": it.get("id"),
        "url": url,
        "title": _strip_html(title),
        "type": it.get("type") or rest_base,
        "category": category,
        "modified_at": it.get("modified_gmt") or it.get("modified"),
        "_yoast": it.get("yoast_head_json") if isinstance(it.get("yoast_head_json"), dict) else None,
    }


def _first_category(it):
    """Tente de récupérer un libellé de catégorie via _embedded (tolérant)."""
    emb = it.get("_embedded") or {}
    terms = emb.get("wp:term") or []
    for group in terms:
        for t in group or []:
            tax = (t or {}).get("taxonomy")
            if tax in ("category", "post_tag") and t.get("name"):
                return t["name"]
    return None


def _strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def fetch_html(url):
    """Récupère le HTML d'une page. Tolérant : timeout, boucles de redirection, etc. -> None."""
    try:
        r = _get(url)
        if r.ok and "text/html" in r.headers.get("Content-Type", ""):
            return r.text
        if not r.ok:
            print(f"[wp] fetch_html {url}: HTTP {r.status_code}")
    except requests.exceptions.TooManyRedirects:
        print(f"[wp] fetch_html {url}: boucle de redirection (> {config.MAX_REDIRECTS})")
    except requests.exceptions.Timeout:
        print(f"[wp] fetch_html {url}: timeout (> {config.HTTP_TIMEOUT}s)")
    except requests.exceptions.RequestException as e:
        print(f"[wp] fetch_html {url}: {e}")
    except Exception as e:
        print(f"[wp] fetch_html {url}: {e}")
    return None


def extract_links(html, page_url, domain):
    """Liens internes (même domaine) sortant de la page. Renvoie [(to_url, anchor)].
    Tolérant : toute erreur de parsing -> liste vide (jamais d'exception remontée)."""
    out = []
    seen = set()
    try:
        soup = BeautifulSoup(html, "lxml")
    except Exception as e:
        print(f"[wp] extract_links parse {page_url}: {e}")
        return out
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        absolute = urljoin(page_url, href)
        if not same_domain(absolute, domain):
            continue
        if _SKIP_EXT.search(absolute) or _SKIP_PATH.search(absolute):
            continue
        to_url = normalize_url(absolute)
        if not to_url or to_url == page_url:
            continue
        anchor = a.get_text(" ", strip=True)[:200] or ""
        key = (to_url, anchor)
        if key in seen:
            continue
        seen.add(key)
        out.append((to_url, anchor))
    return out


def extract_seo_meta(html, yoast=None):
    """Métadonnées SEO depuis le <head> (tous plugins) + bonus yoast_head_json."""
    meta = {}
    try:
        soup = BeautifulSoup(html, "lxml")
        head = soup.head or soup
        if soup.title and soup.title.string:
            meta["title"] = soup.title.string.strip()
        md = head.find("meta", attrs={"name": "description"})
        if md and md.get("content"):
            meta["description"] = md["content"].strip()
        robots = head.find("meta", attrs={"name": "robots"})
        if robots and robots.get("content"):
            meta["robots"] = robots["content"].strip()
            meta["noindex"] = "noindex" in meta["robots"].lower()
        canon = head.find("link", attrs={"rel": "canonical"})
        if canon and canon.get("href"):
            meta["canonical"] = canon["href"].strip()
        og = {}
        for tag in head.find_all("meta", property=re.compile(r"^og:")):
            if tag.get("content"):
                og[tag["property"]] = tag["content"].strip()
        if og:
            meta["og"] = og
    except Exception as e:
        print(f"[wp] extract_seo_meta: {e}")
    if yoast:
        meta.setdefault("title", yoast.get("title"))
        meta.setdefault("description", yoast.get("description"))
        if "robots" in yoast and isinstance(yoast["robots"], dict):
            idx = yoast["robots"].get("index")
            if idx:
                meta.setdefault("noindex", idx == "noindex")
        meta["source_plugin"] = "yoast"
    return meta
