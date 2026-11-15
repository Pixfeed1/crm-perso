#!/usr/bin/env bash
#
# Sauvegarde de la base du CRM (prospects, devis, factures, charte de rédaction et ses versions…).
#
#   backend/scripts/sauvegarde-base.sh            une sauvegarde maintenant
#   backend/scripts/sauvegarde-base.sh --essai    idem, puis vérifie qu'elle se relit (aucune suppression)
#
# - pg_dump au format compressé de PostgreSQL, vérifié par pg_restore --list avant d'être gardé ;
# - fichiers dans SAUVEGARDE_DOSSIER (défaut ~/sauvegardes/crm), lisibles par le seul compte jurojinn ;
# - seules les sauvegardes faites par ce script (crm-AAAAMMJJ-HHMM.dump) plus vieilles que SAUVEGARDE_JOURS
#   (défaut 14) sont supprimées, sur le serveur comme sur la copie distante ; rien d'autre n'est touché ;
# - copie hors du serveur si SAUVEGARDE_DISTANT est réglé (destination rclone, ex. « gdrive:crm-sauvegardes »).
# Réglages lus dans backend/.env : DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, SAUVEGARDE_*. Le mot de passe
# n'est jamais affiché ni passé en argument (variable d'environnement de pg_dump seulement).
# Planification (une fois, par Marc) : ligne cron donnée dans mcp_seo/README.md, section Sauvegardes.
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FICHIER="${SAUVEGARDE_ENV:-$RACINE/backend/.env}"
lire() { grep -E "^$1=" "$ENV_FICHIER" 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" | tr -d '\r'; }
horodatage() { date '+%Y-%m-%d %H:%M:%S'; }

HOTE="$(lire DB_HOST)"; HOTE="${HOTE:-localhost}"
PORT="$(lire DB_PORT)"; PORT="${PORT:-5432}"
BASE="$(lire DB_NAME)"; BASE="${BASE:-mcrm_dev}"
UTIL="$(lire DB_USER)"; UTIL="${UTIL:-postgres}"
DOSSIER="$(lire SAUVEGARDE_DOSSIER)"; DOSSIER="${DOSSIER:-$HOME/sauvegardes/crm}"
JOURS="$(lire SAUVEGARDE_JOURS)"; JOURS="${JOURS:-14}"
DISTANT="$(lire SAUVEGARDE_DISTANT)"

umask 077
mkdir -p "$DOSSIER" && chmod 700 "$DOSSIER"
FICHIER="$DOSSIER/crm-$(date +%Y%m%d-%H%M).dump"

if ! PGPASSWORD="$(lire DB_PASSWORD)" pg_dump -h "$HOTE" -p "$PORT" -U "$UTIL" -Fc -f "$FICHIER.partiel" "$BASE" 2>"$DOSSIER/.erreur"; then
  echo "$(horodatage) ÉCHEC pg_dump : $(tr '\n' ' ' < "$DOSSIER/.erreur")"; rm -f "$FICHIER.partiel" "$DOSSIER/.erreur"; exit 1
fi
if ! pg_restore --list "$FICHIER.partiel" >/dev/null 2>&1; then
  echo "$(horodatage) ÉCHEC : la sauvegarde ne se relit pas, gardée à part pour examen : $FICHIER.illisible"; mv "$FICHIER.partiel" "$FICHIER.illisible"; exit 1
fi
mv "$FICHIER.partiel" "$FICHIER"; rm -f "$DOSSIER/.erreur"
TABLES="$(pg_restore --list "$FICHIER" | grep -c ' TABLE DATA ')"
echo "$(horodatage) OK $FICHIER ($(du -h "$FICHIER" | cut -f1), $TABLES tables)"

if [[ "${1:-}" == "--essai" ]]; then
  echo "$(horodatage) essai : charte_versions dans la sauvegarde : $(pg_restore --list "$FICHIER" | grep -c 'TABLE DATA public charte_versions') ; aucune suppression faite"
  exit 0
fi

# Rotation : seulement les sauvegardes de ce script.
find "$DOSSIER" -maxdepth 1 -type f -name 'crm-????????-????.dump' -mtime +"$JOURS" -print -delete | sed "s/^/$(horodatage) supprimée (plus de $JOURS jours) : /"

# Copie hors du serveur.
if [[ -n "$DISTANT" ]]; then
  if ! command -v rclone >/dev/null; then echo "$(horodatage) ÉCHEC copie distante : rclone absent du serveur"; exit 1; fi
  if rclone copy "$FICHIER" "$DISTANT" 2>"$DOSSIER/.erreur"; then
    echo "$(horodatage) copie distante OK : $DISTANT/$(basename "$FICHIER")"
    rclone delete "$DISTANT" --min-age "${JOURS}d" --include 'crm-????????-????.dump' 2>/dev/null || true
  else
    echo "$(horodatage) ÉCHEC copie distante vers $DISTANT : $(tr '\n' ' ' < "$DOSSIER/.erreur")"; rm -f "$DOSSIER/.erreur"; exit 1
  fi
  rm -f "$DOSSIER/.erreur"
else
  echo "$(horodatage) ATTENTION : pas de copie hors du serveur (SAUVEGARDE_DISTANT non réglé dans backend/.env)"
fi
