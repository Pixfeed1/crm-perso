"""Lecture WordPress via l'API REST, TOLÉRANTE (aucune dépendance à un plugin précis).

- Découverte dynamique des types de contenu exposés (posts, pages, CPT) via /wp-json/wp/v2/types.
- Listing paginé (per_page=100).
- Métadonnées SEO extraites du <head> HTML (marche sur Yoast / Rank Math / SEOPress / natif)
  + bonus yoast_head_json si présent.
- Extraction des liens internes (même domaine).
"""
import html
import re
import time
from urllib.parse import urljoin, urlparse, urldefrag

import requests
from bs4 import BeautifulSoup

import config

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": config.USER_AGENT})
_SESSION.max_redirects = config.MAX_REDIRECTS  # évite les boucles de redirection

# Extensions de fichiers médias/ressources à ne pas considérer comme des pages.
_SKIP_EXT = re.compile(
    r"\.(jpe?g|png|gif|webp|avif|svg|bmp|ico|pdf|zip|rar|7z|gz|tar|docx?|xlsx?|pptx?|"
    r"mp4|mp3|wav|avi|mov|webm|woff2?|ttf|eot|css|js|json|xml|rss)(\?|#|$)", re.I)
# Chemins non-contenu (dont les uploads médias).
_SKIP_PATH = re.compile(r"/(wp-admin|wp-login|wp-json|wp-content/uploads|feed|comments|xmlrpc)(/|$|\.)", re.I)


def _get(url, **kw):
    return _SESSION.get(url, timeout=config.HTTP_TIMEOUT, **kw)


def normalize_url(url):
    """Canonicalise : sans fragment, host en minuscules, sans slash final (sauf racine)."""
    if not url:
        return None
    url, _ = urldefrag(url)
    url = url.split("#", 1)[0]  # garde-fou explicite : jamais de fragment stocké
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


# Types REST à NE PAS crawler : médias/pièces jointes + types d'infrastructure WP.
# (Le crawl ne vise que de VRAIES pages de contenu : posts, pages, CPT publics.)
EXCLUDE_REST_BASES = {
    "media",            # pièces jointes / images -> beaucoup de 404, aucun intérêt SEO
    "blocks", "wp_block",
    "navigation", "menu-items", "nav_menu_item",
    "templates", "template-parts",
    "patterns", "wp_pattern",
    "global-styles",
    "font-families", "font-faces",
    "menus", "menu-locations",
}


