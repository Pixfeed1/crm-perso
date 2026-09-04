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
import math
import os
import time
from collections import deque
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

import config
import wp
import pagerank as pr_mod
import gsc
import indexation
import pagespeed
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


def load_sites(conn, domain=None):
    """Sites suivis, lus dans seo_sites (source unique, pilotee par l'UI du CRM).
    Si la table est vide (premiere installation), elle est amorcee avec config.SEED_SITES ;
    ensuite l'amorce n'est plus jamais rejouee, pour ne pas ecraser les reglages de l'UI."""
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM seo_sites")
    if cur.fetchone()[0] == 0 and getattr(config, "SEED_SITES", None):
        for site in config.SEED_SITES:
            try:
                sid = upsert_site(cur, site)
                conn.commit()
                print(f"[SEO] Site amorce : {site['domain']} (site_id={sid})")
            except Exception as e:
                conn.rollback()
                print(f"[SEO] Amorce {site.get('domain')} echouee : {e}")
    cur.execute(
        "SELECT id, domain, wp_base_url, gsc_property FROM seo_sites"
        + (" WHERE domain = %s" if domain else "") + " ORDER BY domain",
        (domain,) if domain else (),
    )
    return [{"id": r[0], "domain": r[1], "wp_base_url": r[2], "gsc_property": r[3]} for r in cur.fetchall()]


