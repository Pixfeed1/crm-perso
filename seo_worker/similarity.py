# seo_worker/similarity.py
#
# Similarité de contenu entre pages (TF-IDF + cosinus) à partir des extraits déjà stockés
# par le crawl (seo_onpage_issues.data.excerpt, ~2000 caractères). Signal de maillage n°3
# (après requêtes GSC partagées et tags communs) : il relie les pages qui parlent du même
# sujet MÊME sans tag ni historique GSC commun (typiquement les pages récentes).
#
# Résultat persisté dans seo_similar_pages (top N voisins par page, score >= seuil),
# recalculé à chaque crawl (delete + insert par site). AUCUNE requête réseau : tout est local.
#
# scikit-learn est OPTIONNEL : s'il manque, on log un conseil d'installation et on saute
# l'étape sans jamais faire échouer le crawl.

import config

# Nombre max de voisins conservés par page, et similarité cosinus minimale.
TOP_K = int(getattr(config, "SIMILARITY_TOP_K", 10))
MIN_SCORE = float(getattr(config, "SIMILARITY_MIN_SCORE", 0.15))
MIN_EXCERPT_LEN = int(getattr(config, "SIMILARITY_MIN_EXCERPT", 200))

# Stopwords français compacts (sklearn n'en fournit pas) : déterminants, pronoms,
# conjonctions, prépositions et verbes-outils les plus fréquents. Suffisant pour du TF-IDF
# (les mots rares portent le signal, les mots-outils ne font que du bruit).
FRENCH_STOPWORDS = [
    "a", "au", "aux", "avec", "ce", "ces", "cet", "cette", "dans", "de", "des", "du",
    "elle", "elles", "en", "et", "eux", "il", "ils", "je", "j", "la", "le", "les", "leur",
    "leurs", "lui", "ma", "mais", "me", "meme", "mes", "moi", "mon", "ne", "nos", "notre",
    "nous", "on", "ou", "par", "pas", "plus", "pour", "qu", "que", "qui", "sa", "se", "ses",
    "son", "sur", "ta", "te", "tes", "toi", "ton", "tu", "un", "une", "vos", "votre", "vous",
    "y", "d", "l", "s", "c", "n", "m", "t", "si", "tout", "tous", "toute", "toutes", "comme",
    "sans", "sous", "entre", "vers", "chez", "donc", "or", "ni", "car", "est", "sont", "etait",
    "etre", "avoir", "ont", "fait", "faire", "peut", "aussi", "bien", "tres", "cela", "ca",
    "sont", "ete", "avait", "deux", "trois", "apres", "avant", "autre", "autres", "dont",
    "quand", "encore", "alors", "ainsi", "afin", "peu", "non", "oui", "aujourd", "hui",
]


def compute_similar_pages(conn, site_id):
    """Calcule et persiste les paires de pages similaires du site. Lève en cas d'erreur
    SQL (l'appelant isole via try/except, comme audit_postprocess)."""
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import linear_kernel
    except ImportError:
        print("[SIMILARITY] scikit-learn absent -> étape sautée. Installer : pip install scikit-learn")
        return

    cur = conn.cursor()
    # Extraits des pages de CONTENU uniquement (on exclut les pages sans texte utile).
    cur.execute(
        """SELECT i.url, i.data->>'excerpt' AS excerpt
           FROM seo_onpage_issues i
           WHERE i.site_id = %s AND COALESCE(i.data->>'excerpt', '') <> ''""",
        (site_id,),
    )
    rows = [(u, e) for (u, e) in cur.fetchall() if e and len(e) >= MIN_EXCERPT_LEN]
    if len(rows) < 5:
        print(f"[SIMILARITY] {len(rows)} extrait(s) exploitables (< 5) -> étape sautée (relancer après un crawl complet)")
        return

    urls = [u for (u, _) in rows]
    texts = [e for (_, e) in rows]
    n = len(texts)

    # TF-IDF : accents retirés (evite 'création'/'creation'), unigrammes + bigrammes,
    # min_df=2 dès que le corpus le permet (ignore les termes vus sur une seule page).
    vec = TfidfVectorizer(
        strip_accents="unicode",
        lowercase=True,
        stop_words=FRENCH_STOPWORDS,
        ngram_range=(1, 2),
        max_features=20000,
        min_df=2 if n >= 20 else 1,
        sublinear_tf=True,
    )
    X = vec.fit_transform(texts)  # lignes L2-normalisées -> produit scalaire = cosinus

    # Recalcul complet du site : delete + insert (idempotent, comme le graphe de liens).
    cur.execute("DELETE FROM seo_similar_pages WHERE site_id = %s", (site_id,))

    inserted = 0
    chunk = 500  # calcul par blocs -> mémoire bornée même sur de gros sites
    for start in range(0, n, chunk):
        sims = linear_kernel(X[start:start + chunk], X)  # (chunk, n)
        for i, sim_row in enumerate(sims):
            src = start + i
            # Top K au-dessus du seuil, soi-même exclu.
            order = sim_row.argsort()[::-1]
            kept = 0
            for j in order:
                if j == src:
                    continue
                score = float(sim_row[j])
                if score < MIN_SCORE or kept >= TOP_K:
                    break
                cur.execute(
                    """INSERT INTO seo_similar_pages (site_id, url, similar_url, score, updated_at)
                       VALUES (%s, %s, %s, %s, NOW())
                       ON CONFLICT (site_id, url, similar_url) DO UPDATE
                         SET score = EXCLUDED.score, updated_at = NOW()""",
                    (site_id, urls[src], urls[j], round(score, 4)),
                )
                kept += 1
                inserted += 1
    conn.commit()
    print(f"[SIMILARITY] {inserted} paires similaires enregistrées ({n} pages analysées)")
