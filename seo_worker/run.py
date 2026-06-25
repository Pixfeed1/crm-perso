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
import time
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


def value_for_category(category, url, ctype, home_url):
    """Heuristique TEMPORAIRE (remplacée par les impressions GSC à l'étape 2).
    Pilier 90 = vrai 3D/Blender (et CPT glossaire) ; tech-conso 30 ; guide générique 60."""
    if url == home_url:
        return config.VALUE_HOME_HUB
    hay = f"{category or ''} {url or ''} {ctype or ''}".lower()
    if (ctype or "").lower() in config.PILLAR_TYPES or any(k in hay for k in config.PILLAR_3D):
        return config.VALUE_PILLAR
    if any(k in hay for k in config.TECH_CONSO):
        return config.VALUE_TECH_CONSO
    if any(k in hay for k in config.GENERIC_GUIDE):
        return config.VALUE_GENERIC
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


def crawl_site(conn, site, full=False, no_resume=False, job_id=None):
    cur = conn.cursor()
    domain = site["domain"]
    base = site["wp_base_url"].rstrip("/")
    home_url = wp.normalize_url(base)
    site_id = upsert_site(cur, site)
    conn.commit()

    # Reprise : on repart du dernier run interrompu (running/failed) sauf --full ou --no-resume.
    resume_from = None
    if not full and not no_resume:
        cur.execute(
            "SELECT last_wp_id FROM seo_crawl_runs WHERE site_id = %s AND status IN ('running','failed') "
            "ORDER BY started_at DESC LIMIT 1",
            (site_id,),
        )
        row = cur.fetchone()
        if row and row[0] is not None:
            resume_from = row[0]

    # Nouvelle ligne de run.
    cur.execute("INSERT INTO seo_crawl_runs (site_id, status) VALUES (%s, 'running') RETURNING id", (site_id,))
    run_id = cur.fetchone()[0]
    cur.execute("UPDATE seo_crawl_runs SET last_wp_id = %s WHERE id = %s", (resume_from, run_id))
    conn.commit()

    mode = "full" if full else (f"reprise (> wp_id {resume_from})" if resume_from is not None else "incrémental")
    try:
        # État existant (pour l'incrémental).
        cur.execute("SELECT url, wp_modified_at, last_crawl FROM seo_pages WHERE site_id = %s", (site_id,))
        existing = {r[0]: {"modified": r[1], "last_crawl": r[2]} for r in cur.fetchall()}

        # DELETE global des liens : UNIQUEMENT en --full (reconstruction complète, sans reprise).
        if full:
            cur.execute("DELETE FROM seo_links WHERE site_id = %s", (site_id,))
            conn.commit()

        items = wp.list_content(base)
        total = len(items)
        print(f"\n=== {domain} (site_id={site_id}) mode={mode} — {total} contenus ===")

        # Purge des pages/liens OBSOLÈTES : la liste REST est toujours complète, donc tout
        # ce qui n'y figure plus (anciens attachments, contenus supprimés) est retiré.
        listed_urls = [it["url"] for it in items if it["url"]]
        if listed_urls:  # garde-fou : ne jamais purger si la liste REST est vide (échec listing)
            cur.execute("DELETE FROM seo_links WHERE site_id = %s AND from_url <> ALL(%s)", (site_id, listed_urls))
            cur.execute("DELETE FROM seo_pages WHERE site_id = %s AND url <> ALL(%s)", (site_id, listed_urls))
            conn.commit()

        if job_id is not None:
            cur.execute("UPDATE seo_jobs SET progress_total = %s WHERE id = %s", (total, job_id))
            conn.commit()

        processed = 0
        parsed = 0
        links = 0
        last_wp_id = resume_from

        for idx, item in enumerate(items, 1):
            url = item["url"]
            if not url:
                continue
            # Saut de reprise : on ignore ce qui a déjà été traité (wp_id <= dernier traité).
            if resume_from is not None and item["wp_id"] is not None and item["wp_id"] <= resume_from:
                continue

            try:
                cur.execute("SAVEPOINT pg")  # isole l'erreur d'UNE page sans perdre le lot
                mod = parse_dt(item["modified_at"])
                cur.execute(
                    """INSERT INTO seo_pages (site_id, wp_id, url, title, type, category, wp_modified_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (site_id, url) DO UPDATE
                         SET wp_id = EXCLUDED.wp_id, title = EXCLUDED.title, type = EXCLUDED.type,
                             category = EXCLUDED.category, wp_modified_at = EXCLUDED.wp_modified_at,
                             updated_at = NOW()""",
                    (site_id, item["wp_id"], url, item["title"], item["type"], item["category"], mod),
                )

                prev = existing.get(url)
                needs_parse = (
                    full
                    or prev is None
                    or prev["last_crawl"] is None
                    or (mod and prev["modified"] and mod > prev["modified"])
                    or (mod and prev["modified"] is None)
                )
                if needs_parse:
                    time.sleep(config.POLITENESS_DELAY)  # politesse : ne pas marteler le site
                    html = wp.fetch_html(url)
                    if html:
                        parsed += 1
                        meta = wp.extract_seo_meta(html, item.get("_yoast"))
                        cur.execute(
                            "UPDATE seo_pages SET seo_meta = %s, last_crawl = NOW(), updated_at = NOW() "
                            "WHERE site_id = %s AND url = %s",
                            (json.dumps(meta), site_id, url),
                        )
                        # En --full, le graphe a été purgé globalement -> pas de delete par page.
                        # Sinon (incrémental OU reprise) : delete/reload UNIQUEMENT de cette page.
                        if not full:
                            cur.execute("DELETE FROM seo_links WHERE site_id = %s AND from_url = %s", (site_id, url))
                        for to_url, anchor in wp.extract_links(html, url, domain):
                            cur.execute(
                                """INSERT INTO seo_links (site_id, from_url, to_url, anchor)
                                   VALUES (%s, %s, %s, %s)
                                   ON CONFLICT (site_id, from_url, to_url, anchor) DO NOTHING""",
                                (site_id, url, to_url, anchor or ""),
                            )
                            links += 1
                cur.execute("RELEASE SAVEPOINT pg")
                processed += 1
                if item["wp_id"] is not None:
                    last_wp_id = item["wp_id"]
            except Exception as e:
                cur.execute("ROLLBACK TO SAVEPOINT pg")  # on conserve les pages déjà faites du lot
                print(f"[ERREUR page] {url}: {e}")
                continue

            # Commit par lots : persiste la progression + permet la reprise.
            if processed % config.COMMIT_BATCH == 0:
                cur.execute(
                    "UPDATE seo_crawl_runs SET last_wp_id = %s, pages_processed = %s WHERE id = %s",
                    (last_wp_id, processed, run_id),
                )
                if job_id is not None:
                    cur.execute("UPDATE seo_jobs SET progress_current = %s WHERE id = %s", (idx, job_id))
                conn.commit()
                print(f"  page {idx}/{total} — {domain} ({processed} traitées, {parsed} parsées)")

        # Dernier lot.
        cur.execute(
            "UPDATE seo_crawl_runs SET last_wp_id = %s, pages_processed = %s WHERE id = %s",
            (last_wp_id, processed, run_id),
        )
        conn.commit()

        # PageRank sur le GRAPHE ENTIER du site (reprise comprise).
        cur.execute("SELECT from_url, to_url FROM seo_links WHERE site_id = %s", (site_id,))
        edges = cur.fetchall()
        pr, inlinks = pr_mod.compute(edges)
        max_pr = max(pr.values()) if pr else 0.0

        cur.execute("SELECT url, category, type FROM seo_pages WHERE site_id = %s", (site_id,))
        rows = cur.fetchall()
        for i, (url, category, ctype) in enumerate(rows, 1):
            page_pr = float(pr.get(url, 0.0))
            page_in = int(inlinks.get(url, 0))
            ratio = (page_pr / max_pr) if max_pr > 0 else 0.0
            value = value_for_category(category, url, ctype, home_url)
            health = classify_health(page_in, ratio, value)
            cur.execute(
                """UPDATE seo_pages
                   SET internal_pagerank = %s, inlinks_count = %s, value_score = %s,
                       health = %s, updated_at = NOW()
                   WHERE site_id = %s AND url = %s""",
                (page_pr, page_in, value, health, site_id, url),
            )
            if i % config.COMMIT_BATCH == 0:
                conn.commit()
        conn.commit()

        cur.execute(
            "UPDATE seo_crawl_runs SET status = 'done', finished_at = NOW(), pages_processed = %s WHERE id = %s",
            (processed, run_id),
        )
        conn.commit()
        print(f"  OK pages={processed} parsées={parsed} liens+={links} noeuds_graphe={len(pr)}")
        return True

    except Exception as e:
        # Échec : on conserve la progression commitée et on marque le run 'failed'
        # (last_wp_id déjà à jour au dernier lot -> le prochain run reprendra de là).
        conn.rollback()
        try:
            cur.execute("UPDATE seo_crawl_runs SET status = 'failed', finished_at = NOW() WHERE id = %s", (run_id,))
            conn.commit()
        except Exception:
            conn.rollback()
        print(f"[ERREUR site] {domain}: {e}")
        return False