def audit_postprocess(conn, site_id, home_url, edges, base):
    """Audit niveau graphe/site (transaction séparée, le crawl est déjà commité) :
    - profondeur de crawl = plus court chemin depuis l'accueil (BFS sur le graphe déjà en main),
    - présence dans le sitemap par page,
    - orphelins sitemap (URLs au sitemap absentes des pages crawlées) HEADés (plafonné) -> 404.
    N'écrit QUE dans seo_onpage_issues / seo_audit (jamais seo_pages/seo_links)."""
    cur = conn.cursor()

    # 1) Profondeur depuis la home (BFS, réutilise le graphe -> aucune requête réseau).
    adj = {}
    for f, t in edges:
        adj.setdefault(f, []).append(t)
    depth = {}
    if home_url:
        depth[home_url] = 0
        dq = deque([home_url])
        while dq:
            u = dq.popleft()
            for v in adj.get(u, []):
                if v not in depth:
                    depth[v] = depth[u] + 1
                    dq.append(v)

    # 2) Sitemap (1 fetch + sous-sitemaps plafonnés/polis).
    #    On garde le DÉTAIL par URL (sous-sitemap d'origine + lastmod) : seul le nombre
    #    était conservé jusqu'ici, ce qui obligeait à un curl manuel pour savoir si une
    #    URL précise figure au sitemap.
    sitemap_detail, sitemap_url = wp.fetch_sitemap_detailed(base)
    sitemap_urls = set(sitemap_detail.keys())
    if sitemap_urls:
        # Remplacement intégral : une URL retirée du sitemap doit disparaître d'ici,
        # sinon les écarts calculés plus bas resteraient faux indéfiniment.
        cur.execute("DELETE FROM seo_sitemap_urls WHERE site_id = %s", (site_id,))
        for u, d in sitemap_detail.items():
            cur.execute(
                """INSERT INTO seo_sitemap_urls (site_id, url, sitemap_file, lastmod, seen_at)
                   VALUES (%s,%s,%s,%s,NOW())
                   ON CONFLICT (site_id, url) DO UPDATE
                     SET sitemap_file = EXCLUDED.sitemap_file, lastmod = EXCLUDED.lastmod,
                         seen_at = NOW()""",
                (site_id, u, d.get("sitemap_file"), d.get("lastmod")),
            )
        conn.commit()

    # 3) Profondeur + présence sitemap mergées dans l'audit de CHAQUE page.
    cur.execute("SELECT url FROM seo_pages WHERE site_id = %s", (site_id,))
    page_urls = [r[0] for r in cur.fetchall()]
    page_set = set(page_urls)
    n = 0
    for u in page_urls:
        merge = {
            "crawl_depth": depth.get(u),
            "in_sitemap": (u in sitemap_urls) if sitemap_urls else None,
        }
        cur.execute(
            """INSERT INTO seo_onpage_issues (site_id, url, data, updated_at)
               VALUES (%s, %s, %s, NOW())
               ON CONFLICT (site_id, url) DO UPDATE
                 SET data = seo_onpage_issues.data || EXCLUDED.data, updated_at = NOW()""",
            (site_id, u, json.dumps(merge)),
        )
        n += 1
        if n % config.COMMIT_BATCH == 0:
            conn.commit()
    conn.commit()

    # 4) Orphelins sitemap -> HEAD plafonné (+ politesse) pour isoler les 404.
    orphans_404 = []
    if sitemap_urls:
        checked = 0
        for u in (x for x in sitemap_urls if x not in page_set):
            if checked >= config.AUDIT_SITEMAP_HEAD_CAP:
                break
            time.sleep(config.POLITENESS_DELAY)
            checked += 1
            if wp.head_status(u) == 404:
                orphans_404.append(u)
    cur.execute(
        """INSERT INTO seo_audit (site_id, sitemap_url, sitemap_fetched, sitemap_count, orphans_404, updated_at)
           VALUES (%s, %s, %s, %s, %s, NOW())
           ON CONFLICT (site_id) DO UPDATE
             SET sitemap_url = EXCLUDED.sitemap_url, sitemap_fetched = EXCLUDED.sitemap_fetched,
                 sitemap_count = EXCLUDED.sitemap_count, orphans_404 = EXCLUDED.orphans_404, updated_at = NOW()""",
        (site_id, sitemap_url, bool(sitemap_url), len(sitemap_urls), json.dumps(orphans_404)),
    )
    conn.commit()
    print(f"  [AUDIT] profondeur+sitemap OK (sitemap={'oui' if sitemap_url else 'non'}, "
          f"urls={len(sitemap_urls)}, 404={len(orphans_404)})")


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
        cur.execute(
            "SELECT url, wp_modified_at, last_crawl, seo_meta FROM seo_pages WHERE site_id = %s",
            (site_id,),
        )
        existing = {
            r[0]: {
                "modified": r[1], "last_crawl": r[2],
                # Sert à rattraper les pages dont les métadonnées manquent : voir needs_parse.
                "has_desc": bool((r[3] or {}).get("description")),
            }
            for r in cur.fetchall()
        }

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

            audit_data = None  # données d'audit on-page de CETTE page (None = pas réauditée)
            try:
                cur.execute("SAVEPOINT pg")  # isole l'erreur d'UNE page sans perdre le lot
                mod = parse_dt(item["modified_at"])
                cur.execute(
                    """INSERT INTO seo_pages (site_id, wp_id, url, title, type, category, wp_modified_at, focus_keyword, tags)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (site_id, url) DO UPDATE
                         SET wp_id = EXCLUDED.wp_id, title = EXCLUDED.title, type = EXCLUDED.type,
                             category = EXCLUDED.category, wp_modified_at = EXCLUDED.wp_modified_at,
                             focus_keyword = EXCLUDED.focus_keyword, tags = EXCLUDED.tags,
                             updated_at = NOW()""",
                    (site_id, item["wp_id"], url, item["title"], item["type"], item["category"], mod, item.get("focus_keyword"),
                     json.dumps(item.get("tags") or [])),
                )

                prev = existing.get(url)
                # `seo_meta` (title, description, canonical, robots) n'est ecrit QUE si la
                # page est reparsee. Or `focus_keyword` et les autres champs de la liste REST
                # sont, eux, rafraichis a chaque passage. Cette asymetrie faisait qu'une
                # meta description ajoutee dans Yoast n'apparaissait jamais : ecrire
                # _yoast_wpseo_metadesc ne modifie pas post_modified, donc la page etait
                # sautee et gardait son ancienne valeur indefiniment.
                #
                # Deux rattrapages, en plus de la detection par date :
                #   - metadonnees absentes -> on reparse (cas d'une description ajoutee)
                #   - page jamais revue depuis N jours -> rotation, pour finir par capter
                #     les changements invisibles cote WordPress (gabarit Yoast, canonique...)
                trop_ancien = (
                    prev is not None and prev["last_crawl"] is not None
                    and (datetime.now(timezone.utc) - prev["last_crawl"].replace(
                        tzinfo=prev["last_crawl"].tzinfo or timezone.utc)).days
                        > config.RECRAWL_META_DAYS
                )
                needs_parse = (
                    full
                    or prev is None
                    or prev["last_crawl"] is None
                    or (mod and prev["modified"] and mod > prev["modified"])
                    or (mod and prev["modified"] is None)
                    or not prev["has_desc"]
                    or trop_ancien
                )
                if needs_parse:
                    time.sleep(config.POLITENESS_DELAY)  # politesse : ne pas marteler le site
                    html, fetch_meta = wp.fetch_html(url)
                    if html:
                        parsed += 1
                        # Les champs lus via l'API REST font autorité sur le <head> rendu.
                        meta = wp.extract_seo_meta(html, item.get("_yoast"), rest=item)
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
                    # Préparation de l'audit on-page À PARTIR DU HTML DÉJÀ EN MAIN (aucune requête
                    # en plus). Try/except dédié : une extraction qui échoue NE casse jamais la
                    # page ni le crawl (audit_data reste None ou partiel).
                    try:
                        ad = wp.extract_onpage(html, url) if html else {}
                        ad["http_status"] = fetch_meta.get("status")
                        ad["redirect_chain"] = fetch_meta.get("redirect_chain") or []
                        ad["redirect_loop"] = bool(fetch_meta.get("loop"))
                        ad["fetch_error"] = fetch_meta.get("error")
                        ad["audited"] = True
                        audit_data = ad
                        # Redirections : on ne stocke que les URLs qui en subissent une.
                        # Une 301 vers l'ACCUEIL est signalée à part : Google la traite
                        # comme une soft 404 (le contenu attendu n'existe plus).
                        if fetch_meta.get("hops"):
                            final_u = wp.normalize_url(fetch_meta.get("final_url") or "")
                            cur.execute(
                                """INSERT INTO seo_redirects
                                     (site_id, from_url, final_url, final_status, hops, chain, to_home, updated_at)
                                   VALUES (%s,%s,%s,%s,%s,%s,%s,NOW())
                                   ON CONFLICT (site_id, from_url) DO UPDATE
                                     SET final_url = EXCLUDED.final_url, final_status = EXCLUDED.final_status,
                                         hops = EXCLUDED.hops, chain = EXCLUDED.chain,
                                         to_home = EXCLUDED.to_home, updated_at = NOW()""",
                                (site_id, url, final_u, fetch_meta.get("status"),
                                 fetch_meta.get("hops"), json.dumps(fetch_meta.get("chain") or []),
                                 bool(final_u and home_url and final_u == home_url)),
                            )
                    except Exception as ae:
                        audit_data = {"audited": False}
                        print(f"[AUDIT] extraction {url}: {ae}")
                cur.execute("RELEASE SAVEPOINT pg")
                processed += 1
                if item["wp_id"] is not None:
                    last_wp_id = item["wp_id"]
            except Exception as e:
                cur.execute("ROLLBACK TO SAVEPOINT pg")  # on conserve les pages déjà faites du lot
                print(f"[ERREUR page] {url}: {e}")
                continue

            # Audit on-page : écrit dans une table DÉDIÉE, APRÈS le savepoint de la page, dans
            # SON PROPRE savepoint -> un souci d'audit ne touche jamais seo_pages/seo_links.
            if audit_data is not None:
                try:
                    cur.execute("SAVEPOINT audit")
                    cur.execute(
                        """INSERT INTO seo_onpage_issues (site_id, url, data, audited_at, updated_at)
                           VALUES (%s, %s, %s, NOW(), NOW())
                           ON CONFLICT (site_id, url) DO UPDATE
                             SET data = seo_onpage_issues.data || EXCLUDED.data,
                                 audited_at = NOW(), updated_at = NOW()""",
                        (site_id, url, json.dumps(audit_data)),
                    )
                    cur.execute("RELEASE SAVEPOINT audit")
                except Exception as ae:
                    cur.execute("ROLLBACK TO SAVEPOINT audit")
                    print(f"[AUDIT] page non auditée {url}: {ae}")

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

                # Annulation demandée depuis l'UI : on arrête PROPREMENT après ce lot.
                # La progression est déjà commitée ; on marque le run 'failed' pour que le
                # prochain crawl reprenne après last_wp_id. Pas de recalcul PageRank ici.
                if cancel_requested(cur, job_id):
                    cur.execute(
                        "UPDATE seo_crawl_runs SET status = 'failed', finished_at = NOW(), pages_processed = %s WHERE id = %s",
                        (processed, run_id),
                    )
                    conn.commit()
                    print(f"  [ANNULÉ] {domain} sur demande — {processed} pages traitées avant arrêt")
                    return "cancelled"

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

        # Audit post-graphe (profondeur de crawl + cohérence sitemap), TOTALEMENT isolé :
        # les données de crawl/PageRank sont déjà commitées -> un souci d'audit ne fait jamais
        # échouer le run (au pire, l'audit profondeur/sitemap n'est pas rafraîchi ce run-ci).
        try:
            audit_postprocess(conn, site_id, home_url, edges, base)
        except Exception as ae:
            conn.rollback()
            print(f"[AUDIT] post-traitement ignoré ({domain}): {ae}")

        # Similarité de contenu (TF-IDF sur les extraits) : même isolation que l'audit —
        # un échec ici ne fait jamais échouer le crawl (au pire, les paires ne sont pas
        # rafraîchies ce run-ci et les suggestions gardent les anciennes).
        try:
            import similarity
            similarity.compute_similar_pages(conn, site_id)
        except Exception as se:
            conn.rollback()
            print(f"[SIMILARITY] étape ignorée ({domain}): {se}")

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


