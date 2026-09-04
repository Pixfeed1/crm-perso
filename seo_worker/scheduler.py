# seo_worker/scheduler.py
#
# Planification quotidienne, integree au worker.
#
# Pourquoi : sans elle, rien ne tourne sans un clic dans l'UI. Les positions Search
# Console, les verdicts d'indexation, la rotation PageSpeed ne se rafraichissent que
# quand quelqu'un y pense. Or ces donnees ne valent que par leur regularite.
#
# Comment : chaque nuit, a SCHEDULE_HOUR (heure de Paris), le worker met dans la file
# seo_jobs, POUR CHAQUE SITE et DANS L'ORDRE, la meme chaine que l'on lancerait a la
# main : crawl (incremental, complet le jour SCHEDULE_FULL_WEEKDAY), synchro Search
# Console (positions + inspection), mesure de vitesse (rotation). Il passe par la file
# et non par des appels directs pour garder les memes garde-fous que l'UI : un seul job
# actif par site (index unique), annulation possible, progression et erreurs visibles
# dans l'ecran SEO. Les jobs planifies sont marques source='schedule'.
#
# Robuste aux redemarrages : l'etat vit dans seo_jobs, pas en memoire. Un worker
# arrete a 4 h rattrape la chaine des qu'il revient, dans la meme journee. Un job deja
# lance a la main dans les dernieres heures n'est pas relance (quota Google).

from datetime import datetime, timedelta, timezone

import config

try:
    from zoneinfo import ZoneInfo
    _TZ = ZoneInfo(config.SCHEDULE_TZ)
except Exception:  # Python < 3.9 ou base tzdata absente : heure de Paris approximee
    _TZ = timezone(timedelta(hours=1))

# Ne pas relancer un job du meme type termine avec succes il y a moins de N heures :
# une synchro GSC lancee a la main a 22 h rend celle de 4 h inutile (et couteuse en quota).
RECENT_HOURS = 20

# Ne pas verifier a chaque tour de boucle (10 s) : une fois par minute suffit.
_last_tick = None


def now_local():
    return datetime.now(_TZ)


def _sites(cur):
    cur.execute("SELECT id, domain FROM seo_sites ORDER BY id")
    return cur.fetchall()


def _gsc_connected(cur):
    cur.execute("SELECT 1 FROM seo_oauth_tokens WHERE provider = 'google' LIMIT 1")
    return cur.fetchone() is not None


def plan_for(day, gsc_connected, pagespeed_key):
    """Chaine du jour, dans l'ordre d'execution. Le crawl d'abord : il cree les pages que
    la synchro enrichit et que la mesure de vitesse selectionne."""
    steps = []
    full = config.SCHEDULE_FULL_WEEKDAY >= 0 and day.weekday() == config.SCHEDULE_FULL_WEEKDAY
    steps.append("crawl_full" if full else "crawl_incremental")
    if gsc_connected:
        steps.append("gsc_sync")
    if pagespeed_key:
        steps.append("pagespeed")
    return steps


def _state(cur, site_id, job_type, day_start_utc):
    """Etat d'une etape pour aujourd'hui :
       'done'    : un job de ce type a ete lance aujourd'hui (planifie) ou a reussi
                   recemment (manuel) -> etape acquise ;
       'active'  : un job de ce type est en cours -> attendre ;
       None      : rien -> a lancer."""
    # Les crawls se remplacent : un complet vaut un incremental (et inversement pour la
    # regle "deja fait aujourd'hui"), sinon un crawl manuel serait suivi d'un second.
    types = ("crawl_full", "crawl_incremental") if job_type.startswith("crawl") else (job_type,)
    cur.execute(
        """SELECT status, source, created_at, finished_at FROM seo_jobs
            WHERE site_id = %s AND job_type = ANY(%s)
              AND (created_at >= %s OR (status = 'done' AND finished_at >= NOW() - (%s * INTERVAL '1 hour')))
            ORDER BY created_at DESC""",
        (site_id, list(types), day_start_utc, RECENT_HOURS),
    )
    rows = cur.fetchall()
    if not rows:
        return None
    for status, source, created_at, finished_at in rows:
        if status in ("pending", "running", "cancel_requested"):
            return "active"
    # Un job planifie aujourd'hui, quel que soit son sort (done / failed / cancelled), compte
    # comme tente : on ne boucle pas sur un echec. Un job manuel ne compte que s'il a reussi.
    for status, source, created_at, finished_at in rows:
        if source == "schedule" and created_at >= day_start_utc:
            return "done"
        if status == "done":
            return "done"
    return None


def _site_busy(cur, site_id):
    cur.execute(
        "SELECT 1 FROM seo_jobs WHERE site_id = %s AND status IN ('pending','running','cancel_requested') LIMIT 1",
        (site_id,),
    )
    return cur.fetchone() is not None


def _enqueue(cur, site_id, job_type, day):
    cur.execute(
        """INSERT INTO seo_jobs (site_id, job_type, status, source, scheduled_for)
           VALUES (%s, %s, 'pending', 'schedule', %s) RETURNING id""",
        (site_id, job_type, day),
    )
    return cur.fetchone()[0]


def tick(conn, pagespeed_key_present):
    """A appeler a chaque tour de la boucle --serve. Ne fait rien avant l'heure prevue,
    puis fait avancer la chaine de chaque site d'un cran a la fois (un job actif max)."""
    global _last_tick
    if not config.SCHEDULE_ENABLED:
        return
    now = now_local()
    if _last_tick and (now - _last_tick) < timedelta(seconds=60):
        return
    _last_tick = now
    if now.hour < config.SCHEDULE_HOUR:
        return
    day = now.date()
    # Debut de la journee locale, converti en UTC naif : created_at est un TIMESTAMP sans
    # fuseau ecrit par NOW() cote base (base en UTC sur serveur2).
    day_start_local = datetime(day.year, day.month, day.day, tzinfo=_TZ)
    day_start_utc = day_start_local.astimezone(timezone.utc).replace(tzinfo=None)

    cur = conn.cursor()
    try:
        gsc = _gsc_connected(cur)
        steps = plan_for(day, gsc, pagespeed_key_present)
        for site_id, domain in _sites(cur):
            if _site_busy(cur, site_id):
                continue
            for job_type in steps:
                st = _state(cur, site_id, job_type, day_start_utc)
                if st == "done":
                    continue
                if st == "active":
                    break
                try:
                    jid = _enqueue(cur, site_id, job_type, day)
                    conn.commit()
                    print(f"[Planif] {domain} : {job_type} mis en file (job #{jid}, {now.strftime('%H:%M')} {config.SCHEDULE_TZ})")
                except Exception as e:
                    conn.rollback()
                    # Index unique "1 job actif par site" : quelqu'un vient de lancer un job
                    # a la main entre nos deux requetes. On reessaiera au prochain tick.
                    print(f"[Planif] {domain} : {job_type} non mis en file ({str(e)[:120]})")
                break  # un cran par site et par tick : le job suivant attendra la fin de celui-ci
    except Exception as e:
        conn.rollback()
        print(f"[Planif] erreur : {str(e)[:200]}")