def site_by_id(conn, site_id):
    cur = conn.cursor()
    cur.execute("SELECT id, domain, wp_base_url, gsc_property FROM seo_sites WHERE id = %s", (site_id,))
    r = cur.fetchone()
    if not r:
        return None
    return {"id": r[0], "domain": r[1], "wp_base_url": r[2], "gsc_property": r[3]}


def claim_next_job(conn):
    """Réserve atomiquement le plus ancien job 'pending' (un seul à la fois)."""
    cur = conn.cursor()
    cur.execute(
        """UPDATE seo_jobs SET status = 'running', started_at = NOW()
           WHERE id = (
             SELECT id FROM seo_jobs WHERE status = 'pending'
             ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
           )
           RETURNING id, site_id, job_type""",
        (),
    )
    row = cur.fetchone()
    conn.commit()
    if not row:
        return None
    return {"id": row[0], "site_id": row[1], "job_type": row[2]}


def serve():
    """Service permanent : traite la file seo_jobs SÉQUENTIELLEMENT (un seul job à la fois)."""
    conn = connect()
    print(f"[SEO] Worker en service (poll {config.POLL_INTERVAL}s)")
    try:
        while True:
            job = claim_next_job(conn)
            if not job:
                time.sleep(config.POLL_INTERVAL)
                continue
            site = site_by_id(conn, job["site_id"])
            if not site:
                conn.cursor().execute(
                    "UPDATE seo_jobs SET status = 'failed', error = 'site introuvable', finished_at = NOW() WHERE id = %s",
                    (job["id"],),
                )
                conn.commit()
                continue
            print(f"[SEO] Job #{job['id']} {job['job_type']} -> {site['domain']}")
            full = job["job_type"] == "crawl_full"
            try:
                ok = crawl_site(conn, site, full=full, job_id=job["id"])
            except Exception as e:
                ok = False
                print(f"[SEO] Job #{job['id']} exception: {e}")
            cur = conn.cursor()
            if ok:
                cur.execute("UPDATE seo_jobs SET status = 'done', finished_at = NOW() WHERE id = %s", (job["id"],))
            else:
                cur.execute(
                    "UPDATE seo_jobs SET status = 'failed', finished_at = NOW(), error = COALESCE(error, 'échec du crawl') WHERE id = %s",
                    (job["id"],),
                )
            conn.commit()
    except KeyboardInterrupt:
        print("\n[SEO] Service arrêté.")
    finally:
        conn.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="reconstruction complète du graphe (purge liens + reparse total, ignore la reprise)")
    ap.add_argument("--no-resume", action="store_true", help="run incrémental sans reprise du run précédent")
    ap.add_argument("--site", help="restreindre à un domaine (ex: jurojin.net)")
    ap.add_argument("--serve", action="store_true", help="service permanent : traite la file seo_jobs (un seul job à la fois)")
    args = ap.parse_args()

    if args.serve:
        serve()
        return

    sites = [s for s in config.SITES if (not args.site or s["domain"] == args.site)]
    if not sites:
        print(f"Aucun site '{args.site}' dans config.SITES")
        return

    conn = connect()
    try:
        for site in sites:
            try:
                crawl_site(conn, site, full=args.full, no_resume=args.no_resume)
            except Exception as e:
                conn.rollback()
                print(f"[ERREUR] {site['domain']}: {e}")
    finally:
        conn.close()
    print("\n[SEO] Run terminé.")


if __name__ == "__main__":
    main()