def gsc_value_score(impr, max_impr):
    """value_score 0..100 à partir des impressions GSC (échelle log, normalisée au max du site)."""
    if not impr or impr <= 0 or not max_impr or max_impr <= 0:
        return None
    return int(round(100.0 * math.log1p(impr) / math.log1p(max_impr)))


def gsc_sync_site(conn, site, job_id=None):
    """Synchro Google Search Console pour un site (étape 2). Renvoie True / False / 'cancelled'.

    1) Search Analytics -> seo_gsc_daily (upsert idempotent).
    2) URL Inspection   -> seo_url_inspections (+ seo_pages.indexation_status), plafonné.
    3) Snapshot mensuel -> seo_metrics_monthly (mémoire longue au-delà des 16 mois GSC).
    4) value_score RÉEL (impressions GSC, fallback heuristique) + recalcul health sans recrawl.
    """
    cur = conn.cursor()
    domain = site["domain"]
    gsc_property = site.get("gsc_property")
    base = site["wp_base_url"].rstrip("/")
    home_url = wp.normalize_url(base)
    site_id = upsert_site(cur, site)
    conn.commit()

    if not gsc_property:
        msg = f"gsc_property manquant pour {domain}"
        print(f"[GSC] {msg}")
        if job_id is not None:
            cur.execute("UPDATE seo_jobs SET error = %s WHERE id = %s", (msg, job_id))
            conn.commit()
        return False

    try:
        creds = gsc.load_credentials(conn)
    except Exception as e:
        msg = f"OAuth GSC : échec du rafraîchissement ({str(e)[:200]})"
        print(f"[GSC] {msg}")
        if job_id is not None:
            cur.execute("UPDATE seo_jobs SET error = %s WHERE id = %s", (msg, job_id))
            conn.commit()
        return False
    if creds is None:
        msg = "OAuth GSC non configuré (lancer gsc_auth.py)"
        print(f"[GSC] {msg}")
        if job_id is not None:
            cur.execute("UPDATE seo_jobs SET error = %s WHERE id = %s", (msg, job_id))
            conn.commit()
        return False

    today = datetime.now(timezone.utc).date()
    end_d = today - timedelta(days=config.GSC_LAG_DAYS)

    try:
        # ---- 1) Search Analytics (date, page, query) ----
        cur.execute("SELECT MAX(date) FROM seo_gsc_daily WHERE site_id = %s", (site_id,))
        max_d = cur.fetchone()[0]
        if max_d:
            start_d = max_d + timedelta(days=1)          # incrémental : jour suivant le dernier connu
        else:
            start_d = end_d - timedelta(days=config.GSC_INITIAL_DAYS)  # premier sync : backfill
        if start_d > end_d:
            start_d = end_d  # rien de nouveau : on rafraîchit quand même le dernier jour dispo

        print(f"\n=== GSC {domain} (site_id={site_id}) — Search Analytics {start_d} -> {end_d} ===")
        rows = gsc.search_analytics(creds, gsc_property, start_d.isoformat(), end_d.isoformat())
        print(f"  {len(rows)} lignes (date,page,query)")
        inserted = 0
        for row in rows:
            cur.execute(
                """INSERT INTO seo_gsc_daily (site_id, date, page_url, query, clicks, impressions, position)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (site_id, date, page_url, query) DO UPDATE
                     SET clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions,
                         position = EXCLUDED.position""",
                (site_id, row["date"], row["page"], row["query"], row["clicks"], row["impressions"], row["position"]),
            )
            inserted += 1
            if inserted % 500 == 0:
                conn.commit()
                if cancel_requested(cur, job_id):
                    conn.commit()
                    print("  [ANNULÉ] pendant Search Analytics")
                    return "cancelled"
        conn.commit()

        # ---- 2) URL Inspection (priorité : jamais inspectées, puis plus anciennes ; plafond/jour) ----
        cur.execute(
            """SELECT p.url
               FROM seo_pages p
               LEFT JOIN seo_url_inspections i
                 ON i.site_id = p.site_id AND i.page_url = p.url
               WHERE p.site_id = %s
                 AND (i.inspected_at IS NULL OR i.inspected_at < NOW() - (%s || ' days')::interval)
               ORDER BY i.inspected_at ASC NULLS FIRST, p.url ASC
               LIMIT %s""",
            (site_id, config.GSC_INSPECT_TTL_DAYS, config.GSC_INSPECT_DAILY_CAP),
        )
        to_inspect = [r[0] for r in cur.fetchall()]
        print(f"  URL Inspection : {len(to_inspect)} pages (plafond {config.GSC_INSPECT_DAILY_CAP})")
        if job_id is not None:
            cur.execute("UPDATE seo_jobs SET progress_total = %s, progress_current = 0 WHERE id = %s",
                        (len(to_inspect), job_id))
            conn.commit()

        # IMPORTANT : on inspecte l'URL telle que Google l'indexe (souvent AVEC slash final),
        # pas l'URL normalisée (sans slash) -> sinon coverageState = "URL is unknown to Google".
        # 1) URL canonique exacte connue de GSC (Search Analytics) si la page a des impressions.
        cur.execute(
            "SELECT page_url FROM seo_gsc_daily WHERE site_id = %s GROUP BY page_url", (site_id,)
        )
        gsc_urls = [r[0] for r in cur.fetchall()]
        canon_by_norm = {}
        for gurl in gsc_urls:
            n = wp.normalize_url(gurl)
            if n and n not in canon_by_norm:
                canon_by_norm[n] = gurl
        # 2) Convention de slash final déduite de ce que Google indexe réellement.
        slashed = sum(1 for u in gsc_urls if (urlparse(u).path or "").endswith("/"))
        use_trailing = bool(gsc_urls) and slashed >= len(gsc_urls) / 2

        def inspect_target(u):
            """URL à inspecter : canonique GSC si connue, sinon variante slash selon le site.
            Toujours sans fragment (#ancre) : Google ne connaît pas les URLs ancrées."""
            base = gsc.strip_fragment(u)
            if base in canon_by_norm:
                return gsc.strip_fragment(canon_by_norm[base])
            path = urlparse(base).path or ""
            if use_trailing and path not in ("", "/") and not base.endswith("/"):
                return base + "/"
            return base

        cap = config.GSC_INSPECT_DAILY_CAP
        debug = bool(os.environ.get("GSC_DEBUG"))
        api_calls = 0
        done = 0
        quota_hit = False
        for url in to_inspect:
            try:
                target = inspect_target(url)
                coverage, raw = gsc.inspect_url(creds, gsc_property, target)
                api_calls += 1
                if debug and done < 3:
                    isr = (raw or {}).get("inspectionResult", {}).get("indexStatusResult", {})
                    print(f"  [GSC_DEBUG] seo_pages.url={url!r}")
                    print(f"             URL inspectée      ={target!r}")
                    print(f"             coverageState={isr.get('coverageState')!r} verdict={isr.get('verdict')!r} "
                          f"indexingState={isr.get('indexingState')!r} pageFetchState={isr.get('pageFetchState')!r}")
                    print(f"             googleCanonical={isr.get('googleCanonical')!r} userCanonical={isr.get('userCanonical')!r}")
                # Filet : si "unknown" alors qu'on n'a pas testé la variante slash, réessayer
                # une fois avec le slash basculé (borné par le quota d'inspections).
                if coverage and "unknown" in coverage.lower() and api_calls < cap:
                    alt = gsc.strip_fragment(url) + "/"
                    if alt != target:
                        cov2, raw2 = gsc.inspect_url(creds, gsc_property, alt)
                        api_calls += 1
                        if cov2 and "unknown" not in cov2.lower():
                            coverage, raw = cov2, raw2
                cur.execute(
                    """INSERT INTO seo_url_inspections (site_id, page_url, inspection_status, raw_response, inspected_at, updated_at)
                       VALUES (%s, %s, %s, %s, NOW(), NOW())
                       ON CONFLICT (site_id, page_url) DO UPDATE
                         SET inspection_status = EXCLUDED.inspection_status,
                             raw_response = EXCLUDED.raw_response,
                             inspected_at = NOW(), updated_at = NOW()""",
                    (site_id, url, coverage, json.dumps(raw)),
                )
                cur.execute(
                    "UPDATE seo_pages SET indexation_status = %s, updated_at = NOW() WHERE site_id = %s AND url = %s",
                    (coverage, site_id, url),
                )
            except gsc.QuotaExceeded:
                # Quota Google épuisé : on ARRÊTE NET (sans marquer la page 'unknown' -> on
                # conserve le statut précédent), reprise au prochain run (quota quotidien).
                quota_hit = True
                print(f"  [GSC] Quota URL Inspection épuisé ({api_calls} inspections faites) — arrêt, reprise demain.")
                conn.commit()
                break
            except Exception as e:
                print(f"  [ERREUR inspection] {url}: {e}")
            done += 1
            if done % 25 == 0:
                if job_id is not None:
                    cur.execute("UPDATE seo_jobs SET progress_current = %s WHERE id = %s", (done, job_id))
                conn.commit()
                if cancel_requested(cur, job_id):
                    conn.commit()
                    print("  [ANNULÉ] pendant URL Inspection")
                    return "cancelled"
        conn.commit()

        # ---- 3) Snapshot mensuel (agrégation seo_gsc_daily -> seo_metrics_monthly) ----
        cur.execute(
            """INSERT INTO seo_metrics_monthly (site_id, month, page_url, clicks, impressions, avg_position)
               SELECT site_id, date_trunc('month', date)::date AS month, page_url,
                      SUM(clicks), SUM(impressions),
                      CASE WHEN SUM(impressions) > 0
                           THEN SUM(impressions * position) / SUM(impressions)
                           ELSE AVG(position) END
               FROM seo_gsc_daily WHERE site_id = %s
               GROUP BY site_id, month, page_url
               ON CONFLICT (site_id, month, page_url) DO UPDATE
                 SET clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions,
                     avg_position = EXCLUDED.avg_position""",
            (site_id,),
        )
        conn.commit()

        # ---- 3bis) Retention du detail quotidien ----
        # seo_gsc_daily grossit sans fin (une ligne par jour x page x requete). Le snapshot
        # mensuel vient d'etre ecrit pour tous les mois presents : au-dela de
        # GSC_RETENTION_MONTHS, le detail peut partir, la memoire longue reste dans
        # seo_metrics_monthly. Purge APRES le snapshot, jamais avant.
        retention = int(getattr(config, "GSC_RETENTION_MONTHS", 0) or 0)
        if retention > 0:
            cur.execute(
                """DELETE FROM seo_gsc_daily
                    WHERE site_id = %s
                      AND date < (date_trunc('month', CURRENT_DATE) - (%s * INTERVAL '1 month'))::date""",
                (site_id, retention),
            )
            purged = cur.rowcount
            conn.commit()
            if purged:
                print(f"  [GSC] retention : {purged} lignes quotidiennes purgees (> {retention} mois, snapshot mensuel conserve)")

        # ---- 4) value_score réel + cache 28j + recalcul health (sans recrawl) ----
        win_start = (end_d - timedelta(days=config.GSC_VALUE_WINDOW_DAYS)).isoformat()
        d28_start = (end_d - timedelta(days=28)).isoformat()
        # Impressions sur la fenêtre value (normalisées par URL).
        cur.execute(
            "SELECT page_url, SUM(impressions) FROM seo_gsc_daily WHERE site_id = %s AND date >= %s GROUP BY page_url",
            (site_id, win_start),
        )
        impr_by_url = {}
        for purl, simpr in cur.fetchall():
            impr_by_url[wp.normalize_url(purl)] = impr_by_url.get(wp.normalize_url(purl), 0) + int(simpr or 0)
        max_impr = max(impr_by_url.values()) if impr_by_url else 0
        # Cache 28 jours (clics / impressions / position pondérée) par URL.
        cur.execute(
            """SELECT page_url, SUM(clicks), SUM(impressions),
                      CASE WHEN SUM(impressions) > 0 THEN SUM(impressions * position) / SUM(impressions) ELSE NULL END
               FROM seo_gsc_daily WHERE site_id = %s AND date >= %s GROUP BY page_url""",
            (site_id, d28_start),
        )
        cache28 = {}
        for purl, c, i, pos in cur.fetchall():
            k = wp.normalize_url(purl)
            agg = cache28.setdefault(k, {"clicks": 0, "impressions": 0, "pos_num": 0.0})
            agg["clicks"] += int(c or 0)
            agg["impressions"] += int(i or 0)
            if pos is not None and i:
                agg["pos_num"] += float(pos) * int(i)

        # PageRank déjà en base : on récupère ratio pour recalculer health.
        cur.execute("SELECT MAX(internal_pagerank) FROM seo_pages WHERE site_id = %s", (site_id,))
        max_pr = float(cur.fetchone()[0] or 0)
        cur.execute(
            "SELECT url, category, type, internal_pagerank, inlinks_count FROM seo_pages WHERE site_id = %s",
            (site_id,),
        )
        pages = cur.fetchall()
        updated = 0
        for url, category, ctype, pr_val, inlinks in pages:
            impr = impr_by_url.get(url, 0)
            value = gsc_value_score(impr, max_impr)
            if value is None:  # pas de données GSC -> fallback heuristique
                value = value_for_category(category, url, ctype, home_url)
            ratio = (float(pr_val or 0) / max_pr) if max_pr > 0 else 0.0
            health = classify_health(int(inlinks or 0), ratio, value)
            c = cache28.get(url)
            gsc_clicks = c["clicks"] if c else None
            gsc_impr = c["impressions"] if c else None
            gsc_pos = (c["pos_num"] / c["impressions"]) if (c and c["impressions"]) else None
            cur.execute(
                """UPDATE seo_pages
                   SET value_score = %s, health = %s, gsc_clicks = %s, gsc_impressions = %s,
                       gsc_position = %s, gsc_synced_at = NOW(), updated_at = NOW()
                   WHERE site_id = %s AND url = %s""",
                (value, health, gsc_clicks, gsc_impr, gsc_pos, site_id, url),
            )
            updated += 1
            if updated % config.COMMIT_BATCH == 0:
                conn.commit()
        conn.commit()

        quota_note = " (quota inspection épuisé — reste à inspecter au prochain run)" if quota_hit else ""
        # 5) Verdict d'indexation page par page (URL Inspection), stocké et historisé.
        #    Placé APRÈS l'analytics : la priorisation s'appuie sur les impressions qui
        #    viennent d'être synchronisées. Ne fait jamais échouer la synchro : c'est un
        #    enrichissement, pas une dépendance.
        if not quota_hit:
            try:
                stats = indexation.run_inspection(conn, creds, site_id, gsc_property)
                if stats.get("quota_atteint"):
                    quota_hit = True
            except Exception as e:
                conn.rollback()
                print(f"[Index] {domain} : inspection non effectuée ({str(e)[:200]})")

        print(f"  OK GSC {domain} : daily+={inserted} inspections={done} pages_maj={updated}{quota_note}")
        # Remonte un message clair dans le job (affiché dans l'UI) si le quota a été touché :
        # la synchro a bien tourné (analytics + snapshot + value_score), seules des inspections
        # restent à faire au prochain run. Le job reste 'done', avec cette note.
        if quota_hit and job_id is not None:
            cur.execute(
                "UPDATE seo_jobs SET error = %s WHERE id = %s",
                (f"Quota d'inspection Google épuisé ({done} pages inspectées) — indexation reprise au prochain run (demain).", job_id),
            )
            conn.commit()
        return True

    except Exception as e:
        conn.rollback()
        print(f"[ERREUR GSC] {domain}: {e}")
        if job_id is not None:
            try:
                cur.execute("UPDATE seo_jobs SET error = %s WHERE id = %s", (str(e)[:500], job_id))
                conn.commit()
            except Exception:
                conn.rollback()
        return False


