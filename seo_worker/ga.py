# seo_worker/ga.py
#
# Google Analytics 4 (API Data), par site.
#
# Pourquoi : Search Console ne voit que le clic depuis Google. Analytics donne la visite
# reelle, toutes sources (organique, direct, reseaux, referents), et ce que le visiteur en
# fait (engagement, rebond). Croise avec les clics GSC page par page, cela dit si une page
# bien classee retient ou fait fuir.
#
# Par site : seo_sites.ga_property_id (identifiant numerique de la propriete GA4, saisi dans
# la fiche du site). Un site sans propriete est simplement ignore. Une seule connexion
# Google sert tous les sites, la meme que Search Console, avec le scope Analytics en plus.
#
# Ecrit seo_ga_daily (date x page), seo_ga_channels_daily (date x canal) et le cache 28 j
# de seo_pages. Incremental : du lendemain de la derniere date connue jusqu'a hier.

from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

import config
import gsc

PAGE_METRICS = ["sessions", "totalUsers", "screenPageViews", "engagementRate",
                "userEngagementDuration", "bounceRate"]
CHANNEL_METRICS = ["sessions", "totalUsers", "engagedSessions"]
ROW_LIMIT = 100000  # maximum accepte par runReport


def _run_report(creds, property_id, body):
    """Itere toutes les lignes d'un runReport (pagination par offset)."""
    svc = gsc._service(creds, "analyticsdata", "v1beta")
    offset = 0
    out = []
    while True:
        body = dict(body, limit=ROW_LIMIT, offset=offset)
        res = gsc._execute_with_retry(svc.properties().runReport(property=f"properties/{property_id}", body=body))
        rows = res.get("rows") or []
        for r in rows:
            dims = [d.get("value") for d in r.get("dimensionValues", [])]
            mets = [m.get("value") for m in r.get("metricValues", [])]
            out.append((dims, mets))
        total = int(res.get("rowCount") or 0)
        offset += len(rows)
        if not rows or offset >= total:
            break
    return out


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _i(v):
    return int(round(_f(v)))


def _date(s):
    # GA4 renvoie AAAAMMJJ
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"


def normalize_path(p):
    """Chemin GA -> forme comparable a nos URLs : sans query string, sans slash final
    (sauf la racine), pour retrouver la page dans seo_pages."""
    if not p:
        return "/"
    p = p.split("?", 1)[0].split("#", 1)[0]
    if len(p) > 1:
        p = p.rstrip("/")
    return p or "/"


def _fail(cur, conn, job_id, msg):
    print(f"[GA] {msg}")
    if job_id is not None:
        cur.execute("UPDATE seo_jobs SET error = %s WHERE id = %s", (msg[:500], job_id))
        conn.commit()
    return False


