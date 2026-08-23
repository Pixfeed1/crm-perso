# seo_worker/indexation.py
#
# Verdict d'indexation Google page par page, via l'API URL Inspection.
#
# Pourquoi ce module : le CRM déduisait l'indexation d'un compteur peu fiable, et ne
# voyait pas du tout les 404 connues de Google (anciennes URLs mémorisées, liens internes
# cassés depuis corrigés). L'API donne le verdict réel, plus l'origine de découverte de
# chaque URL — donc quel article contient le lien cassé.
#
# LA contrainte : 2 000 appels/jour/propriété, UNE url par appel. Sur un site de 1 157
# pages on pourrait tout inspecter en une nuit, mais le quota est partagé avec les
# inspections ponctuelles déclenchées ailleurs dans le worker. On garde donc une marge,
# et on priorise : toutes les pages n'ont pas le même intérêt à être réinspectées.

import json

import config
import gsc

# Marge sous le plafond Google : les inspections ponctuelles (run.py) puisent dans le
# même quota, et un 429 en cours de route ferait perdre le lot en train d'être traité.
SAFETY_MARGIN = 100


def _cap():
    return max(1, int(getattr(config, "GSC_INSPECT_DAILY_CAP", 2000)) - SAFETY_MARGIN)


def select_urls_to_inspect(conn, site_id, limit):
    """URLs à inspecter, par ordre de priorité décroissante.

    Le quota impose de choisir. L'ordre suit la valeur d'information :
      1. pages SANS impression GSC        -> candidates naturelles à la non-indexation
      2. pages modifiées depuis 7 jours   -> vérifier que Google a bien repris la modif
      3. pages déjà connues non indexées  -> détecter une réindexation
      4. le reste, les plus anciennement inspectées d'abord (rotation)

    Le TTL évite de regarder deux fois la même page dans la même quinzaine, sauf pour
    la priorité 2 (une page qu'on vient de modifier mérite une vérification immédiate).
    """
    ttl = int(getattr(config, "GSC_INSPECT_TTL_DAYS", 14))
    sql = """
        WITH impressions AS (
            SELECT page_url, SUM(impressions) AS impr
              FROM seo_gsc_daily
             WHERE site_id = %(site)s
             GROUP BY page_url
        )
        SELECT p.url,
               CASE
                 WHEN COALESCE(i.impr, 0) = 0                                    THEN 1
                 WHEN p.wp_modified_at > NOW() - INTERVAL '7 days'                THEN 2
                 WHEN s.verdict IS NOT NULL AND s.verdict <> 'PASS'               THEN 3
                 ELSE 4
               END AS priorite
          FROM seo_pages p
          LEFT JOIN impressions i      ON i.page_url = p.url
          LEFT JOIN gsc_index_status s ON s.site_id = p.site_id AND s.url = p.url
         WHERE p.site_id = %(site)s
           AND (
                 s.checked_at IS NULL
                 OR s.checked_at < NOW() - (%(ttl)s || ' days')::interval
                 OR p.wp_modified_at > s.checked_at      -- modifiée depuis la dernière inspection
               )
         ORDER BY priorite ASC, s.checked_at ASC NULLS FIRST, p.url
         LIMIT %(lim)s
    """
    with conn.cursor() as cur:
        cur.execute(sql, {"site": site_id, "ttl": ttl, "lim": limit})
        return [(r[0], r[1]) for r in cur.fetchall()]


def _parse(raw):
    """Extrait les champs utiles de la réponse d'inspection (tolérant aux absences)."""
    res = ((raw or {}).get("inspectionResult") or {}).get("indexStatusResult") or {}
    refs = res.get("referringUrls") or []
    return {
        "verdict": res.get("verdict"),
        "coverage_state": res.get("coverageState"),
        "robots_txt_state": res.get("robotsTxtState"),
        "indexing_state": res.get("indexingState"),
        "page_fetch_state": res.get("pageFetchState"),
        "last_crawl_time": res.get("lastCrawlTime"),
        "google_canonical": res.get("googleCanonical"),
        "user_canonical": res.get("userCanonical"),
        "referring_urls": refs if isinstance(refs, list) else [],
    }


