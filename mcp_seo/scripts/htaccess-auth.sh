#!/usr/bin/env bash
# Laisse passer l'en-tête Authorization jusqu'à WordPress (API REST avec mot de passe d'application).
# LiteSpeed / Apache le retirent souvent : WordPress voit alors un visiteur anonyme (401).
# Usage : bash htaccess-auth.sh /chemin/du/site   (le dossier qui contient wp-config.php)
# Copie de sauvegarde avant modification ; rien n'est fait si le réglage est déjà présent.
set -euo pipefail
SITE="${1:?Usage : bash htaccess-auth.sh /chemin/du/site}"
F="$SITE/.htaccess"
[[ -f "$SITE/wp-config.php" ]] || { echo "Pas de wp-config.php dans $SITE : ce n'est pas la racine d'un WordPress."; exit 1; }
[[ -f "$F" ]] || { echo "Pas de .htaccess dans $SITE."; exit 1; }
if grep -q 'HTTP_AUTHORIZATION' "$F"; then echo "Déjà en place dans $F : rien à faire."; exit 0; fi
grep -q '^# BEGIN WordPress' "$F" || { echo "Repère « # BEGIN WordPress » introuvable dans $F : à faire à la main."; exit 1; }
SAUVE="$F.avant-auth-$(date +%Y%m%d-%H%M%S)"
cp -p "$F" "$SAUVE"
awk '
  /^# BEGIN WordPress/ && !fait {
    print "# BEGIN Authorization (API REST : mots de passe d application)"
    print "<IfModule mod_rewrite.c>"
    print "RewriteEngine On"
    print "RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]"
    print "</IfModule>"
    print "# END Authorization"
    print ""
    fait = 1
  }
  { print }
' "$SAUVE" > "$F.tmp" && cat "$F.tmp" > "$F" && rm -f "$F.tmp"
echo "Ajouté dans $F (sauvegarde : $SAUVE)."
echo "Pour revenir en arrière : cp -p \"$SAUVE\" \"$F\""
