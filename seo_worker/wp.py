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
    category, tags = _extract_terms(it)
    # Focus keyword Yoast (vue "Yoast vs réel"), exposé via register_rest_field (functions.php).
    # Absent si le snippet n'est pas posé -> chaîne vide, la vue 3 reste juste vide (ne casse rien).
    fkw = it.get("focus_keyword")
    fkw = fkw.strip() if isinstance(fkw, str) else ""

    def _txt(key):
        """Champ REST exposé via register_rest_field ; '' si le snippet n'est pas posé."""
        v = it.get(key)
        return v.strip() if isinstance(v, str) else ""

    # Valeurs SEO lues à la SOURCE (base WordPress) plutôt qu'aspirées dans le HTML :
    # le HTML rendu mélange le contenu et le gabarit (menu, en-tête, pied de page),
    # ce qui polluait l'extrait et faussait les compteurs.
    return {
        "wp_id": it.get("id"),
        "url": url,
        "title": _strip_html(title),
        "type": it.get("type") or rest_base,
        "category": category,
        "tags": tags,
        "modified_at": it.get("modified_gmt") or it.get("modified"),
        "focus_keyword": fkw,
        "meta_description": _txt("meta_description"),
        "excerpt_raw": _strip_html(_txt("excerpt_raw")),
        "seo_title": _txt("seo_title"),
        # Yoast stocke '1' quand la case noindex est cochée ; absent/'' sinon.
        "robots_noindex": str(it.get("robots_noindex") or "").strip() in ("1", "true", "noindex"),
        "_yoast": it.get("yoast_head_json") if isinstance(it.get("yoast_head_json"), dict) else None,
    }


def _extract_terms(it):
    """Catégorie + étiquettes depuis _embedded['wp:term'] (déjà téléchargé via _embed=1).
    - category : premier terme de taxonomy 'category' (compat : sinon premier tag).
    - tags : TOUS les autres termes (post_tag + taxonomies custom des CPT : genres,
      studios...), dédoublonnés (insensible à la casse), plafonnés à 30.
    Sert au maillage par tags communs (deux pages taguées pareil = candidates de lien)."""
    emb = it.get("_embedded") or {}
    groups = emb.get("wp:term") or []
    category = None
    tags, seen = [], set()
    for group in groups:
        for t in group or []:
            tax = (t or {}).get("taxonomy")
            name = _strip_html((t or {}).get("name") or "")
            if not name:
                continue
            if tax == "category":
                if category is None:
                    category = name
                continue
            key = name.lower()
            if key not in seen:
                seen.add(key)
                tags.append(name)
    # Compat ancien comportement (_first_category prenait category OU post_tag) :
    # un CPT sans taxonomy 'category' garde son premier terme comme catégorie.
    if category is None and tags:
        category = tags[0]
    return category, tags[:30]


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
        # Chaîne détaillée : le CODE de chaque saut distingue une 301 (permanente,
        # transmet le signal) d'une 302 (temporaire, ne le transmet pas).
        meta["chain"] = [{"url": h.url, "status": h.status_code} for h in r.history]
        meta["hops"] = len(r.history)
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


# Éléments de gabarit, communs à toutes les pages : ils n'appartiennent pas au contenu.
_CHROME_SELECTORS = [
    "nav", "header", "footer", "aside",
    "[role=navigation]", "[role=banner]", "[role=contentinfo]", "[role=complementary]",
    ".menu", ".navigation", ".site-header", ".site-footer", ".sidebar", ".widget-area",
    "#comments", ".comments-area", ".breadcrumb", ".breadcrumbs", ".skip-link",
]


def _main_content(soup):
    """Isole le contenu réel de la page, sans le gabarit.

    On privilégie le conteneur sémantique (<main>, <article>, [role=main]) : c'est le
    plus fiable. À défaut, on retire du document les éléments de gabarit connus.
    Repli volontaire sur le document entier si rien ne correspond : mieux vaut un extrait
    imparfait qu'un extrait vide.
    """
    try:
        for sel in ("main", "article", "[role=main]", ".entry-content", ".post-content"):
            node = soup.select_one(sel)
            # Un conteneur quasi vide (gabarit sans contenu) ne vaut pas mieux que rien.
            if node and len(node.get_text(" ", strip=True)) > 120:
                return node
        for sel in _CHROME_SELECTORS:
            for node in soup.select(sel):
                node.decompose()
        return soup.body or soup
    except Exception:
        return soup


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

        # Texte visible : on retire d'abord le code, PUIS le gabarit (menu, en-tête,
        # pied de page, barres latérales). Sans cette seconde étape, get_text() sur tout
        # le document ramenait le menu de navigation dans l'extrait et gonflait le
        # nombre de mots — identique sur chaque page, donc inexploitable.
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        content = _main_content(soup)
        text = content.get_text(" ", strip=True)
        a["word_count"] = len(text.split()) if text else 0
        # Extrait de contenu (pour le maillage sémantique via le serveur MCP) : ~2000 premiers
        # caractères du texte visible, déjà en main -> aucune requête en plus.
        a["excerpt"] = text[:2000] if text else ""
    except Exception as e:
        print(f"[wp] extract_onpage {page_url}: {e}")
        a["_partial"] = True
    return a


