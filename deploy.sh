#!/usr/bin/env bash
#
# Déploiement du CRM PixFeed sur serveur2.
#
# Pourquoi ce script : le déploiement touche quatre composants indépendants
# (front, backend, serveur MCP, worker SEO), chacun avec sa propre étape. En
# oubliant une seule, le code part dans git mais ne tourne jamais — c'est ce qui
# a laissé la détection SPIP/Drupal inactive, puis failli figer le worker sur du
# code corrigé.
#
# Le script ne redémarre QUE ce qui a changé : reconstruire le front pour un
# correctif Python coûterait plusieurs minutes pour rien.
#
# Usage :
#   sudo ./deploy.sh              # branche courante
#   sudo ./deploy.sh --force-all  # tout reconstruire, sans tenir compte du diff
#
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RACINE"

FORCE=0
[[ "${1:-}" == "--force-all" ]] && FORCE=1

vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }
titre() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

ECHECS=()

# Redémarre un service. systemctl exige les droits root ; en cas de refus
# (polkit), on retombe sur un kill du processus principal : les units ont
# Restart=always, systemd le relance donc immédiatement.
redemarrer() {
  local svc="$1"
  if systemctl restart "$svc" 2>/dev/null; then
    gris "   systemctl restart $svc"
  else
    local pid
    pid="$(systemctl show "$svc" -p MainPID --value 2>/dev/null || echo 0)"
    if [[ "${pid:-0}" -gt 0 ]] && kill "$pid" 2>/dev/null; then
      gris "   kill $pid (relance automatique par systemd)"
    else
      rouge "   impossible de redémarrer $svc — droits insuffisants ?"
      ECHECS+=("$svc: redémarrage impossible")
      return 1
    fi
  fi
  # On laisse le service repartir avant de conclure quoi que ce soit.
  sleep 4
  if [[ "$(systemctl is-active "$svc" 2>/dev/null)" == "active" ]]; then
    vert "   $svc actif"
  else
    rouge "   $svc N'EST PAS actif"
    ECHECS+=("$svc: inactif après redémarrage")
    return 1
  fi
}

titre "1. Récupération du code"
AVANT="$(git rev-parse HEAD)"
BRANCHE="$(git rev-parse --abbrev-ref HEAD)"
gris "   branche : $BRANCHE"
if ! git pull origin "$BRANCHE"; then
  rouge "git pull a échoué — déploiement interrompu (rien n'a été redémarré)"
  exit 1
fi
APRES="$(git rev-parse HEAD)"

if [[ "$AVANT" == "$APRES" && $FORCE -eq 0 ]]; then
  vert "Déjà à jour, rien à faire."
  gris "(./deploy.sh --force-all pour tout reconstruire quand même)"
  exit 0
fi

# Quels dossiers ont bougé ? Détermine ce qu'il faut reconstruire ou redémarrer.
if [[ $FORCE -eq 1 ]]; then
  CHANGES="frontend/ backend/ mcp_seo/ seo_worker/ tools/"
  gris "   --force-all : tout est traité"
else
  CHANGES="$(git diff --name-only "$AVANT" "$APRES")"
  echo "$CHANGES" | sed 's/^/   /' | head -20
  NB="$(echo "$CHANGES" | wc -l)"
  [[ "$NB" -gt 20 ]] && gris "   … et $((NB - 20)) autre(s)"
fi

touche() { echo "$CHANGES" | grep -q "^$1"; }

titre "2. Front"
if touche "frontend/"; then
  ( cd frontend && npm run build ) \
    && vert "   build terminé" \
    || { rouge "   build ÉCHOUÉ"; ECHECS+=("frontend: build en échec"); }
else
  gris "   inchangé, build inutile"
fi

# Le backend en premier : c'est lui qui crée et met à jour les tables, dont
# dépendent le serveur MCP et le worker.
titre "3. Backend (crée les tables)"
if touche "backend/"; then
  redemarrer crm-pixfeed
else
  gris "   inchangé"
fi

titre "4. Serveur MCP"
if touche "mcp_seo/"; then
  redemarrer crm-mcp-seo
else
  gris "   inchangé"
fi

titre "5. Worker SEO"
if touche "seo_worker/"; then
  redemarrer crm-seo-worker
else
  gris "   inchangé"
fi

# Le crawler est exécuté par le backend depuis le dépôt : rien à copier. On le
# vérifie quand même, une copie externe ayant déjà fait passer des correctifs
# inaperçus pendant plusieurs jours.
titre "6. Crawler de prospection"
if touche "tools/cc_prospector/"; then
  CHEMIN="$(grep -oE "CC_PROSPECTOR_SCRIPT=.*" backend/.env 2>/dev/null | cut -d= -f2- | tr -d '"' || true)"
  if [[ -n "${CHEMIN:-}" && "$CHEMIN" != "$RACINE"/* ]]; then
    rouge "   .env force CC_PROSPECTOR_SCRIPT=$CHEMIN (hors dépôt)"
    rouge "   -> le crawler mis à jour ne sera PAS celui exécuté"
    ECHECS+=("crawler: CC_PROSPECTOR_SCRIPT pointe hors du dépôt")
  else
    vert "   exécuté depuis le dépôt, à jour"
  fi
else
  gris "   inchangé"
fi

titre "Résultat"
if [[ ${#ECHECS[@]} -eq 0 ]]; then
  vert "Déploiement terminé."
  git log --oneline "$AVANT..$APRES" | head -10 | sed 's/^/   /'
else
  rouge "Déploiement terminé AVEC DES PROBLÈMES :"
  printf '   - %s\n' "${ECHECS[@]}"
  exit 1
fi
