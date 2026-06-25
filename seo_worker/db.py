"""Connexion PostgreSQL du worker SEO.

Le worker est la SEULE couche qui écrit les données SEO (le Node ne fait que lire).
Lit les mêmes variables d'environnement que le backend Node : DB_HOST/PORT/USER/PASSWORD/NAME.
"""
import os
import psycopg2
import psycopg2.extras


def connect():
    return psycopg2.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "5432")),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ.get("DB_PASSWORD", ""),
        dbname=os.environ.get("DB_NAME", "crm_db"),
    )
