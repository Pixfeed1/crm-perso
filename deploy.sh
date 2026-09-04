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
# Usage (SANS sudo, en tant que jurojinn) :
#   ./deploy.sh              # branche courante
#   ./deploy.sh --force-all  # tout reconstruire, sans tenir compte du diff
#
# Ne PAS lancer en root : le git pull creerait des fichiers appartenant a root
# dans le depot, et les pull suivants echoueraient sur des erreurs de permission.
# Le redemarrage des services n'exige pas root : quand polkit refuse
# `systemctl restart`, on retombe sur un kill du processus principal, que systemd
# relance aussitot (Restart=always).
#
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RACINE"

FORCE=0
[[ "${1:-}" == "--force-all" ]] && FORCE=1

# Lance en root, le git pull laisserait des fichiers root dans le depot et
# bloquerait les mises a jour suivantes faites par jurojinn.
if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  printf '\033[31m%s\033[0m\n' "N'execute pas ce script en root : le git pull creerait des fichiers root dans le depot."
  printf '%s\n' "Relance-le en tant que jurojinn, sans sudo :  ./deploy.sh"
  exit 1
fi

vert()  { printf '\033[32m%s\033[0m\n' "$*"; }
rouge() { printf '\033[31m%s\033[0m\n' "$*"; }
gris()  { printf '\033[90m%s\033[0m\n' "$*"; }
titre() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

ECHECS=()

# Port HTTP du backend, lu dans son .env (defaut 5000 comme server.js).
PORT_BACKEND="$(grep -E '^PORT=' backend/.env 2>/dev/null | cut -d= -f2- | tr -d '"\r' || true)"
PORT_BACKEND="${PORT_BACKEND:-5000}"

# Attend qu'un service soit actif. Un service qui vient d'etre tue passe par
# RestartSec (5 s sur ces units) puis par le demarrage de Node ; le backend
# execute en plus autoInitDatabase AVANT d'ecouter. Trancher apres 4 s donnait
# de fausses alertes. On sonde jusqu'a 60 s : `activating` = on patiente,
# `failed` = arret immediat, sinon on conclut a l'echec en fin de fenetre.
attendre_actif() {
  local svc="$1" etat i
  for i in $(seq 1 30); do
    etat="$(systemctl is-active "$svc" 2>/dev/null || true)"
    case "$etat" in
      active) return 0 ;;
      failed) return 1 ;;
    esac
    sleep 2
  done
  return 1
}

# Le backend : `active` signifie seulement que le processus existe. Express
# n'ecoute qu'apres l'init de la base, donc on attend une vraie reponse HTTP
# (n'importe quel code : 200, 301, 404... l'important est qu'il reponde).
attendre_http() {
  local port="$1" i code
  for i in $(seq 1 20); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:${port}/" 2>/dev/null || true)"
    if [[ "$code" =~ ^[1-5][0-9][0-9]$ ]]; then echo "$code"; return 0; fi
    sleep 2
  done
  return 1
}

# Redémarre un service. systemctl exige les droits root ; --no-ask-password
# evite que polkit tente une authentification interactive (et pollue l'ecran).
# En cas de refus, on retombe sur un kill du processus principal : les units
# ont Restart=always, systemd le relance donc de lui-meme.
redemarrer() {
  local svc="$1"
  if systemctl --no-ask-password restart "$svc" >/dev/null 2>&1; then
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
  gris "   attente du redémarrage (jusqu'à 60 s)…"
  if ! attendre_actif "$svc"; then
    rouge "   $svc N'EST PAS actif (état : $(systemctl is-active "$svc" 2>/dev/null))"
    ECHECS+=("$svc: inactif après redémarrage")
    return 1
  fi
  if [[ "$svc" == "crm-pixfeed" ]]; then
    local code
    if code="$(attendre_http "$PORT_BACKEND")"; then
      vert "   $svc actif et répond en HTTP ($code) sur le port $PORT_BACKEND"
    else
      rouge "   $svc est actif mais ne répond pas en HTTP sur le port $PORT_BACKEND"
      ECHECS+=("$svc: processus actif mais aucune réponse HTTP")
      return 1
    fi
  else
    vert "   $svc actif"
  fi
}

# Tout le deroulement est dans main() : bash analyse une fonction en entier avant
# de l'executer, si bien que ce fichier est lu jusqu'au bout AVANT le git pull.
# Sans cela, un pull qui met a jour deploy.sh lui-meme le reecrirait pendant que
# bash est encore en train de le lire par morceaux : commandes tronquees ou
# decalees, comportement imprevisible.
main() {
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

# Si package.json ou le lock ont bouge, les node_modules du serveur sont perimes :
# le build (ou le backend au demarrage) echouerait sur un module introuvable.
deps() {
  local dossier="$1"
  if touche "$dossier/package.json" || touche "$dossier/package-lock.json"; then
    gris "   dependances modifiees -> npm ci"
    ( cd "$dossier" && npm ci --no-audit --no-fund ) \
      || { rouge "   npm ci ECHOUE dans $dossier"; ECHECS+=("$dossier: npm ci en echec"); return 1; }
  fi
}

titre "2. Front"
if touche "frontend/"; then
  deps frontend
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
  deps backend
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
}

main "$@"