def _save(conn, site_id, url, data, raw):
    """Écrit l'état courant, et journalise le changement s'il y en a un.

    L'historique est indispensable : l'état courant étant écrasé à chaque inspection,
    sans trace on ne saurait jamais qu'une page a été désindexée.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT verdict, coverage_state FROM gsc_index_status WHERE site_id = %s AND url = %s",
            (site_id, url),
        )
        row = cur.fetchone()
        old_verdict, old_coverage = (row[0], row[1]) if row else (None, None)

        cur.execute(
            """INSERT INTO gsc_index_status
                 (site_id, url, verdict, coverage_state, robots_txt_state, indexing_state,
                  page_fetch_state, last_crawl_time, google_canonical, user_canonical,
                  referring_urls, raw, checked_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
               ON CONFLICT (site_id, url) DO UPDATE SET
                 verdict = EXCLUDED.verdict,
                 coverage_state = EXCLUDED.coverage_state,
                 robots_txt_state = EXCLUDED.robots_txt_state,
                 indexing_state = EXCLUDED.indexing_state,
                 page_fetch_state = EXCLUDED.page_fetch_state,
                 last_crawl_time = EXCLUDED.last_crawl_time,
                 google_canonical = EXCLUDED.google_canonical,
                 user_canonical = EXCLUDED.user_canonical,
                 referring_urls = EXCLUDED.referring_urls,
                 raw = EXCLUDED.raw,
                 checked_at = NOW()""",
            (
                site_id, url, data["verdict"], data["coverage_state"],
                data["robots_txt_state"], data["indexing_state"], data["page_fetch_state"],
                data["last_crawl_time"], data["google_canonical"], data["user_canonical"],
                json.dumps(data["referring_urls"]), json.dumps(raw or {}),
            ),
        )

        changed = (old_verdict != data["verdict"]) or (old_coverage != data["coverage_state"])
        # Une première inspection n'est pas un « changement » : on ne journalise que les
        # transitions réelles, sinon l'historique serait noyé au premier passage.
        if changed and row is not None:
            cur.execute(
                """INSERT INTO gsc_index_history
                     (site_id, url, old_verdict, new_verdict, old_coverage, new_coverage)
                   VALUES (%s,%s,%s,%s,%s,%s)""",
                (site_id, url, old_verdict, data["verdict"], old_coverage, data["coverage_state"]),
            )
        return changed and row is not None


def run_inspection(conn, creds, site_id, gsc_property, cap=None):
    """Inspecte un lot d'URLs pour un site. Renvoie un résumé chiffré.

    S'arrête proprement sur QuotaExceeded : les URLs déjà traitées sont conservées, la
    rotation reprendra où elle en est au prochain passage (checked_at fait foi).
    """
    cap = cap or _cap()
    cibles = select_urls_to_inspect(conn, site_id, cap)
    if not cibles:
        print(f"[Index] site {site_id} : rien à inspecter (tout est à jour)")
        return {"inspectees": 0, "changements": 0, "quota_atteint": False}

    print(f"[Index] site {site_id} : {len(cibles)} URL(s) à inspecter (plafond {cap})")
    inspectees = changements = erreurs = 0
    quota = False

    for url, priorite in cibles:
        try:
            _cov, raw = gsc.inspect_url(creds, gsc_property, url)
        except gsc.QuotaExceeded:
            # Le quota se réinitialise chaque jour : inutile d'insister maintenant.
            print(f"[Index] quota Google atteint après {inspectees} inspection(s), arrêt propre")
            quota = True
            break
        except Exception as e:
            erreurs += 1
            print(f"[Index] {url} : {e}")
            if erreurs > 25:
                print("[Index] trop d'erreurs consécutives, arrêt")
                break
            continue

        if _save(conn, site_id, url, _parse(raw), raw):
            changements += 1
        inspectees += 1
        # Commit régulier : une interruption ne doit pas faire perdre le lot entier.
        if inspectees % int(getattr(config, "COMMIT_BATCH", 25)) == 0:
            conn.commit()
            print(f"[Index]   … {inspectees}/{len(cibles)}")

    conn.commit()
    print(f"[Index] site {site_id} : {inspectees} inspectée(s), {changements} changement(s), {erreurs} erreur(s)")
    return {"inspectees": inspectees, "changements": changements,
            "erreurs": erreurs, "quota_atteint": quota}