def gsc_inspect_result(creds, gsc_property, url):
    """Inspecte UNE url et renvoie un dict structuré (sans rien écrire en base).
    1 seule inspection -> consommation quota minimale."""
    sent = gsc.strip_fragment(url)
    try:
        coverage, raw = gsc.inspect_url(creds, gsc_property, sent)
        isr = (raw or {}).get("inspectionResult", {}).get("indexStatusResult", {})
        return {
            "ok": True,
            "url_sent": sent,
            "coverageState": isr.get("coverageState"),
            "verdict": isr.get("verdict"),
            "indexingState": isr.get("indexingState"),
            "pageFetchState": isr.get("pageFetchState"),
            "googleCanonical": isr.get("googleCanonical"),
            "userCanonical": isr.get("userCanonical"),
        }
    except gsc.QuotaExceeded:
        return {"ok": False, "url_sent": sent, "error": "Quota d'inspection Google épuisé — réessayez demain."}
    except Exception as e:
        return {"ok": False, "url_sent": sent, "error": str(e)[:300]}


def gsc_test_job(conn, site, target_url, job_id=None):
    """Job 'gsc_test' : inspecte UNE url et stocke le résultat brut dans seo_jobs.result.
    N'écrit JAMAIS dans seo_pages / seo_url_inspections. Ne déclenche pas la synchro complète."""
    cur = conn.cursor()
    gsc_property = site.get("gsc_property")
    if not target_url:
        result = {"ok": False, "error": "Aucune URL à tester."}
    elif not gsc_property:
        result = {"ok": False, "error": f"gsc_property manquant pour {site['domain']}."}
    else:
        try:
            creds = gsc.load_credentials(conn)
        except Exception as e:
            creds = None
            result = {"ok": False, "error": f"OAuth GSC : {str(e)[:200]}"}
        if creds is None:
            result = {"ok": False, "error": "OAuth GSC non configuré (lancer gsc_auth.py)."}
        else:
            result = gsc_inspect_result(creds, gsc_property, target_url)
    if job_id is not None:
        cur.execute("UPDATE seo_jobs SET result = %s WHERE id = %s", (json.dumps(result), job_id))
        conn.commit()
    print(f"[GSC TEST] {site['domain']} {target_url!r} -> {result}")
    return True


