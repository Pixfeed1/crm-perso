# seo_worker/pagespeed.py
#
# Core Web Vitals / PageSpeed Insights pour les sites SEO.
#
# Pourquoi ce module : la vitesse est un facteur de classement, et jusqu'ici le CRM ne la
# mesurait que pour les contrats de maintenance (saisie manuelle). L'API PageSpeed
# Insights est gratuite ; elle renvoie en un appel :
#   - les donnees TERRAIN CrUX (utilisateurs reels, p75 sur 28 jours) : c'est ce que
#     Google utilise pour classer. Absentes sur les pages a faible trafic.
#   - une mesure LABO Lighthouse (score 0..100, LCP, CLS, TBT...) : reproductible,
#     disponible pour toute page, et la liste des opportunites d'optimisation.
#
# Contraintes : un appel dure 10 a 40 s (Lighthouse tourne chez Google), et le quota
# sans cle est bas. On ne mesure donc pas tout le site : l'accueil + les pages qui
# comptent (les plus vues dans Search Console), en mobile et desktop.

import os
import time

import requests

import config

ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"


def api_key():
    # Une cle Google Cloud avec l'API « PageSpeed Insights » activee. La cle CrUX (deja
    # utilisee cote backlinks) convient si cette API est activee sur le meme projet.
    return (os.getenv("PAGESPEED_API_KEY") or os.getenv("CRUX_API_KEY") or "").strip()


def select_urls(conn, site_id, home_url):
    """Plan de mesure d'un run, en ROTATION : le site entier est couvert en quelques
    semaines sans jamais bloquer le worker des heures.

    Renvoie une liste de (url, [strategies]) :
      1. l'accueil + les PSI_TOP_PAGES pages les plus vues (impressions GSC), a CHAQUE run,
         en mobile ET desktop : ce sont elles qui portent les donnees terrain et le
         classement, on veut leur tendance jour apres jour ;
      2. un lot de PSI_ROTATION_PAGES pages : d'abord celles JAMAIS mesurees, puis les plus
         anciennement mesurees. Mobile seul : c'est l'index de Google, et le desktop
         doublerait la duree pour un gabarit WordPress identique d'une page a l'autre.
    Les pages en noindex sont ignorees (elles ne se classent pas)."""
    cur = conn.cursor()
    top_n = max(0, int(config.PSI_TOP_PAGES))
    rot_n = max(0, int(config.PSI_ROTATION_PAGES))
    cur.execute(
        """SELECT url FROM seo_pages
            WHERE site_id = %s AND url <> %s
              AND COALESCE((seo_meta->>'noindex')::boolean, false) = false
            ORDER BY COALESCE(gsc_impressions, 0) DESC, COALESCE(internal_pagerank, 0) DESC, url
            LIMIT %s""",
        (site_id, home_url, top_n),
    )
    top = [home_url] + [r[0] for r in cur.fetchall()]
    plan = [(u, list(config.PSI_STRATEGIES)) for u in top]
    if rot_n:
        cur.execute(
            """SELECT p.url
                 FROM seo_pages p
                 LEFT JOIN (SELECT url, MAX(checked_at) AS last_at FROM seo_pagespeed
                             WHERE site_id = %s GROUP BY url) m ON m.url = p.url
                WHERE p.site_id = %s AND NOT (p.url = ANY(%s))
                  AND COALESCE((p.seo_meta->>'noindex')::boolean, false) = false
                ORDER BY m.last_at ASC NULLS FIRST, COALESCE(p.gsc_impressions, 0) DESC, p.url
                LIMIT %s""",
            (site_id, site_id, top, rot_n),
        )
        plan += [(r[0], ["mobile"]) for r in cur.fetchall()]
    return plan


def coverage(conn, site_id):
    """Pages mesurees au moins une fois / pages mesurables (hors noindex)."""
    cur = conn.cursor()
    cur.execute(
        """SELECT COUNT(*) FILTER (WHERE m.url IS NOT NULL), COUNT(*)
             FROM seo_pages p
             LEFT JOIN (SELECT DISTINCT url FROM seo_pagespeed WHERE site_id = %s) m ON m.url = p.url
            WHERE p.site_id = %s AND COALESCE((p.seo_meta->>'noindex')::boolean, false) = false""",
        (site_id, site_id),
    )
    return cur.fetchone()


def _num(audits, key):
    a = audits.get(key) or {}
    v = a.get("numericValue")
    return None if v is None else float(v)


