# seo_worker/backlinks_verify.py
#
# Verification des liens entrants A LA SOURCE, et enrichissement des domaines referents.
#
# Bing ne donne que l'URL source et l'ancre. L'URL source suffit : on lit la page et on
# constate nous-memes ce que Semrush affiche : l'attribut rel (follow / nofollow /
# sponsored / ugc), le type (texte / image), l'ancre reelle, le titre et la langue de la
# page, et surtout si le lien EXISTE ENCORE — la vraie detection des liens perdus.
#
# Par domaine referent : TLD, IP, pays (ccTLD sinon registre RDAP de l'IP, gratuit et
# officiel), autorite Open PageRank en lot, et un indicateur de toxicite MAISON, 0..100,
# dont chaque critere declenche est liste a cote du score. Pas de formule secrete.

import json
import os
import re
import socket
import time
from datetime import date
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

import config

UA = {"User-Agent": config.USER_AGENT, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "fr,en;q=0.8"}

# ccTLD -> pays. Les extensions generiques (.com, .net, .org, .io...) passent par l'IP.
CCTLD = {
    "fr": "FR", "de": "DE", "es": "ES", "it": "IT", "be": "BE", "ch": "CH", "nl": "NL", "uk": "GB", "ie": "IE",
    "ca": "CA", "us": "US", "jp": "JP", "in": "IN", "br": "BR", "ru": "RU", "pl": "PL", "pt": "PT", "se": "SE",
    "no": "NO", "dk": "DK", "fi": "FI", "at": "AT", "cz": "CZ", "ro": "RO", "hu": "HU", "gr": "GR", "tr": "TR",
    "ua": "UA", "cn": "CN", "kr": "KR", "au": "AU", "nz": "NZ", "mx": "MX", "ar": "AR", "ma": "MA", "tn": "TN",
    "dz": "DZ", "sn": "SN", "ci": "CI", "lu": "LU", "sg": "SG", "hk": "HK", "tw": "TW", "id": "ID", "th": "TH",
    "vn": "VN", "ph": "PH", "my": "MY", "za": "ZA", "ng": "NG", "eg": "EG", "il": "IL", "ae": "AE", "sa": "SA",
    "md": "MD", "bg": "BG", "sk": "SK", "si": "SI", "hr": "HR", "rs": "RS", "lt": "LT", "lv": "LV", "ee": "EE",
    "is": "IS", "cl": "CL", "co": "CO", "pe": "PE", "ve": "VE", "qc": "CA",
}
# Extensions massivement utilisees par les fermes de liens (sans etre toxiques en soi).
RISKY_TLDS = {"xyz", "top", "click", "loan", "work", "buzz", "icu", "cam", "rest", "surf", "gq", "cf", "tk", "ml", "ga", "monster", "cyou", "quest", "sbs", "cfd"}
# Ancres typiques du spam de liens (FR/EN), testees en minuscule.
SPAM_ANCHOR = re.compile(
    r"casino|poker|paris sportif|betting|viagra|cialis|pharma|porn|sexe|xxx|escort|crypto|bitcoin|forex|"
    r"pr[eê]t rapide|credit rapide|payday|loan|replica|backlinks?\s*(cheap|online|buy|pas cher)|buy links|achat de liens|"
    r"dofollow|seo cheap|essay writing|dissertation|rank fast|make money|gagner de l'argent",
    re.I,
)


def domain_of(url):
    try:
        h = (urlparse(url).hostname or "").lower()
        return h[4:] if h.startswith("www.") else h
    except Exception:
        return ""


def tld_of(domain):
    parts = (domain or "").rsplit(".", 1)
    return parts[-1].lower() if len(parts) == 2 else None


# ----------------------------------------------------------------------------
# 1) Verification lien par lien
# ----------------------------------------------------------------------------
def _rel_of(a):
    rel = " ".join(a.get("rel") or []).lower() if isinstance(a.get("rel"), list) else str(a.get("rel") or "").lower()
    if "sponsored" in rel:
        return "sponsored"
    if "ugc" in rel:
        return "ugc"
    if "nofollow" in rel:
        return "nofollow"
    return "follow"


