"""Couche Google Search Console du worker SEO (étape 2).

Lit le refresh_token stocké en base (table seo_oauth_tokens, écrite une seule fois par
gsc_auth.py) et expose les appels API utilisés par run.py :
  - Search Analytics (clics/impressions/position par date+page+requête) ;
  - URL Inspection (statut d'indexation par page).

SÉCURITÉ : le refresh_token et le client_secret vivent en clair en base (même niveau que
backend/.env). On ne stocke JAMAIS l'access_token : il est rafraîchi en mémoire à chaque run.
L'app OAuth étant publiée en Production, le refresh_token n'expire pas (aucune logique 7 jours).
"""
import time

import config

try:
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    _GOOGLE_OK = True
except Exception:  # dépendances Google non installées
    _GOOGLE_OK = False
    HttpError = Exception


class QuotaExceeded(Exception):
    """Quota URL Inspection Google épuisé (HTTP 429) — reprise le lendemain."""


def google_available():
    return _GOOGLE_OK


def strip_fragment(url):
    """Retire le fragment (#ancre) d'une URL. Une URL d'inspection ne doit JAMAIS en contenir."""
    if not url:
        return url
    return url.split("#", 1)[0]


def load_token_row(conn):
    """Renvoie la ligne OAuth Google (la plus récente) ou None si non configuré."""
    cur = conn.cursor()
    cur.execute(
        """SELECT account_email, scope, client_id, client_secret, refresh_token, token_uri
           FROM seo_oauth_tokens WHERE provider = 'google'
           ORDER BY updated_at DESC LIMIT 1"""
    )
    r = cur.fetchone()
    if not r:
        return None
    return {
        "account_email": r[0], "scope": r[1], "client_id": r[2],
        "client_secret": r[3], "refresh_token": r[4], "token_uri": r[5],
    }


def has_analytics_scope(conn):
    """True si le consentement Google stocke couvre Analytics (sinon : relancer gsc_auth.py)."""
    row = load_token_row(conn)
    return bool(row and config.GA_SCOPE in (row.get("scope") or ""))


def load_credentials(conn):
    """Construit des Credentials Google rafraîchissables depuis la base. None si absent."""
    if not _GOOGLE_OK:
        raise RuntimeError("Dépendances Google absentes : pip install -r requirements.txt")
    row = load_token_row(conn)
    if not row:
        return None
    creds = Credentials(
        token=None,
        refresh_token=row["refresh_token"],
        token_uri=row["token_uri"] or "https://oauth2.googleapis.com/token",
        client_id=row["client_id"],
        client_secret=row["client_secret"],
        # Les scopes REELLEMENT accordes (stockes au consentement) : en demander d'autres
        # au rafraichissement ferait echouer le token. Analytics n'est donc accessible
        # que si le consentement a ete (re)fait avec GOOGLE_SCOPES.
        scopes=(row["scope"] or " ".join(config.GSC_SCOPES)).split(),
    )
    creds.refresh(Request())  # obtient un access_token frais (le refresh_token ne change pas)
    return creds


def _service(creds, name, version):
    return build(name, version, credentials=creds, cache_discovery=False)


SEARCH_TYPES = ("web", "image", "discover")  # types ingeres ; video/news possibles mais vides ici


def search_analytics(creds, gsc_property, start_date, end_date, search_type="web",
                     dimensions=("date", "page", "query"), extra_filters=None, use_config_filters=True):
    """Itère TOUTES les lignes de Search Analytics entre start_date et end_date (AAAA-MM-JJ).

    search_type : web (défaut de l'API), image, video, news, googleNews, discover — UN seul
    type par appel, c'est la règle de l'API. `discover` et `googleNews` n'acceptent pas la
    dimension query.
    dimensions  : parmi date, hour, query, page, country, device, searchAppearance.
    use_config_filters : applique GSC_COUNTRY / GSC_DEVICE (positions calées sur le SERP
    réel). À couper quand on ventile justement par pays ou par appareil.
    Renvoie une liste de dicts {keys: [...], clicks, impressions, position} plus, pour la
    forme historique (date, page, query), les clés date/page/query.
    Pagination par startRow (au plus GSC_ROW_LIMIT lignes/appel).
    """
    svc = _service(creds, "webmasters", "v3")
    dims = list(dimensions)
    out = []
    filters = []
    if use_config_filters:
        if config.GSC_COUNTRY and "country" not in dims:
            filters.append({"dimension": "country", "operator": "equals", "expression": config.GSC_COUNTRY})
        if config.GSC_DEVICE and "device" not in dims:
            filters.append({"dimension": "device", "operator": "equals", "expression": config.GSC_DEVICE})
    filters += list(extra_filters or [])

    start_row = 0
    while True:
        body = {
            "startDate": start_date,
            "endDate": end_date,
            "dimensions": dims,
            "type": search_type,
            "rowLimit": config.GSC_ROW_LIMIT,
            "startRow": start_row,
        }
        if filters:
            body["dimensionFilterGroups"] = [{"filters": filters}]
        resp = _execute_with_retry(
            svc.searchanalytics().query(siteUrl=gsc_property, body=body)
        )
        rows = (resp or {}).get("rows", [])
        for row in rows:
            keys = row.get("keys", [])
            if len(keys) < len(dims):
                continue
            rec = {
                "keys": keys,
                "clicks": int(row.get("clicks", 0) or 0),
                "impressions": int(row.get("impressions", 0) or 0),
                "position": float(row.get("position", 0) or 0),
            }
            for name, val in zip(dims, keys):
                rec[name] = val
            out.append(rec)
        if len(rows) < config.GSC_ROW_LIMIT:
            break
        start_row += config.GSC_ROW_LIMIT
    return out


def search_appearances(creds, gsc_property, start_date, end_date):
    """Liste des apparences (searchAppearance) presentes sur la periode. Google impose deux
    etapes : d'abord searchAppearance SEULE, puis une requete filtree par apparence."""
    rows = search_analytics(creds, gsc_property, start_date, end_date, "web", dimensions=("searchAppearance",))
    return [r["keys"][0] for r in rows if r.get("keys")]


def inspect_url(creds, gsc_property, page_url):
    """Inspecte une URL -> (coverage_state, raw_dict). coverage_state peut être None.
    Le fragment (#ancre) est systématiquement retiré : Google ne connaît pas les URLs ancrées."""
    svc = _service(creds, "searchconsole", "v1")
    body = {"inspectionUrl": strip_fragment(page_url), "siteUrl": gsc_property}
    resp = _execute_with_retry(svc.urlInspection().index().inspect(body=body))
    result = (resp or {}).get("inspectionResult", {})
    index_status = result.get("indexStatusResult", {})
    coverage = index_status.get("coverageState")
    return coverage, resp


def _execute_with_retry(request, tries=4):
    """Exécute un appel Google avec backoff sur 5xx (erreurs transitoires).
    Le 429 (quota épuisé) ne se résout PAS en quelques secondes -> on lève QuotaExceeded
    immédiatement (le quota URL Inspection se réinitialise quotidiennement)."""
    delay = 2
    last = None
    for attempt in range(tries):
        try:
            return request.execute()
        except HttpError as e:  # noqa
            status = getattr(getattr(e, "resp", None), "status", None)
            last = e
            if status == 429:
                raise QuotaExceeded(str(e))
            if status in (500, 503) and attempt < tries - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise
        except QuotaExceeded:
            raise
        except Exception as e:
            last = e
            if attempt < tries - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise
    if last:
        raise last