def _ms(v):
    return None if v is None else int(round(v))


def _opportunities(audits, top=8):
    """Audits Lighthouse avec un gain estime. Deux formats selon la version de
    Lighthouse : details.overallSavingsMs (<= 11) ou metricSavings (>= 12)."""
    out = []
    for aid, a in (audits or {}).items():
        if not isinstance(a, dict):
            continue
        score = a.get("score")
        if score is None or score >= 0.9:
            continue
        details = a.get("details") or {}
        savings = details.get("overallSavingsMs")
        if savings is None and isinstance(a.get("metricSavings"), dict):
            savings = sum(float(v or 0) for v in a["metricSavings"].values())
        if not savings or savings <= 0:
            continue
        out.append({"id": aid, "title": a.get("title"), "savings_ms": int(round(savings))})
    out.sort(key=lambda o: -o["savings_ms"])
    return out[:top]


def parse(data):
    """Extrait ce que l'on stocke de la reponse PSI."""
    lr = data.get("lighthouseResult") or {}
    audits = lr.get("audits") or {}
    perf = ((lr.get("categories") or {}).get("performance") or {}).get("score")
    row = {
        "perf_score": None if perf is None else int(round(float(perf) * 100)),
        "lcp_ms": _ms(_num(audits, "largest-contentful-paint")),
        "cls": _num(audits, "cumulative-layout-shift"),
        "tbt_ms": _ms(_num(audits, "total-blocking-time")),
        "fcp_ms": _ms(_num(audits, "first-contentful-paint")),
        "si_ms": _ms(_num(audits, "speed-index")),
        "ttfb_ms": _ms(_num(audits, "server-response-time")),
        "opportunities": _opportunities(audits),
        "field_lcp_ms": None, "field_inp_ms": None, "field_cls": None, "field_ttfb_ms": None,
        "field_category": None, "origin_category": None,
    }
    # Terrain : loadingExperience = la page ; si Google n'a pas assez de trafic pour la
    # page, il renvoie l'origine a la place (origin_fallback) -> on ne l'attribue pas a la page.
    le = data.get("loadingExperience") or {}
    if le.get("metrics") and not le.get("origin_fallback"):
        m = le["metrics"]
        pct = lambda k: (m.get(k) or {}).get("percentile")
        row["field_lcp_ms"] = pct("LARGEST_CONTENTFUL_PAINT_MS")
        row["field_inp_ms"] = pct("INTERACTION_TO_NEXT_PAINT")
        cls = pct("CUMULATIVE_LAYOUT_SHIFT_SCORE")
        row["field_cls"] = None if cls is None else float(cls) / 100.0  # CrUX renvoie x100
        row["field_ttfb_ms"] = pct("EXPERIMENTAL_TIME_TO_FIRST_BYTE")
        row["field_category"] = le.get("overall_category")
    ole = data.get("originLoadingExperience") or {}
    row["origin_category"] = ole.get("overall_category") or (le.get("overall_category") if le.get("origin_fallback") else None)
    return row


def measure(url, strategy):
    """Un appel PSI. Renvoie (row|None, error|None, quota_hit)."""
    params = {"url": url, "strategy": strategy, "category": "performance", "locale": "fr"}
    key = api_key()
    if key:
        params["key"] = key
    try:
        r = requests.get(ENDPOINT, params=params, timeout=config.PSI_TIMEOUT,
                         headers={"User-Agent": config.USER_AGENT})
    except requests.exceptions.RequestException as e:
        return None, f"requete : {str(e)[:160]}", False
    if r.status_code == 429:
        return None, "quota PageSpeed atteint", True
    if r.status_code != 200:
        msg = ""
        try:
            msg = ((r.json().get("error") or {}).get("message") or "")[:160]
        except Exception:
            pass
        return None, f"HTTP {r.status_code} {msg}".strip(), False
    try:
        return parse(r.json()), None, False
    except Exception as e:
        return None, f"reponse illisible : {str(e)[:160]}", False


def _save(cur, site_id, url, strategy, row, error):
    import json
    row = row or {}
    cur.execute(
        """INSERT INTO seo_pagespeed
             (site_id, url, strategy, perf_score, lcp_ms, cls, tbt_ms, fcp_ms, si_ms, ttfb_ms,
              field_lcp_ms, field_inp_ms, field_cls, field_ttfb_ms, field_category, origin_category,
              opportunities, error, checked_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb,%s,NOW())""",
        (site_id, url, strategy, row.get("perf_score"), row.get("lcp_ms"), row.get("cls"),
         row.get("tbt_ms"), row.get("fcp_ms"), row.get("si_ms"), row.get("ttfb_ms"),
         row.get("field_lcp_ms"), row.get("field_inp_ms"), row.get("field_cls"), row.get("field_ttfb_ms"),
         row.get("field_category"), row.get("origin_category"),
         json.dumps(row.get("opportunities") or []), error),
    )