def inspect_source(html, site_domain):
    """Cherche dans la page source les liens vers notre domaine.
    Renvoie (liste de {href, rel, type, anchor}, titre, langue)."""
    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.get_text(strip=True)[:200] if soup.title else None)
    lang = (soup.html.get("lang") or "").split("-")[0].lower()[:5] if soup.html else None
    found = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href.lower().startswith(("http://", "https://", "//")):
            continue
        d = domain_of(href if not href.startswith("//") else "https:" + href)
        if not d or (d != site_domain and not d.endswith("." + site_domain)):
            continue
        img = a.find("img")
        anchor = a.get_text(" ", strip=True)
        if not anchor and img is not None:
            anchor = (img.get("alt") or "").strip()
        found.append({"href": href, "rel": _rel_of(a), "type": "image" if (img is not None and not a.get_text(strip=True)) else "text",
                      "anchor": anchor[:300]})
    return found, title, lang or None


def fetch_source(url):
    """Renvoie (status, html|None, erreur|None)."""
    try:
        r = requests.get(url, headers=UA, timeout=config.HTTP_TIMEOUT, allow_redirects=True)
        ctype = r.headers.get("Content-Type", "")
        if r.status_code >= 400:
            return r.status_code, None, None
        if "html" not in ctype and "<html" not in r.text[:500].lower():
            return r.status_code, None, "not_html"
        return r.status_code, r.text, None
    except requests.exceptions.Timeout:
        return None, None, "timeout"
    except requests.exceptions.RequestException as e:
        return None, None, f"request_error: {str(e)[:80]}"


def _norm(u):
    """Forme comparable : sans schema, sans www., sans slash final, en minuscule."""
    u = (u or "").strip().lower()
    u = re.sub(r"^(https?:)?//", "", u)
    if u.startswith("www."):
        u = u[4:]
    return u.rstrip("/")


def _match(found, target_url):
    """Le lien de la page qui vise notre cible (a schema, www et slash pres), sinon le
    premier lien vers notre domaine (Bing peut avoir memorise une ancienne forme de l'URL)."""
    t = _norm(target_url)
    for f in found:
        if _norm(f["href"]) == t:
            return f, True
    return (found[0], False) if found else (None, False)


def verify_batch(conn, site_id, site_domain, limit, cancel_check=None):
    """Verifie un lot de liens actifs : jamais verifies d'abord, puis les plus anciens.
    Renvoie (verifies, perdus)."""
    cur = conn.cursor()
    cur.execute(
        """SELECT id, source_url, target_url FROM seo_backlinks
            WHERE site_id = %s AND status = 'active'
              AND (verified_at IS NULL OR verified_at < CURRENT_DATE - %s)
            ORDER BY verified_at ASC NULLS FIRST, id
            LIMIT %s""",
        (site_id, config.BACKLINK_VERIFY_TTL_DAYS, limit),
    )
    rows = cur.fetchall()
    today = date.today()
    # Une page source peut porter plusieurs liens vers nous : on ne la lit qu'une fois.
    by_source = {}
    for bid, src, tgt in rows:
        by_source.setdefault(src, []).append((bid, tgt))
    verified = lost = 0
    for src, items in by_source.items():
        status, html, err = fetch_source(src)
        found, title, lang = ([], None, None)
        if html:
            found, title, lang = inspect_source(html, site_domain)
        for bid, tgt in items:
            if html is None and status is not None and status in (404, 410):
                cur.execute("UPDATE seo_backlinks SET status='lost', lost_at=%s, lost_reason='page_gone', http_status=%s, verified_at=%s WHERE id=%s",
                            (today, status, today, bid))
                lost += 1
            elif html is None:
                # Injoignable (timeout, 5xx, non-HTML) : on note, sans conclure a la perte.
                cur.execute("UPDATE seo_backlinks SET http_status=%s, verified_at=%s WHERE id=%s", (status, today, bid))
            else:
                m, exact = _match(found, tgt)
                if m is None:
                    cur.execute("UPDATE seo_backlinks SET status='lost', lost_at=%s, lost_reason='link_removed', http_status=%s, verified_at=%s, source_title=%s, source_lang=%s WHERE id=%s",
                                (today, status, today, title, lang, bid))
                    lost += 1
                else:
                    cur.execute(
                        """UPDATE seo_backlinks SET rel=%s, link_type=%s, anchor=COALESCE(NULLIF(%s,''), anchor), http_status=%s,
                                  verified_at=%s, source_title=%s, source_lang=%s, status='active', lost_at=NULL, lost_reason=NULL
                            WHERE id=%s""",
                        (m["rel"], m["type"], m["anchor"], status, today, title, lang, bid),
                    )
            verified += 1
        conn.commit()
        if cancel_check and cancel_check():
            return verified, lost
        time.sleep(config.BACKLINK_VERIFY_DELAY)
    return verified, lost