def gsc_debug_site(conn, site, n=3):
    """Investigation URL Inspection : pour les n pages à plus fortes impressions, inspecte
    À LA FOIS l'URL canonique GSC ET l'URL que le worker enverrait, et logge la réponse
    complète de Google (coverageState/verdict/indexingState/...) + le JSON brut.
    Aucune écriture en base. Usage : python run.py --gsc-debug --site jurojin.net
    """
    cur = conn.cursor()
    # Lecture seule : on ne crée rien, on lit le site déjà enregistré.
    cur.execute("SELECT id FROM seo_sites WHERE domain = %s", (site["domain"],))
    row = cur.fetchone()
    if not row:
        print(f"  Site {site['domain']} absent de seo_sites (lancer le worker --serve d'abord).")
        return
    site_id = row[0]
    gsc_property = site.get("gsc_property")
    print(f"\n=== GSC DEBUG {site['domain']} (site_id={site_id}) property={gsc_property!r} ===")
    if not gsc_property:
        print("  gsc_property manquant.")
        return
    try:
        creds = gsc.load_credentials(conn)
    except Exception as e:
        print(f"  OAuth : échec ({e})")
        return
    if creds is None:
        print("  OAuth GSC non configuré (lancer gsc_auth.py).")
        return

    # Convention de slash + map canonique, identiques à gsc_sync_site.
    cur.execute("SELECT page_url FROM seo_gsc_daily WHERE site_id = %s GROUP BY page_url", (site_id,))
    gsc_urls = [r[0] for r in cur.fetchall()]
    canon_by_norm = {}
    for gurl in gsc_urls:
        nrm = wp.normalize_url(gurl)
        if nrm and nrm not in canon_by_norm:
            canon_by_norm[nrm] = gurl
    slashed = sum(1 for u in gsc_urls if (urlparse(u).path or "").endswith("/"))
    use_trailing = bool(gsc_urls) and slashed >= len(gsc_urls) / 2
    print(f"  URLs GSC distinctes={len(gsc_urls)} | avec slash final={slashed} | use_trailing={use_trailing}")

    def target_for(nrm):
        base = gsc.strip_fragment(nrm)
        if base in canon_by_norm:
            return gsc.strip_fragment(canon_by_norm[base])
        path = urlparse(base).path or ""
        if use_trailing and path not in ("", "/") and not base.endswith("/"):
            return base + "/"
        return base

    # n pages à plus fortes impressions (donc forcément indexées par Google).
    cur.execute(
        """SELECT page_url, SUM(impressions) AS imp FROM seo_gsc_daily
           WHERE site_id = %s GROUP BY page_url ORDER BY imp DESC LIMIT %s""",
        (site_id, n),
    )
    top = cur.fetchall()
    for page_url, imp in top:
        nrm = wp.normalize_url(page_url)
        cur.execute("SELECT url FROM seo_pages WHERE site_id = %s AND url = %s", (site_id, nrm))
        in_pages = cur.fetchone() is not None
        target = target_for(nrm)
        print("\n------------------------------------------------------------")
        print(f"  canonical GSC (page_url) : {page_url!r}  (impressions={imp})")
        print(f"  normalize_url(GSC)       : {nrm!r}")
        print(f"  présent dans seo_pages   : {in_pages}")
        print(f"  URL inspectée par worker : {target!r}")
        print(f"  canonical == cible ?     : {page_url == target}")
        for tag, u in (("canonical GSC", page_url), ("cible worker ", target)):
            try:
                _cov, raw = gsc.inspect_url(creds, gsc_property, u)
                isr = (raw or {}).get("inspectionResult", {}).get("indexStatusResult", {})
                print(f"    [{tag}] {u!r}")
                print(f"        coverageState={isr.get('coverageState')!r} verdict={isr.get('verdict')!r} "
                      f"indexingState={isr.get('indexingState')!r} pageFetchState={isr.get('pageFetchState')!r}")
                print(f"        googleCanonical={isr.get('googleCanonical')!r} userCanonical={isr.get('userCanonical')!r}")
            except Exception as e:
                print(f"    [{tag}] {u!r} -> ERREUR : {e}")

    # JSON brut complet pour la 1re page (canonical GSC) : la vérité, sans interprétation.
    if top:
        try:
            _cov, raw = gsc.inspect_url(creds, gsc_property, top[0][0])
            print("\n  --- inspectionResult BRUT (1re page, canonical GSC) ---")
            print(json.dumps(raw, indent=2, ensure_ascii=False))
        except Exception as e:
            print(f"  JSON brut indisponible : {e}")


