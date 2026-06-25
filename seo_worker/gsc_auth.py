#!/usr/bin/env python3
"""Consentement OAuth Google Search Console — À LANCER UNE SEULE FOIS.

L'app OAuth est de type *Desktop* et publiée en Production -> le refresh_token obtenu
N'EXPIRE PAS. Une seule connexion sert TOUS les sites (chaque seo_sites.gsc_property mappe
un site). Le refresh_token est stocké dans la table seo_oauth_tokens (jamais dans .env).

Le fichier client_secret.json (OAuth Desktop) est nécessaire :
  - pour le flux de consentement (modes par défaut / --write-db) ;
  - pour le mode --store (on y lit client_id / client_secret à enregistrer avec le token).

============================================================================
VARIANTE SANS TUNNEL (recommandée par l'utilisateur) — 2 étapes
============================================================================
1) Sur TON POSTE (avec navigateur), client_secret.json dans le dossier courant :
       python gsc_auth.py
   -> le navigateur s'ouvre, tu choisis le compte Google qui a accès aux propriétés GSC,
      tu acceptes. Le script AFFICHE le refresh_token et la commande --store prête à coller.

2) Sur SERVEUR2 (accès base), client_secret.json présent aussi :
       python gsc_auth.py --store --email=ton.email@gmail.com --refresh-token=COLLER_ICI
   -> écrit la connexion dans seo_oauth_tokens. Terminé, définitif.

============================================================================
VARIANTE TUNNEL SSH (tout sur serveur2, en un coup)
============================================================================
   Depuis ton poste :  ssh -L 8765:localhost:8765 user@serveur2
   Sur serveur2 :       python gsc_auth.py --write-db --no-browser
   -> colle l'URL affichée dans ton navigateur local ; après consentement, le token est
      écrit directement en base.
"""
import argparse
import json
import os
import sys

import config
from db import connect

DEFAULT_SECRET = os.path.join(os.path.dirname(os.path.abspath(__file__)), "client_secret.json")


def read_client_secret(path):
    if not os.path.exists(path):
        sys.exit(f"client_secret.json introuvable : {path}")
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    node = data.get("installed") or data.get("web") or {}
    cid = node.get("client_id")
    secret = node.get("client_secret")
    if not cid or not secret:
        sys.exit("client_secret.json invalide (client_id/client_secret manquants).")
    return cid, secret


def store_token(email, refresh_token, client_id, client_secret, scope):
    """Upsert de la connexion Google dans seo_oauth_tokens (1 ligne par provider+email)."""
    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """UPDATE seo_oauth_tokens
               SET refresh_token = %s, client_id = %s, client_secret = %s,
                   scope = %s, updated_at = NOW()
               WHERE provider = 'google' AND COALESCE(account_email, '') = COALESCE(%s, '')""",
            (refresh_token, client_id, client_secret, scope, email),
        )
        if cur.rowcount == 0:
            cur.execute(
                """INSERT INTO seo_oauth_tokens
                     (provider, account_email, scope, client_id, client_secret, refresh_token)
                   VALUES ('google', %s, %s, %s, %s, %s)""",
                (email, scope, client_id, client_secret, refresh_token),
            )
        conn.commit()
        print(f"[GSC] Connexion enregistrée dans seo_oauth_tokens (compte: {email or 'non précisé'}).")
    finally:
        conn.close()


def run_consent(secret_path, open_browser):
    from google_auth_oauthlib.flow import InstalledAppFlow

    flow = InstalledAppFlow.from_client_secrets_file(secret_path, scopes=config.GSC_SCOPES)
    creds = flow.run_local_server(port=config.GSC_OAUTH_REDIRECT_PORT, open_browser=open_browser)
    if not creds.refresh_token:
        sys.exit("Aucun refresh_token renvoyé. Révoque l'accès dans le compte Google puis recommence "
                 "(le refresh_token n'est fourni qu'au tout premier consentement).")
    return creds


def main():
    ap = argparse.ArgumentParser(description="Consentement OAuth Google Search Console (one-shot).")
    ap.add_argument("--store", action="store_true", help="écrire un refresh_token déjà obtenu (pas de flux navigateur)")
    ap.add_argument("--write-db", action="store_true", help="flux de consentement PUIS écriture directe en base")
    ap.add_argument("--email", help="compte Google (libellé, stocké tel quel)")
    ap.add_argument("--refresh-token", help="refresh_token (mode --store)")
    ap.add_argument("--no-browser", action="store_true", help="ne pas ouvrir le navigateur (affiche l'URL)")
    ap.add_argument("--client-secret", default=DEFAULT_SECRET, help="chemin de client_secret.json")
    args = ap.parse_args()

    scope = " ".join(config.GSC_SCOPES)
    client_id, client_secret = read_client_secret(args.client_secret)

    # Mode écriture seule (serveur2) : pas de flux navigateur.
    if args.store:
        if not args.refresh_token:
            sys.exit("--store nécessite --refresh-token (et idéalement --email).")
        store_token(args.email, args.refresh_token, client_id, client_secret, scope)
        return

    # Flux de consentement (poste ou serveur2 via tunnel).
    creds = run_consent(args.client_secret, open_browser=not args.no_browser)

    if args.write_db:
        store_token(args.email, creds.refresh_token, client_id, client_secret, scope)
        return

    # Sinon : on AFFICHE le token et la commande --store à exécuter sur serveur2.
    print("\n========================= CONSENTEMENT OK =========================")
    print(f"refresh_token : {creds.refresh_token}")
    print("\nÀ exécuter sur SERVEUR2 (dans seo_worker/, client_secret.json présent) :")
    email_arg = f" --email={args.email}" if args.email else " --email=VOTRE_EMAIL"
    print(f"  python gsc_auth.py --store{email_arg} --refresh-token={creds.refresh_token}")
    print("===================================================================\n")


if __name__ == "__main__":
    main()