def discover_content_types(base_url):
    """Renvoie les rest_base des types de CONTENU exposés (posts, pages, CPT publics).

    Exclut médias et types d'infrastructure WP (cf. EXCLUDE_REST_BASES) afin de ne PAS
    fetcher des pièces jointes/images (sources des 404 en masse).
    """
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
        slug = meta.get("slug")
        if not rb or rb in EXCLUDE_REST_BASES or slug in ("attachment", "nav_menu_item"):
            continue
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
                norm = _normalize_item(it, rest_base)
                # Garde-fou : ne jamais enregistrer une pièce jointe / média comme page.
                if norm["type"] in config.EXCLUDE_TYPES or not norm["url"]:
                    continue
                items.append(norm)
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
    # Focus keyword Yoast (vue "Yoast vs réel"), exposé via register_rest_field (functions.php).
    # Absent si le snippet n'est pas posé -> chaîne vide, la vue 3 reste juste vide (ne casse rien).
    fkw = it.get("focus_keyword")
    fkw = fkw.strip() if isinstance(fkw, str) else ""
    return {
        "wp_id": it.get("id"),
        "url": url,
        "title": _strip_html(title),
        "type": it.get("type") or rest_base,
        "category": category,
        "modified_at": it.get("modified_gmt") or it.get("modified"),
        "focus_keyword": fkw,
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
    # Retire les balises PUIS décode les entités HTML (&rsquo; &amp; &eacute; ...) que
    # WordPress stocke dans title.rendered, pour enregistrer un titre propre à la source.
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def fetch_html(url):
    """Récupère le HTML d'une page. Renvoie (html|None, meta).
    meta = {status, final_url, redirect_chain (URLs intermédiaires), loop (bool), error}.
    La détection de redirection réutilise CE fetch (r.history) -> AUCUNE requête en plus.
    Tolérant : aucune exception remontée."""
    meta = {"status": None, "final_url": None, "redirect_chain": [], "loop": False, "error": None}
    try:
        r = _get(url)
        meta["status"] = r.status_code
        meta["final_url"] = r.url
        meta["redirect_chain"] = [h.url for h in r.history]  # max MAX_REDIRECTS sauts
        if r.ok and "text/html" in r.headers.get("Content-Type", ""):
            return r.text, meta
        if not r.ok:
            print(f"[wp] fetch_html {url}: HTTP {r.status_code}")
    except requests.exceptions.TooManyRedirects:
        meta["loop"] = True
        meta["error"] = "redirect_loop"
        print(f"[wp] fetch_html {url}: boucle de redirection (> {config.MAX_REDIRECTS})")
    except requests.exceptions.Timeout:
        meta["error"] = "timeout"
        print(f"[wp] fetch_html {url}: timeout (> {config.HTTP_TIMEOUT}s)")
    except requests.exceptions.RequestException as e:
        meta["error"] = "request_error"
        print(f"[wp] fetch_html {url}: {e}")
    except Exception as e:
        meta["error"] = "error"
        print(f"[wp] fetch_html {url}: {e}")
    return None, meta


def extract_onpage(html_doc, page_url):
    """Audit technique on-page à partir du HTML DÉJÀ crawlé. AUCUNE requête réseau.
    Tolérant : toute erreur -> dict partiel marqué _partial (ne casse jamais le crawl)."""
    a = {}
    try:
        soup = BeautifulSoup(html_doc, "lxml")
        head = soup.head or soup
        title = (soup.title.string.strip() if (soup.title and soup.title.string) else "")
        title = html.unescape(title)
        a["title"] = title
        a["title_len"] = len(title)

        md = head.find("meta", attrs={"name": "description"})
        desc = md["content"].strip() if (md and md.get("content")) else ""
        desc = html.unescape(desc)
        a["description"] = desc
        a["desc_present"] = bool(desc)
        a["desc_len"] = len(desc)

        h1s = soup.find_all("h1")
        a["h1_count"] = len(h1s)
        first_h1 = h1s[0].get_text(" ", strip=True).strip().lower() if h1s else ""
        a["h1_equals_title"] = bool(first_h1 and title and first_h1 == title.strip().lower())

        # Saut de niveau Hn (ex. H1 -> H3 sans H2).
        levels = [int(t.name[1]) for t in soup.find_all(re.compile(r"^h[1-6]$"))]
        gap = False
        prev = 0
        for lv in levels:
            if prev and lv > prev + 1:
                gap = True
                break
            prev = lv
        a["heading_gap"] = gap

        canon = head.find("link", attrs={"rel": "canonical"})
        chref = canon["href"].strip() if (canon and canon.get("href")) else ""
        ncanon = normalize_url(chref) if chref else None
        a["has_canonical"] = bool(chref)
        a["canonical_other"] = bool(ncanon and ncanon != page_url)

        robots = head.find("meta", attrs={"name": "robots"})
        rc = robots["content"].lower() if (robots and robots.get("content")) else ""
        a["is_noindex"] = "noindex" in rc

        imgs = soup.find_all("img")
        a["images_total"] = len(imgs)
        a["images_without_alt"] = sum(1 for im in imgs if not (im.get("alt") or "").strip())

        # Mixed content : ressources http:// sur une page https (AVANT de retirer les scripts).
        mixed = []
        if (page_url or "").startswith("https://"):
            for tag in soup.find_all(["img", "script", "link", "source", "iframe", "audio", "video"]):
                for attr in ("src", "href"):
                    v = tag.get(attr)
                    if v and v.strip().lower().startswith("http://"):
                        mixed.append(v.strip())
        a["mixed_content"] = list(dict.fromkeys(mixed))[:50]

        # Nombre de mots du texte visible (on retire scripts/styles en dernier).
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        text = soup.get_text(" ", strip=True)
        a["word_count"] = len(text.split()) if text else 0
        # Extrait de contenu (pour le maillage sémantique via le serveur MCP) : ~2000 premiers
        # caractères du texte visible, déjà en main -> aucune requête en plus.
        a["excerpt"] = text[:2000] if text else ""
    except Exception as e:
        print(f"[wp] extract_onpage {page_url}: {e}")
        a["_partial"] = True
    return a


def fetch_sitemap(base):
    """Ensemble des URLs (normalisées) du sitemap. Essaie sitemap_index.xml puis sitemap.xml,
    suit les sous-sitemaps (plafonné + politesse). Tolérant -> (set(urls), sitemap_url|None)."""
    seen = set()
    page_urls = set()

    def grab(sm_url, depth=0):
        if sm_url in seen or depth > 3:
            return
        seen.add(sm_url)
        try:
            r = _get(sm_url)
            if not r.ok:
                return
            txt = r.text
        except Exception as e:
            print(f"[wp] fetch_sitemap {sm_url}: {e}")
            return
        locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", txt, re.I)
        if "<sitemapindex" in txt.lower():
            for child in locs[:50]:
                time.sleep(config.POLITENESS_DELAY)  # politesse sur les sous-sitemaps
                grab(child.strip(), depth + 1)
        else:
            for u in locs:
                n = normalize_url(u.strip())
                if n:
                    page_urls.add(n)

    for cand in (f"{base}/sitemap_index.xml", f"{base}/sitemap.xml"):
        grab(cand)
        if page_urls:
            return page_urls, cand
    return page_urls, None


def head_status(url):
    """Code HTTP d'une URL via HEAD léger (fallback GET si HEAD refusé). None si échec."""
    try:
        r = _SESSION.head(url, timeout=config.HTTP_TIMEOUT, allow_redirects=True)
        if r.status_code in (403, 405):  # certains serveurs refusent HEAD
            r = _get(url)
        return r.status_code
    except Exception:
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