def site_by_id(conn, site_id):
    cur = conn.cursor()
    cur.execute("SELECT id, domain, wp_base_url, gsc_property FROM seo_sites WHERE id = %s", (site_id,))
    r = cur.fetchone()
    if not r:
        return None
    return {"id": r[0], "domain": r[1], "wp_base_url": r[2], "gsc_property": r[3]}


def cancel_requested(cur, job_id):
    """True si une annulation a été demandée sur ce job (status 'cancel_requested')."""
    if job_id is None:
        return False
    cur.execute("SELECT status FROM seo_jobs WHERE id = %s", (job_id,))
    row = cur.fetchone()
    return bool(row and row[0] == "cancel_requested")


def claim_next_job(conn):
    """Réserve atomiquement le plus ancien job 'pending' (un seul à la fois)."""
    cur = conn.cursor()
    cur.execute(
        """UPDATE seo_jobs SET status = 'running', started_at = NOW()
           WHERE id = (
             SELECT id FROM seo_jobs WHERE status = 'pending'
             ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
           )
           RETURNING id, site_id, job_type, target_url""",
        (),
    )
    row = cur.fetchone()
    conn.commit()
    if not row:
        return None
    return {"id": row[0], "site_id": row[1], "job_type": row[2], "target_url": row[3]}