# ----------------------------------------------------------------------------
# 2) Enrichissement des domaines referents
# ----------------------------------------------------------------------------
def resolve_ip(domain):
    try:
        return socket.gethostbyname(domain)
    except Exception:
        return None


def rdap_country(ip):
    """Pays d'enregistrement du bloc IP (registres regionaux, via rdap.org). None si inconnu."""
    if not ip:
        return None
    try:
        r = requests.get(config.RDAP_URL.format(ip=ip), headers={**UA, "Accept": "application/rdap+json"}, timeout=10, allow_redirects=True)
        if r.status_code != 200:
            return None
        d = r.json()
        c = d.get("country")
        if not c:
            for ent in d.get("entities") or []:
                for item in (ent.get("vcardArray") or [None, []])[1] or []:
                    if item and item[0] == "adr":
                        adr = item[3] if len(item) > 3 else None
                        if isinstance(adr, list) and adr and adr[-1]:
                            c = str(adr[-1])[:2].upper()
                            break
                if c:
                    break
        return (c or "").upper()[:2] or None
    except Exception:
        return None


def opr_bulk(domains):
    """Open PageRank en lot (100 par appel). {domain: (score|None, found)}."""
    key = (os.getenv("OPR_API_KEY") or "").strip()
    out = {}
    if not key or not domains:
        return out
    for i in range(0, len(domains), 100):
        batch = domains[i:i + 100]
        try:
            r = requests.post(config.OPR_API_URL, json={"domains": batch, "include_history": False},
                              headers={**UA, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}, timeout=config.HTTP_TIMEOUT)
            if r.status_code != 200:
                continue
            data = r.json()
            rows = data if isinstance(data, list) else (data.get("response") or data.get("results") or data.get("data") or [])
            for row in rows:
                d = (row.get("domain") or "").lower()
                if d.startswith("www."):
                    d = d[4:]
                score = None
                for k in ("open_page_rank", "page_rank_decimal", "page_rank"):
                    try:
                        score = float(row[k]); break
                    except (KeyError, TypeError, ValueError):
                        continue
                out[d] = (score, row.get("found") is not False and score is not None)
        except Exception:
            continue
    return out


def toxicity(domain, tld, opr_score, opr_found, links_count, anchors, pages_count):
    """Indicateur MAISON 0..100, criteres explicites. Renvoie (score, [raisons])."""
    score = 0
    reasons = []
    if opr_found is False or (opr_score is not None and opr_score <= 0.5):
        score += 30; reasons.append("domaine sans autorité mesurable (Open PageRank nul ou inconnu)")
    elif opr_score is not None and opr_score < 1.5:
        score += 10; reasons.append("autorité très faible (Open PageRank < 1,5)")
    spam = [a for a in anchors if a and SPAM_ANCHOR.search(a)]
    if spam:
        score += 30; reasons.append(f"ancre suspecte : « {spam[0][:60]} »")
    if links_count >= 20 and pages_count >= 20:
        score += 15; reasons.append(f"lien répété sur {pages_count} pages du même site (lien de gabarit)")
    if tld in RISKY_TLDS:
        score += 15; reasons.append(f"extension .{tld} très utilisée par les fermes de liens")
    core = (domain or "").split(".")[0]
    if re.search(r"\d{3,}", core) or core.count("-") >= 3 or len(core) >= 30:
        score += 10; reasons.append("nom de domaine d'apparence générée")
    return min(100, score), reasons


