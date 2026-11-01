#!/usr/bin/env bash
# Remplace l'accès API d'un site (compte administrateur) par un utilisateur dédié au rôle Éditeur.
# 1. relève get_live_page avec l'accès actuel ; 2. crée l'Éditeur (WP-CLI, aucun e-mail envoyé) et son
# mot de passe d'application, rangé dans backend/.env sans être affiché ; 3. relève à nouveau et compare ;
# 4. identique : révoque les mots de passe d'application « CRM lecture… » de l'ancien compte ;
#    différent : remet l'ancien accès, retire le nouveau mot de passe, affiche les différences.
# Usage (depuis n'importe où) : bash bascule-editeur.sh <site_id> <dossier WordPress> <domaine> <identifiant> <url> [url…]
set -uo pipefail
ID="$1"; DOSSIER="$2"; DOMAINE="$3"; LOGIN="$4"; shift 4
CRM=~/crm.pixfeed.net; ENVF="$CRM/backend/.env"; MCP="$CRM/mcp_seo"; T="/tmp/bascule-$ID"; NOM_MDP="Lecture SEO"
[[ -f "$DOSSIER/wp-config.php" ]] || { echo "$DOSSIER n'est pas la racine d'un WordPress."; exit 1; }
cd "$DOSSIER" || exit 1
if command -v wp >/dev/null; then W=(wp); else [[ -f ~/wp-cli.phar ]] || curl -sSo ~/wp-cli.phar https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar; W=(php "$HOME/wp-cli.phar"); fi
wpq() { "${W[@]}" "$@" 2>/dev/null; }
ANCIEN="$(grep "^WP_API_USER_$ID=" "$ENVF" | head -n1 | cut -d= -f2-)"
[[ -n "$ANCIEN" ]] || { echo "Aucun accès actuel pour le site $ID dans backend/.env."; exit 1; }
if [[ "$ANCIEN" == "$LOGIN" ]]; then echo "Le site $ID utilise déjà l'utilisateur $LOGIN."; exit 0; fi

echo "== site $ID : relevé avec l'accès actuel"
rm -rf "$T"; ( cd "$MCP" && LIVE_OUT="$T/avant" node scripts/tester-live.js --court $(for u in "$@"; do printf '%s %s ' "$ID" "$u"; done) )

echo "== utilisateur Éditeur « $LOGIN »"
if wpq user get "$LOGIN" --field=ID >/dev/null; then
  ROLES="$(wpq user get "$LOGIN" --field=roles)"
  [[ "$ROLES" == "editor" ]] || { echo "   $LOGIN existe déjà avec le rôle « $ROLES » : arrêt, rien n'a changé."; exit 1; }
  echo "   déjà présent (Éditeur)"
else
  NOUVEL_ID="$(wpq user create "$LOGIN" "$LOGIN@$DOMAINE" --role=editor --display_name="Lecture SEO" --porcelain)" \
    || { echo "   création impossible : rien n'a changé."; exit 1; }
  echo "   créé (#$NOUVEL_ID), sans e-mail envoyé"
fi
P="$(wpq user application-password create "$LOGIN" "$NOM_MDP" --porcelain)"; C="$(printf %s "$P" | tr -cd 'A-Za-z0-9')"; unset P
[[ ${#C} -eq 24 ]] || { echo "   mot de passe d'application non créé : rien n'a changé."; exit 1; }
cp -p "$ENVF" "$T.env.avant"
grep -v "^WP_API_USER_$ID=\|^WP_API_PASSWORD_$ID=" "$ENVF" > "$ENVF.tmp" && printf 'WP_API_USER_%s=%s\nWP_API_PASSWORD_%s=%s\n' "$ID" "$LOGIN" "$ID" "$C" >> "$ENVF.tmp" && cat "$ENVF.tmp" > "$ENVF" && rm -f "$ENVF.tmp"
unset C
echo "   mot de passe d'application « $NOM_MDP » créé et rangé dans backend/.env"

echo "== relevé avec l'Éditeur"
( cd "$MCP" && LIVE_OUT="$T/apres" node scripts/tester-live.js --court $(for u in "$@"; do printf '%s %s ' "$ID" "$u"; done) )

echo "== comparaison"
if ( cd "$MCP" && node scripts/comparer-live.js "$T/avant" "$T/apres" ); then
  echo "== identique : révocation des mots de passe « CRM lecture… » de $ANCIEN"
  wpq user application-password list "$ANCIEN" --fields=uuid,name --format=json \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s||"[]"))if(/^CRM lecture/i.test(p.name))console.log(p.uuid+"\t"+p.name)})' \
    | while IFS=$'\t' read -r UUID NOM; do wpq user application-password delete "$ANCIEN" "$UUID" >/dev/null && echo "   révoqué : $NOM"; done
  echo "== site $ID : accès basculé sur $LOGIN (Éditeur)."
else
  cat "$T.env.avant" > "$ENVF"
  wpq user application-password list "$LOGIN" --fields=uuid,name --format=json \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const p of JSON.parse(s||"[]"))if(p.name==="Lecture SEO")console.log(p.uuid)})' \
    | while read -r UUID; do wpq user application-password delete "$LOGIN" "$UUID" >/dev/null; done
  echo "== différences ci-dessus : ancien accès remis, rien n'a été révoqué."
  exit 1
fi
rm -f "$T.env.avant"
