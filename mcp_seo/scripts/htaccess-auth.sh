#!/usr/bin/env bash
# Laisse passer l'en-tête Authorization jusqu'à WordPress (API REST avec mot de passe d'application).
# La règle RewriteRule [E=HTTP_AUTHORIZATION…] du bloc WordPress ne suffit pas toujours (LiteSpeed) :
# on ajoute en tête du .htaccess un SetEnvIf, traité plus tôt par le serveur.
#
# Usage : bash htaccess-auth.sh /chemin/du/site domaine.fr
#
# Sûreté : copie de sauvegarde, puis vérification immédiate avec un FAUX utilisateur (aucun vrai
# mot de passe) : WordPress doit répondre invalid_username (= il reçoit l'identification) et la
# page d'accueil doit répondre 200. Sinon, l'ancien .htaccess est remis automatiquement.
set -uo pipefail
SITE="${1:?Usage : bash htaccess-auth.sh /chemin/du/site domaine.fr}"
DOMAINE="${2:?Usage : bash htaccess-auth.sh /chemin/du/site domaine.fr}"
F="$SITE/.htaccess"
MARQUE='# BEGIN Authorization (API REST'

[[ -f "$SITE/wp-config.php" ]] || { echo "$DOMAINE : pas de wp-config.php dans $SITE, rien modifié."; exit 1; }
[[ -f "$F" ]] || { echo "$DOMAINE : pas de .htaccess dans $SITE, rien modifié."; exit 1; }

sonde() {   # code renvoyé par WordPress pour un faux utilisateur
  curl -s --max-time 20 -u "diagnostic-crm:aaaa bbbb cccc dddd eeee ffff" "https://$DOMAINE/wp-json/wp/v2/users/me?crm_live=$RANDOM" \
    | grep -o '"code":"[^"]*"' | head -n1 | cut -d'"' -f4
}
accueil() { curl -s -o /dev/null --max-time 20 -w '%{http_code}' "https://$DOMAINE/?crm_live=$RANDOM"; }

AVANT="$(sonde)"
if [[ "$AVANT" == "invalid_username" ]]; then echo "$DOMAINE : OK, WordPress reçoit déjà l'identification. Rien à faire."; exit 0; fi
if grep -qF "$MARQUE" "$F"; then echo "$DOMAINE : le bloc est déjà présent mais WordPress ne reçoit toujours rien ($AVANT). À examiner."; exit 1; fi

SAUVE="$F.avant-auth-$(date +%Y%m%d-%H%M%S)"
cp -p "$F" "$SAUVE"
{
  echo "# BEGIN Authorization (API REST : mots de passe d application)"
  echo "<IfModule mod_setenvif.c>"
  echo "SetEnvIf Authorization \"(.*)\" HTTP_AUTHORIZATION=\$1"
  echo "</IfModule>"
  echo "# END Authorization"
  echo ""
  cat "$SAUVE"
} > "$F.tmp" && cat "$F.tmp" > "$F" && rm -f "$F.tmp"

sleep 1
CODE="$(accueil)"
APRES="$(sonde)"
if [[ "$CODE" != "200" ]]; then
  cat "$SAUVE" > "$F"
  echo "$DOMAINE : la page d'accueil a répondu $CODE après l'ajout : ancien .htaccess remis, rien n'a changé."
  exit 1
fi
if [[ "$APRES" == "invalid_username" ]]; then
  echo "$DOMAINE : OK, WordPress reçoit maintenant l'identification (accueil 200). Sauvegarde : $SAUVE"
  exit 0
fi
cat "$SAUVE" > "$F"
echo "$DOMAINE : sans effet (toujours $APRES) : ancien .htaccess remis."
# pour le diagnostic : qui répond devant WordPress, et le serveur local reçoit-il l'en-tête ?
echo "  serveur : $(curl -sI --max-time 20 "https://$DOMAINE/" | grep -iE '^(server|via|cf-ray|x-proxy-cache):' | tr -d '\r' | tr '\n' ' ')"
LOCAL="$(curl -s --max-time 20 --resolve "$DOMAINE:443:127.0.0.1" -u "diagnostic-crm:aaaa bbbb cccc dddd eeee ffff" "https://$DOMAINE/wp-json/wp/v2/users/me" | grep -o '"code":"[^"]*"' | head -n1 | cut -d'"' -f4)"
echo "  en direct sur ce serveur (127.0.0.1) : ${LOCAL:-pas de réponse}"
exit 1
