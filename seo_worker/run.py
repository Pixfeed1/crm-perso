#!/usr/bin/env python3
"""Worker SEO PixFeed — ÉTAPE 1 : crawl interne + PageRank (sans Google).

SEUL composant autorisé à ÉCRIRE les données SEO (le Node ne fait que lire).

Usage :
    python run.py               # incrémental (ne re-parse que les contenus modifiés)
    python run.py --full        # reconstruction complète du graphe de liens
    python run.py --site jurojin.net   # restreindre à un site

Règles clés :
- Incrémental : pour chaque page modifiée -> DELETE seo_links WHERE site_id=? AND from_url=?
  puis ré-INSERT des liens de CETTE page (les pages non modifiées gardent leurs liens).
- --full : DELETE seo_links WHERE site_id=? puis reparse de TOUTES les pages.
- PageRank recalculé sur le GRAPHE ENTIER à chaque run (incrémental compris).
"""
import argparse
import json
from datetime import datetime, timezone

import config
import wp
import pagerank as pr_mod
from db import connect


def parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def value_for_category(category, url, home_url):
    if url == home_url:
        return config.VALUE_HOME_HUB
    c = (category or "").lower()
    for keys, val in config.CATEGORY_VALUE:
        if any(k in c for k in keys):
            return val
    return config.VALUE_DEFAULT


def classify_health(inlinks, pr_ratio, value_score):
    if inlinks == 0:
        return "orpheline"
    if pr_ratio >= config.HEALTH_RESERVOIR_PR_RATIO:
        return "reservoir"
    if (value_score or 0) >= config.HEALTH_AFFAMEE_VALUE_MIN and pr_ratio < config.HEALTH_AFFAMEE_PR_RATIO:
        return "affamee"
    return "saine"


def upsert_site(cur, site):
    cur.execute(
        """INSERT INTO seo_sites (domain, wp_base_url, gsc_property)
           VALUES (%s, %s, %s)
           ON CONFLICT (domain) DO UPDATE
             SET wp_base_url = EXCLUDED.wp_base_url,
                 gsc_property = EXCLUDED.gsc_property,
                 updated_at = NOW()
           RETURNING id""",
        (site["domain"], site["wp_base_url"], site["gsc_property"]),
    )
    return cur.fetchone()[0]


def crawl_site(conn, site, full=False):
    cur = conn.cursor()
    domain = site["domain"]
    base = site["wp_base_url"].rstrip("/")
    home_url = wp.normalize_url(base)
    site_id = upsert_site(cur, site)
    print(f"\n=== {domain} (site_id={site_id}) mode={'full' if full else 'incrémental'} ===")

    # État existant (pour l'incrémental).
    cur.execute("SELECT url, wp_modified_at, last_crawl FROM seo_pages WHERE site_id = %s", (site_id,))
    existing = {r[0]: {"modified": r[1], "last_crawl": r[2]} for r in cur.fetchall()}

    if full:
        cur.execute("DELETE FROM seo_links WHERE site_id = %s", (site_id,))

    now = datetime.now(timezone.utc)
    stats = {"pages": 0, "parsed": 0, "links": 0}
    pages_seen = []

    for item in wp.iter_content(base):
        if not item["url"]:
            continue
        url = item["url"]
        pages_seen.append(url)
        stats["pages"] += 1
        mod = parse_dt(item["modified_at"])

        # Upsert métadonnées de base (jamais d'écrasement du seo_meta ici).
        cur.execute(
            """INSERT INTO seo_pages (site_id, wp_id, url, title, type, category, wp_modified_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (site_id, url) DO UPDATE
                 SET wp_id = EXCLUDED.wp_id, title = EXCLUDED.title, type = EXCLUDED.type,
                     category = EXCLUDED.category, wp_modified_at = EXCLUDED.wp_modified_at,
                     updated_at = NOW()""",
            (site_id, item["wp_id"], url, item["title"], item["type"], item["category"], mod),
        )

        # Faut-il (re)parser le HTML de cette page ?
        prev = existing.get(url)
        needs_parse = (
            full
            or prev is None
            or prev["last_crawl"] is None
            or (mod and prev["modified"] and mod > prev["modified"])
            or (mod and prev["modified"] is None)
        )
        if not needs_parse:
            continue

        html = wp.fetch_html(url)
        if not html:
            continue
        stats["parsed"] += 1

        # seo_meta tolérant.
        meta = wp.extract_seo_meta(html, item.get("_yoast"))
        cur.execute(
            "UPDATE seo_pages SET seo_meta = %s, last_crawl = NOW(), updated_at = NOW() WHERE site_id = %s AND url = %s",
            (json.dumps(meta), site_id, url),
        )

        # Liens : en incrémental, on purge SEULEMENT les liens sortants de CETTE page.
        if not full:
            cur.execute("DELETE FROM seo_links WHERE site_id = %s AND from_url = %s", (site_id, url))
        for to_url, anchor in wp.extract_links(html, url, domain):
            cur.execute(
                """INSERT INTO seo_links (site_id, from_url, to_url, anchor)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (site_id, from_url, to_url, anchor) DO NOTHING""",
                (site_id, url, to_url, anchor or ""),
            )
            stats["links"] += 1

    conn.commit()

    # PageRank sur le GRAPHE ENTIER du site.
    cur.execute("SELECT from_url, to_url FROM seo_links WHERE site_id = %s", (site_id,))
    edges = cur.fetchall()
    pr, inlinks = pr_mod.compute(edges)
    max_pr = max(pr.values()) if pr else 0.0

    # Mise à jour pagerank + inlinks + value_score + health pour TOUTES les pages du site.
    cur.execute("SELECT url, category FROM seo_pages WHERE site_id = %s", (site_id,))
    for url, category in cur.fetchall():
        page_pr = float(pr.get(url, 0.0))
        page_in = int(inlinks.get(url, 0))
        ratio = (page_pr / max_pr) if max_pr > 0 else 0.0
        value = value_for_category(category, url, home_url)
        health = classify_health(page_in, ratio, value)
        cur.execute(
            """UPDATE seo_pages
               SET internal_pagerank = %s, inlinks_count = %s, value_score = %s,
                   health = %s, updated_at = NOW()
               WHERE site_id = %s AND url = %s""",
            (page_pr, page_in, value, health, site_id, url),
        )
    conn.commit()

    print(f"  pages={stats['pages']} parsées={stats['parsed']} liens={stats['links']} "
          f"noeuds_graphe={len(pr)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="reconstruction complète du graphe")
    ap.add_argument("--site", help="restreindre à un domaine (ex: jurojin.net)")
    args = ap.parse_args()

    sites = [s for s in config.SITES if (not args.site or s["domain"] == args.site)]
    if not sites:
        print(f"Aucun site '{args.site}' dans config.SITES")
        return

    conn = connect()
    try:
        for site in sites:
            try:
                crawl_site(conn, site, full=args.full)
            except Exception as e:
                conn.rollback()
                print(f"[ERREUR] {site['domain']}: {e}")
    finally:
        conn.close()
    print("\n[SEO] Run terminé.")


if __name__ == "__main__":
    main()