def serve():
    """Service permanent : traite la file seo_jobs SÉQUENTIELLEMENT (un seul job à la fois)."""
    conn = connect()
    # Les sites vivent dans seo_sites (geres depuis l'UI). Au premier demarrage d'une
    # installation vide, l'amorce config.SEED_SITES les cree pour qu'ils apparaissent dans
    # le selecteur (sinon : poule/oeuf — impossible de lancer le premier crawl).
    for site in load_sites(conn):
        print(f"[SEO] Site pret : {site['domain']} (site_id={site['id']})")
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
            try:
                if job["job_type"] == "gsc_test":
                    ok = gsc_test_job(conn, site, job.get("target_url"), job_id=job["id"])
                elif job["job_type"] == "gsc_sync":
                    ok = gsc_sync_site(conn, site, job_id=job["id"])
                elif job["job_type"] == "pagespeed":
                    ok = pagespeed.run(
                        conn, site, job_id=job["id"],
                        cancel_check=lambda: cancel_requested(conn.cursor(), job["id"]),
                    )
                else:
                    full = job["job_type"] == "crawl_full"
                    ok = crawl_site(conn, site, full=full, job_id=job["id"])
            except Exception as e:
                ok = False
                print(f"[SEO] Job #{job['id']} exception: {e}")
            cur = conn.cursor()
            if ok is True:
                cur.execute("UPDATE seo_jobs SET status = 'done', finished_at = NOW() WHERE id = %s", (job["id"],))
            elif ok == "cancelled":
                cur.execute(
                    "UPDATE seo_jobs SET status = 'cancelled', finished_at = NOW(), error = 'annulé depuis l''UI' WHERE id = %s",
                    (job["id"],),
                )
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
    ap.add_argument("--gsc", action="store_true", help="synchro Google Search Console (hors file de jobs)")
    ap.add_argument("--gsc-debug", action="store_true", help="investigation URL Inspection (canonical GSC vs cible worker + JSON brut)")
    ap.add_argument("--gsc-test", metavar="URL", help="MODE TEST : inspecte UNE seule URL (1 inspection, rien en base)")
    ap.add_argument("--gsc-inspect", metavar="URL", help="alias de --gsc-test")
    ap.add_argument("--pagespeed", action="store_true", help="mesure Core Web Vitals / PageSpeed (accueil + pages les plus vues)")
    args = ap.parse_args()

    if args.serve:
        serve()
        return

    # Sites lus en base (geres dans l'UI) ; --site restreint a un domaine.
    conn0 = connect()
    try:
        sites = load_sites(conn0, args.site)
    finally:
        conn0.close()
    if not sites:
        print(f"Aucun site{f' {args.site!r}' if args.site else ''} dans seo_sites : l'ajouter dans l'UI (page SEO).")
        return

    # MODE TEST : inspecte UNE seule URL (1 inspection, AUCUNE écriture, pas de synchro complète).
    test_url = args.gsc_test or args.gsc_inspect
    if test_url:
        conn = connect()
        try:
            site = sites[0]
            prop = site.get("gsc_property")
            try:
                creds = gsc.load_credentials(conn)
            except Exception as e:
                print(f"ERREUR  OAuth GSC : {e}")
                return
            if creds is None:
                print("ERREUR  OAuth GSC non configuré (lancer gsc_auth.py).")
                return
            res = gsc_inspect_result(creds, prop, test_url)
            print(f"\n=== MODE TEST GSC — {site['domain']} (property={prop}) ===")
            print(f"  URL demandée  : {test_url!r}")
            print(f"  URL envoyée   : {res.get('url_sent')!r}  (fragment # retiré)")
            if res.get("ok"):
                print(f"  OK")
                print(f"  coverageState : {res.get('coverageState')!r}")
                print(f"  verdict       : {res.get('verdict')!r}")
                print(f"  indexingState : {res.get('indexingState')!r}")
                print(f"  pageFetchState: {res.get('pageFetchState')!r}")
                print(f"  googleCanonical: {res.get('googleCanonical')!r}")
                print(f"  userCanonical : {res.get('userCanonical')!r}")
            else:
                print(f"  ERREUR : {res.get('error')}")
        finally:
            conn.close()
        return

    conn = connect()
    try:
        for site in sites:
            try:
                if args.gsc_debug:
                    gsc_debug_site(conn, site)
                elif args.pagespeed:
                    pagespeed.run(conn, site)
                elif args.gsc:
                    gsc_sync_site(conn, site)
                else:
                    crawl_site(conn, site, full=args.full, no_resume=args.no_resume)
            except Exception as e:
                conn.rollback()
                print(f"[ERREUR] {site['domain']}: {e}")
    finally:
        conn.close()
    print("\n[SEO] Run terminé.")


if __name__ == "__main__":
    main()