# Bloc <url> d'un sitemap : on le lit ENTIER pour rattacher chaque <lastmod> à son
# <loc>. Deux regex séparées ne le permettraient pas, le lastmod étant facultatif :
# le moindre trou décalerait toutes les correspondances.
_SM_ENTRY_RE = re.compile(r"<url\b[^>]*>(.*?)</url>", re.I | re.S)
_SM_LOC_RE = re.compile(r"<loc>\s*([^<\s]+)\s*</loc>", re.I)
_SM_LASTMOD_RE = re.compile(r"<lastmod>\s*([^<\s]+)\s*</lastmod>", re.I)


def fetch_sitemap_detailed(base):
    """Sitemap avec le DÉTAIL par URL, pas seulement la liste.

    Renvoie ({url: {"sitemap_file": ..., "lastmod": ...}}, url_du_sitemap|None).
    Le fichier d'origine sert à retrouver où une URL est déclarée quand il y a plusieurs
    sous-sitemaps ; le lastmod permet de repérer les écarts avec la vraie date de
    modification (un sitemap qui annonce du frais sur du contenu qui n'a pas bougé).
    """
    seen = set()
    detail = {}

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
        if "<sitemapindex" in txt.lower():
            for child in _SM_LOC_RE.findall(txt)[:50]:
                time.sleep(config.POLITENESS_DELAY)  # politesse sur les sous-sitemaps
                grab(child.strip(), depth + 1)
            return
        for bloc in _SM_ENTRY_RE.findall(txt):
            m = _SM_LOC_RE.search(bloc)
            if not m:
                continue
            n = normalize_url(m.group(1).strip())
            if not n:
                continue
            lm = _SM_LASTMOD_RE.search(bloc)
            detail[n] = {"sitemap_file": sm_url, "lastmod": lm.group(1).strip() if lm else None}
        # Repli : sitemap sans balises <url> (format inhabituel) -> on prend les <loc> bruts.
        if not detail:
            for u in _SM_LOC_RE.findall(txt):
                n = normalize_url(u.strip())
                if n:
                    detail[n] = {"sitemap_file": sm_url, "lastmod": None}

    for cand in (f"{base}/sitemap_index.xml", f"{base}/sitemap.xml"):
        grab(cand)
        if detail:
            return detail, cand
    return detail, None


def fetch_sitemap(base):
    """Ensemble des URLs (normalisées) du sitemap -> (set(urls), sitemap_url|None).
    Conservé pour les appelants existants ; s'appuie sur fetch_sitemap_detailed."""
    detail, sm_url = fetch_sitemap_detailed(base)
    return set(detail.keys()), sm_url


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


def extract_seo_meta(html, yoast=None, rest=None):
    """Métadonnées SEO depuis le <head> (tous plugins) + bonus yoast_head_json.

    `rest` : valeurs lues à la source via l'API REST (register_rest_field). Elles font
    AUTORITÉ quand elles existent : le <head> peut être réécrit par un cache, un CDN ou
    un autre plugin, alors que la base WordPress dit ce que l'auteur a réellement saisi.
    Une meta description vide en base est une vraie information (champ non rempli), à ne
    pas confondre avec une balise absente du HTML pour une raison technique.
    """
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

    # La source REST prime sur tout ce qui précède (voir docstring).
    if isinstance(rest, dict):
        if rest.get("seo_title"):
            meta["title"] = rest["seo_title"]
        # `meta_description_present` distingue « champ vide en base » (vrai manque, à
        # corriger) de « inconnu » (snippet REST non posé) : sans ça, le compteur
        # meta_description_absente melangeait les deux.
        if "meta_description" in rest:
            meta["description"] = rest["meta_description"] or meta.get("description", "")
            meta["meta_description_present"] = bool(rest["meta_description"])
        if rest.get("robots_noindex"):
            meta["noindex"] = True
        meta["source"] = "rest"
    return meta
