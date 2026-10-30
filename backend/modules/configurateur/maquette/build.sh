#!/bin/sh
# Essai à sec de l'agent -> JSON -> page publiée (le JSON est inliné ; "</" échappé pour la balise script)
set -e; cd "$(dirname "$0")"
node ../scripts/essai-local.js
cp ../sortie/configurateur-data.json configurateur-data.json
python3 -c "
import json;d=open('configurateur-data.json').read().replace('</','<\\\\/')
p=open('page.html').read().replace('__DATA__',d);open('../configurateur-3d.html','w').write(p)"