def enrich_domains(conn, site_id, cancel_check=None):
    """Met a jour seo_ref_domains pour les domaines nouveaux ou perimes (TTL)."""
    cur = conn.cursor()
    cur.execute(
        """SELECT b.source_domain, COUNT(*)::int, COUNT(DISTINCT b.source_url)::int,
                  ARRAY_AGG(DISTINCT COALESCE(b.anchor,''))
             FROM seo_backlinks b
             LEFT JOIN seo_ref_domains r ON r.site_id = b.site_id AND r.domain = b.source_domain
            WHERE b.site_id = %s AND (r.id IS NULL OR r.enriched_at IS NULL OR r.enriched_at < CURRENT_DATE - %s)
            GROUP BY b.source_domain""",
        (site_id, config.REF_DOMAIN_TTL_DAYS),
    )
    todo = cur.fetchall()
    if not todo:
        return 0
    scores = opr_bulk([d for d, _, _, _ in todo])
    n = 0
    for domain, links, pages, anchors in todo:
        tld = tld_of(domain)
        ip = resolve_ip(domain)
        country = CCTLD.get(tld) if tld in CCTLD else rdap_country(ip)
        opr_score, opr_found = scores.get(domain, (None, None))
        tox, reasons = toxicity(domain, tld, opr_score, opr_found, links, [a for a in anchors if a], pages)
        cur.execute(
            """INSERT INTO seo_ref_domains (site_id, domain, tld, ip, country, opr_score, opr_found, toxicity, toxicity_reasons, enriched_at, updated_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,CURRENT_DATE,NOW())
               ON CONFLICT (site_id, domain) DO UPDATE
                 SET tld=EXCLUDED.tld, ip=COALESCE(EXCLUDED.ip, seo_ref_domains.ip), country=COALESCE(EXCLUDED.country, seo_ref_domains.country),
                     opr_score=EXCLUDED.opr_score, opr_found=EXCLUDED.opr_found, toxicity=EXCLUDED.toxicity,
                     toxicity_reasons=EXCLUDED.toxicity_reasons, enriched_at=CURRENT_DATE, updated_at=NOW()""",
            (site_id, domain, tld, ip, country, opr_score, opr_found, tox, json.dumps(reasons, ensure_ascii=False)),
        )
        n += 1
        if n % 20 == 0:
            conn.commit()
            if cancel_check and cancel_check():
                return n
    conn.commit()
    return n


def refresh_toxicity(conn, site_id):
    """Recalcule la toxicite de TOUS les domaines a partir des liens/ancres a jour (sans
    appel reseau) : une ancre verifiee a la source peut changer le verdict."""
    cur = conn.cursor()
    cur.execute(
        """SELECT r.domain, r.tld, r.opr_score::float, r.opr_found, COUNT(b.id)::int, COUNT(DISTINCT b.source_url)::int,
                  ARRAY_AGG(DISTINCT COALESCE(b.anchor,''))
             FROM seo_ref_domains r
             LEFT JOIN seo_backlinks b ON b.site_id = r.site_id AND b.source_domain = r.domain AND b.status = 'active'
            WHERE r.site_id = %s
            GROUP BY r.domain, r.tld, r.opr_score, r.opr_found""",
        (site_id,),
    )
    for domain, tld, score, found, links, pages, anchors in cur.fetchall():
        tox, reasons = toxicity(domain, tld, score, found, links, [a for a in anchors if a], pages)
        cur.execute("UPDATE seo_ref_domains SET toxicity=%s, toxicity_reasons=%s::jsonb, updated_at=NOW() WHERE site_id=%s AND domain=%s",
                    (tox, json.dumps(reasons, ensure_ascii=False), site_id, domain))
    conn.commit()
