# seo_worker/authority.py
#
# Autorite du domaine et liens entrants — l'equivalent GRATUIT de la colonne
# « Authority Score / Backlinks / Domaines referents » du tableau de bord Semrush.
#
# Deux sources, chacune honnete sur ce qu'elle est :
#   - Open PageRank : score 0..10 calcule sur un index de liens du web (Common Crawl),
#     rang mondial, nombre de domaines referents. Un appel par domaine, gratuit.
#     C'est un PROXY de l'Authority Score, pas la meme formule.
#   - Bing Webmaster Tools : les liens entrants que BING connait, page par page, avec
#     l'ancre. Sous-ensemble du web, mais reel et gratuit ; suffit pour voir qui lie quoi,
#     et detecter les liens gagnes / perdus. Le site doit etre verifie dans Bing WMT.
#
# Un instantane par jour dans seo_authority_daily (tendance), le detail dans seo_backlinks.

import os
import time
from datetime import date
from urllib.parse import urlparse

import requests

import config
import backlinks_verify

UA = {"User-Agent": config.USER_AGENT}


# ----------------------------------------------------------------------------
# Open PageRank
# ----------------------------------------------------------------------------
def _opr_key():
    return (os.getenv("OPR_API_KEY") or "").strip()


def fetch_opr(domain):
    """Renvoie {score, rank, referring_domains} ou None (cle absente / domaine inconnu).
    Format observe : liste racine [{domain, found, open_page_rank, rank, referring_domains, ...}]
    ou enveloppe {response|results|data: [...]} — on tolere les deux."""
    key = _opr_key()
    if not key:
        return None
    r = requests.post(config.OPR_API_URL, json={"domains": [domain], "include_history": False},
                      headers={**UA, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                      timeout=config.HTTP_TIMEOUT)
    r.raise_for_status()
    data = r.json()
    rows = data if isinstance(data, list) else (data.get("response") or data.get("results") or data.get("data") or [])
    if isinstance(rows, dict):
        rows = [dict(domain=k, **(v if isinstance(v, dict) else {"open_page_rank": v})) for k, v in rows.items()]
    for row in rows:
        if (row.get("domain") or "").lower().lstrip("www.") != domain.lower():
            continue
        if row.get("found") is False:
            return {"score": None, "rank": None, "referring_domains": None}
        score = None
        for k in ("open_page_rank", "page_rank_decimal", "page_rank", "score"):
            try:
                score = float(row[k]); break
            except (KeyError, TypeError, ValueError):
                continue
        def _int(k):
            try:
                return int(row.get(k))
            except (TypeError, ValueError):
                return None
        return {"score": score, "rank": _int("rank"), "referring_domains": _int("referring_domains")}
    return None


# ----------------------------------------------------------------------------
# Bing Webmaster Tools
# ----------------------------------------------------------------------------
def _bing_key():
    return (os.getenv("BING_WMT_API_KEY") or "").strip()


class BingError(Exception):
    pass


def _bing(endpoint, **params):
    params["apikey"] = _bing_key()
    r = requests.get(f"{config.BING_WMT_API_BASE}/{endpoint}", params=params, headers=UA, timeout=config.HTTP_TIMEOUT)
    if r.status_code != 200:
        msg = ""
        try:
            msg = (r.json().get("Message") or r.json().get("message") or "")[:160]
        except Exception:
            pass
        raise BingError(f"HTTP {r.status_code} {msg}".strip())
    data = r.json()
    return data.get("d", data) if isinstance(data, dict) else data


def _links_of(d):
    """Extrait la liste et le nb de pages d'une reponse Bing (formats legerement variables)."""
    if isinstance(d, list):
        return d, 1
    return (d.get("Links") or d.get("links") or []), int(d.get("TotalPages") or 1)


def fetch_bing_link_counts(site_url):
    """[(url_cible, nb_liens_entrants)], pages les plus liees d'abord."""
    out = []
    for page in range(config.BING_LINKCOUNT_PAGES):
        links, total_pages = _links_of(_bing("GetLinkCounts", siteUrl=site_url, page=page))
        for l in links:
            u = l.get("Url") or l.get("url")
            c = l.get("Count") or l.get("count") or 0
            if u:
                out.append((u, int(c)))
        if page + 1 >= total_pages or not links:
            break
        time.sleep(config.BING_DELAY)
    out.sort(key=lambda x: -x[1])
    return out


def fetch_bing_url_links(site_url, target):
    """[(source_url, ancre)] pour une page cible (pagine, plafonne)."""
    out = []
    for page in range(config.BING_URLLINKS_PAGES):
        links, total_pages = _links_of(_bing("GetUrlLinks", siteUrl=site_url, link=target, page=page))
        for l in links:
            src = l.get("Url") or l.get("SourceUrl") or l.get("url")
            if src:
                out.append((src, (l.get("AnchorText") or l.get("anchorText") or "")[:300]))
        if page + 1 >= total_pages or not links:
            break
        time.sleep(config.BING_DELAY)
    return out


def domain_of(url):
    try:
        h = (urlparse(url).hostname or "").lower()
        return h[4:] if h.startswith("www.") else h
    except Exception:
        return ""


# ----------------------------------------------------------------------------
# Job
# ----------------------------------------------------------------------------
def run(conn, site, job_id=None, cancel_check=None):
    """Job 'authority'. Renvoie True / 'cancelled' / False (rien d'obtenu)."""
    cur = conn.cursor()
    site_id = site["id"]
    domain = site["domain"]
    base = (site.get("wp_base_url") or f"https://{domain}").rstrip("/") + "/"
    today = date.today()
    notes = []

    # 1) Open PageRank
    opr = None
    if _opr_key():
        try:
            opr = fetch_opr(domain)
            if opr is None:
                notes.append("Open PageRank : domaine absent de la reponse")
        except Exception as e:
            notes.append(f"Open PageRank : {str(e)[:120]}")
    else:
        notes.append("OPR_API_KEY absent : pas de score d'autorite")

    # 2) Bing : comptes par page, puis detail des cibles les plus liees
    bing_total = None
    linked_pages = None
    checked_targets = []
    found = 0
    if _bing_key():
        try:
            counts = fetch_bing_link_counts(base)
            bing_total = sum(c for _, c in counts)
            linked_pages = sum(1 for _, c in counts if c > 0)
            # Rotation : les pages liees jamais interrogees d'abord, puis les plus anciennes,
            # pour couvrir TOUTES les pages liees au fil des passages (pas seulement le top).
            linked = [u for u, c in counts if c > 0]
            cur.execute("SELECT target_url, checked_at FROM seo_backlink_target_checks WHERE site_id = %s", (site_id,))
            last_check = dict(cur.fetchall())
            linked.sort(key=lambda u: (last_check.get(u) is not None, last_check.get(u) or date.min))
            targets = linked[: config.BING_TARGETS_PER_RUN]
            if job_id is not None:
                cur.execute("UPDATE seo_jobs SET progress_total = %s, progress_current = 0 WHERE id = %s", (len(targets), job_id))
                conn.commit()
            for i, target in enumerate(targets, 1):
                try:
                    links = fetch_bing_url_links(base, target)
                except BingError as e:
                    notes.append(f"Bing {target}: {e}")
                    continue
                checked_targets.append(target)
                cur.execute(
                    """INSERT INTO seo_backlink_target_checks (site_id, target_url, checked_at, links_found)
                       VALUES (%s,%s,%s,%s) ON CONFLICT (site_id, target_url) DO UPDATE
                         SET checked_at = EXCLUDED.checked_at, links_found = EXCLUDED.links_found""",
                    (site_id, target, today, len(links)),
                )
                for src, anchor in links:
                    sd = domain_of(src)
                    if not sd or sd == domain or sd.endswith("." + domain):
                        continue  # liens internes : ce n'est pas un backlink
                    cur.execute(
                        """INSERT INTO seo_backlinks (site_id, source_url, source_domain, target_url, anchor, first_seen, last_seen, status, lost_at)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,'active',NULL)
                           ON CONFLICT (site_id, source_url, target_url) DO UPDATE
                             SET last_seen = EXCLUDED.last_seen, anchor = COALESCE(NULLIF(EXCLUDED.anchor,''), seo_backlinks.anchor),
                                 status = 'active', lost_at = NULL""",
                        (site_id, src[:2000], sd, target[:2000], anchor, today, today),
                    )
                    found += 1
                if job_id is not None:
                    cur.execute("UPDATE seo_jobs SET progress_current = %s WHERE id = %s", (i, job_id))
                conn.commit()
                if cancel_check and cancel_check():
                    print("  [ANNULE] pendant l'analyse des liens")
                    return "cancelled"
                time.sleep(config.BING_DELAY)
            # Liens que Bing ne liste plus sur une cible recontrolee : pas une preuve de perte
            # (l'index de Bing bouge). On force leur re-verification a la source, qui tranche.
            if checked_targets:
                cur.execute(
                    """UPDATE seo_backlinks SET verified_at = NULL
                        WHERE site_id = %s AND status = 'active' AND target_url = ANY(%s) AND last_seen < %s""",
                    (site_id, checked_targets, today),
                )
                conn.commit()
        except BingError as e:
            msg = str(e)
            hint = " (site non verifie dans Bing Webmaster Tools sous le compte de la cle ?)" if "400" in msg or "403" in msg or "401" in msg else ""
            notes.append(f"Bing Webmaster Tools : {msg}{hint}")
        except Exception as e:
            notes.append(f"Bing Webmaster Tools : {str(e)[:120]}")
    else:
        notes.append("BING_WMT_API_KEY absent : pas de liste de liens entrants")

    # 3) Verification a la source (rel, type, presence) + enrichissement des domaines referents
    try:
        v, l = backlinks_verify.verify_batch(conn, site_id, domain, config.BACKLINK_VERIFY_PER_RUN, cancel_check=cancel_check)
        if v:
            notes_ok = f"{v} liens vérifiés à la source, {l} perdus"
            print(f"  [Liens] {notes_ok}")
        if cancel_check and cancel_check():
            return "cancelled"
        n_dom = backlinks_verify.enrich_domains(conn, site_id, cancel_check=cancel_check)
        backlinks_verify.refresh_toxicity(conn, site_id)
        if n_dom:
            print(f"  [Liens] {n_dom} domaines référents enrichis (IP, pays, autorité, toxicité)")
    except Exception as e:
        conn.rollback()
        notes.append(f"vérification des liens : {str(e)[:120]}")

    # 4) Instantane du jour
    cur.execute("SELECT COUNT(DISTINCT source_domain) FROM seo_backlinks WHERE site_id = %s AND status = 'active'", (site_id,))
    ref_domains = cur.fetchone()[0] if _bing_key() else None
    cur.execute(
        """INSERT INTO seo_authority_daily (site_id, date, opr_score, opr_rank, opr_referring_domains,
                                            bing_backlinks, bing_referring_domains, bing_linked_pages)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
           ON CONFLICT (site_id, date) DO UPDATE
             SET opr_score = COALESCE(EXCLUDED.opr_score, seo_authority_daily.opr_score),
                 opr_rank = COALESCE(EXCLUDED.opr_rank, seo_authority_daily.opr_rank),
                 opr_referring_domains = COALESCE(EXCLUDED.opr_referring_domains, seo_authority_daily.opr_referring_domains),
                 bing_backlinks = COALESCE(EXCLUDED.bing_backlinks, seo_authority_daily.bing_backlinks),
                 bing_referring_domains = COALESCE(EXCLUDED.bing_referring_domains, seo_authority_daily.bing_referring_domains),
                 bing_linked_pages = COALESCE(EXCLUDED.bing_linked_pages, seo_authority_daily.bing_linked_pages)""",
        (site_id, today,
         opr.get("score") if opr else None, opr.get("rank") if opr else None, opr.get("referring_domains") if opr else None,
         bing_total, ref_domains, linked_pages),
    )
    conn.commit()

    got_something = bool(opr and opr.get("score") is not None) or bing_total is not None
    summary = (f"OPR {opr.get('score') if opr else '-'} / rang {opr.get('rank') if opr else '-'} / {opr.get('referring_domains') if opr else '-'} dom. ref. ; "
               f"Bing {bing_total if bing_total is not None else '-'} liens, {found} details, {ref_domains if ref_domains is not None else '-'} domaines")
    print(f"  OK Autorite {domain} : {summary}" + (f" | notes : {' ; '.join(notes)}" if notes else ""))
    if job_id is not None and notes:
        cur.execute("UPDATE seo_jobs SET error = %s WHERE id = %s", (" ; ".join(notes)[:500], job_id))
        conn.commit()
    return got_something