def sync_site(conn, site, job_id=None):
    """Job 'ga_sync'. Renvoie True / False."""
    cur = conn.cursor()
    site_id = site["id"]
    domain = site["domain"]
    prop = (site.get("ga_property_id") or "").strip()
    if not prop:
        return _fail(cur, conn, job_id, f"Aucune propriété Google Analytics pour {domain} : la renseigner dans la fiche du site (roue crantée).")
    if not gsc.has_analytics_scope(conn):
        return _fail(cur, conn, job_id, "Le consentement Google ne couvre pas Analytics : relancer gsc_auth.py (une fois), puis réessayer.")
    try:
        creds = gsc.load_credentials(conn)
    except Exception as e:
        return _fail(cur, conn, job_id, f"OAuth Google : échec du rafraîchissement ({str(e)[:200]})")
    if creds is None:
        return _fail(cur, conn, job_id, "OAuth Google non configuré (lancer gsc_auth.py)")

    today = datetime.now(timezone.utc).date()
    end_d = today - timedelta(days=config.GA_LAG_DAYS)
    cur.execute("SELECT MAX(date) FROM seo_ga_daily WHERE site_id = %s", (site_id,))
    max_d = cur.fetchone()[0]
    start_d = (max_d + timedelta(days=1)) if max_d else (end_d - timedelta(days=config.GA_INITIAL_DAYS))
    if start_d > end_d:
        start_d = end_d  # rien de nouveau : on rafraichit la derniere journee (GA la corrige encore un peu)
    rng = [{"startDate": start_d.isoformat(), "endDate": end_d.isoformat()}]
    print(f"\n=== GA {domain} (propriété {prop}) — {start_d} -> {end_d} ===")

    try:
        # 1) Pages : toutes sources.
        pages = _run_report(creds, prop, {
            "dateRanges": rng,
            "dimensions": [{"name": "date"}, {"name": "pagePath"}],
            "metrics": [{"name": m} for m in PAGE_METRICS],
        })
        # 2) Pages : organique seul (filtre canal), pour la colonne organic_sessions.
        organic = _run_report(creds, prop, {
            "dateRanges": rng,
            "dimensions": [{"name": "date"}, {"name": "pagePath"}],
            "metrics": [{"name": "sessions"}],
            "dimensionFilter": {"filter": {"fieldName": "sessionDefaultChannelGroup",
                                           "stringFilter": {"matchType": "EXACT", "value": "Organic Search"}}},
        })
        # 3) Canaux.
        channels = _run_report(creds, prop, {
            "dateRanges": rng,
            "dimensions": [{"name": "date"}, {"name": "sessionDefaultChannelGroup"}],
            "metrics": [{"name": m} for m in CHANNEL_METRICS],
        })
    except Exception as e:
        msg = str(e)
        if "403" in msg or "PERMISSION_DENIED" in msg:
            hint = " (API « Google Analytics Data » non activée sur le projet Google Cloud, ou compte sans accès à cette propriété)"
        elif "404" in msg or "NOT_FOUND" in msg:
            hint = " (identifiant de propriété GA4 inconnu : vérifier l'ID numérique dans la fiche du site)"
        else:
            hint = ""
        return _fail(cur, conn, job_id, f"Analytics {domain} : {msg[:220]}{hint}")

    # Agregation par (date, chemin normalise) : plusieurs pagePath GA (query strings,
    # slash final) tombent sur la meme page.
    agg = {}
    for dims, mets in pages:
        k = (_date(dims[0]), normalize_path(dims[1]))
        a = agg.setdefault(k, {"sessions": 0, "users": 0, "pv": 0, "eng_w": 0.0, "eng_s": 0.0, "bounce_w": 0.0, "organic": 0})
        sess = _i(mets[0])
        a["sessions"] += sess
        a["users"] += _i(mets[1])
        a["pv"] += _i(mets[2])
        a["eng_w"] += _f(mets[3]) * sess       # taux pondere par sessions
        a["eng_s"] += _f(mets[4])
        a["bounce_w"] += _f(mets[5]) * sess
    for dims, mets in organic:
        k = (_date(dims[0]), normalize_path(dims[1]))
        a = agg.setdefault(k, {"sessions": 0, "users": 0, "pv": 0, "eng_w": 0.0, "eng_s": 0.0, "bounce_w": 0.0, "organic": 0})
        a["organic"] += _i(mets[0])

    n = 0
    for (d, path), a in agg.items():
        sess = a["sessions"]
        cur.execute(
            """INSERT INTO seo_ga_daily (site_id, date, page_path, sessions, organic_sessions, users, pageviews,
                                         engagement_rate, engagement_seconds, bounce_rate)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (site_id, date, page_path) DO UPDATE
                 SET sessions = EXCLUDED.sessions, organic_sessions = EXCLUDED.organic_sessions,
                     users = EXCLUDED.users, pageviews = EXCLUDED.pageviews,
                     engagement_rate = EXCLUDED.engagement_rate, engagement_seconds = EXCLUDED.engagement_seconds,
                     bounce_rate = EXCLUDED.bounce_rate""",
            (site_id, d, path, sess, a["organic"], a["users"], a["pv"],
             (a["eng_w"] / sess) if sess else None, a["eng_s"], (a["bounce_w"] / sess) if sess else None),
        )
        n += 1
        if n % config.COMMIT_BATCH == 0:
            conn.commit()
    conn.commit()

    for dims, mets in channels:
        cur.execute(
            """INSERT INTO seo_ga_channels_daily (site_id, date, channel, sessions, users, engaged_sessions)
               VALUES (%s,%s,%s,%s,%s,%s)
               ON CONFLICT (site_id, date, channel) DO UPDATE
                 SET sessions = EXCLUDED.sessions, users = EXCLUDED.users, engaged_sessions = EXCLUDED.engaged_sessions""",
            (site_id, _date(dims[0]), dims[1] or "(non défini)", _i(mets[0]), _i(mets[1]), _i(mets[2])),
        )
    conn.commit()

    # Cache 28 j sur seo_pages : jointure chemin GA <-> URL crawlee.
    base = (site.get("wp_base_url") or f"https://{domain}").rstrip("/")
    d28 = (end_d - timedelta(days=28)).isoformat()
    cur.execute(
        """SELECT page_path, SUM(sessions),
                  CASE WHEN SUM(sessions) > 0 THEN SUM(engagement_rate * sessions) / SUM(sessions) END
             FROM seo_ga_daily WHERE site_id = %s AND date > %s GROUP BY page_path""",
        (site_id, d28),
    )
    cache = {row[0]: (int(row[1] or 0), row[2]) for row in cur.fetchall()}
    cur.execute("SELECT id, url FROM seo_pages WHERE site_id = %s", (site_id,))
    updated = 0
    for pid, url in cur.fetchall():
        path = normalize_path(urlparse(url).path or "/")
        c = cache.get(path)
        cur.execute(
            "UPDATE seo_pages SET ga_sessions_28d = %s, ga_engagement_28d = %s, ga_synced_at = NOW() WHERE id = %s",
            (c[0] if c else 0, c[1] if c else None, pid),
        )
        updated += 1
        if updated % config.COMMIT_BATCH == 0:
            conn.commit()
    conn.commit()
    print(f"  OK GA {domain} : {n} lignes page/jour, {len(channels)} lignes canal/jour, {updated} pages mises en cache")
    return True