def _prune(cur, site_id, keep):
    """Garde les N dernieres mesures par (url, strategy) : l'historique sert aux tendances,
    pas a conserver chaque run pour toujours."""
    cur.execute(
        """DELETE FROM seo_pagespeed WHERE id IN (
             SELECT id FROM (
               SELECT id, ROW_NUMBER() OVER (PARTITION BY url, strategy ORDER BY checked_at DESC, id DESC) AS rn
                 FROM seo_pagespeed WHERE site_id = %s
             ) t WHERE t.rn > %s
           )""",
        (site_id, keep),
    )


def run(conn, site, cancel_check=None, job_id=None):
    """Job 'pagespeed' : pages cles en mobile+desktop, lot de rotation en mobile (voir select_urls).
    Renvoie True / 'cancelled' / False. Chaque mesure est commitee : un arret en cours de
    route conserve ce qui a ete fait."""
    cur = conn.cursor()
    site_id = site["id"]
    home_url = site["wp_base_url"].rstrip("/")
    plan = select_urls(conn, site_id, home_url)
    total = sum(len(strats) for _, strats in plan)
    if job_id is not None:
        cur.execute("UPDATE seo_jobs SET progress_total = %s, progress_current = 0 WHERE id = %s", (total, job_id))
        conn.commit()
    n_top = sum(1 for _, st in plan if len(st) > 1)
    print(f"\n=== PageSpeed {site['domain']} : {n_top} pages cles (mobile+desktop) + {len(plan) - n_top} en rotation (mobile), "
          f"{total} mesures ({'cle API' if api_key() else 'SANS cle : quota anonyme'}) ===")

    done = ok = 0
    quota = False
    last_err = None
    for url, strategies in plan:
        for strategy in strategies:
            row, err, quota_hit = measure(url, strategy)
            if err:
                last_err = err
            if quota_hit:
                quota = True
                print(f"  [PSI] quota atteint apres {done} mesures — arret, le reste au prochain run.")
                break
            _save(cur, site_id, url, strategy, row, err)
            done += 1
            if err:
                print(f"  [PSI] {strategy:7} {url} : {err}")
            else:
                ok += 1
                print(f"  [PSI] {strategy:7} {url} : {row['perf_score']}/100 "
                      f"LCP {row['lcp_ms']} ms  terrain={row['field_category'] or '-'}")
            if job_id is not None:
                cur.execute("UPDATE seo_jobs SET progress_current = %s WHERE id = %s", (done, job_id))
            conn.commit()
            if cancel_check and cancel_check():
                conn.commit()
                print("  [ANNULE] pendant PageSpeed")
                return "cancelled"
            time.sleep(config.PSI_DELAY)
        if quota:
            break

    _prune(cur, site_id, config.PSI_HISTORY_KEEP)
    if job_id is not None and quota:
        cur.execute(
            "UPDATE seo_jobs SET error = %s WHERE id = %s",
            (f"Quota PageSpeed atteint apres {done} mesures ({'cle API' if api_key() else 'ajouter PAGESPEED_API_KEY dans backend/.env'}).", job_id),
        )
    elif job_id is not None and done > 0 and ok == 0 and last_err:
        # Toutes les mesures ont echoue pour la meme raison (cle refusee, API non activee...) :
        # la dire, plutot qu'un « echec » generique.
        cur.execute("UPDATE seo_jobs SET error = %s WHERE id = %s",
                    (f"Toutes les mesures ont échoué : {last_err} (vérifier PAGESPEED_API_KEY et l'activation de l'API PageSpeed Insights).", job_id))
    conn.commit()
    covered, total_pages = coverage(conn, site_id)
    print(f"  OK PageSpeed {site['domain']} : {ok}/{done} mesures reussies — couverture {covered}/{total_pages} pages")
    # Aucune mesure aboutie a cause du quota : echec franc (le message du job dit quoi faire).
    # Un site sans page a mesurer n'est pas un echec.
    if quota and ok == 0:
        return False
    return ok > 0 or done == 0
