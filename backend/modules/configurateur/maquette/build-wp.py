"""Découpe page.html (maquette) en trois fichiers pour le thème JurojiNet :
   configurateur/outil.html (balisage), configurateur.css (styles limités à .cfg-pc), configurateur.js (script, ids préfixés cfg-)."""
import re, os, sys
src = open(os.path.join(os.path.dirname(__file__), "page.html")).read()
out = sys.argv[1]
os.makedirs(out, exist_ok=True)

# ---------- CSS ----------
css = re.search(r"<style>(.*?)</style>", src, re.S).group(1)
css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
JETER = re.compile(r"^(body|\.page|\.article\b.*|\.mock|\*)$")
def prefixer(sel):
    parts = []
    for s in sel.split(","):
        s = s.strip()
        if s == ":root": parts.append(".cfg-pc"); continue
        parts.append(".cfg-pc " + s)
    return ",".join(parts)
def traiter(bloc):
    res, i = [], 0
    while i < len(bloc):
        j = bloc.find("{", i)
        if j < 0: break
        sel = bloc[i:j].strip()
        if sel.startswith("@media"):
            depth, k = 1, j + 1
            while depth:
                depth += {"{": 1, "}": -1}.get(bloc[k], 0); k += 1
            interne = traiter(bloc[j + 1:k - 1])
            if interne: res.append(sel + "{" + interne + "}")
            i = k; continue
        k = bloc.find("}", j)
        corps = bloc[j + 1:k].strip()
        if sel == "*" and "transition" in corps: res.append(".cfg-pc *{" + corps + "}")
        elif sel == "*": res.append(".cfg-pc,.cfg-pc *{" + corps + "}")
        elif all(JETER.match(s.strip()) for s in sel.split(",")): pass
        else: res.append(prefixer(sel) + "{" + corps + "}")
        i = k + 1
    return "\n".join(res)
scoped = traiter(css)
scoped = scoped.replace(".cfg-pc{", ".cfg-pc{font-family:var(--f);color:var(--text);font-size:17px;line-height:1.5;", 1)
open(os.path.join(out, "configurateur.css"), "w").write("/* Configurateur PC : styles limités au bloc .cfg-pc (généré depuis la maquette par build-wp.py) */\n" + scoped + "\n")

# ---------- balisage ----------
html = re.search(r'(<section class="tool".*?</section>)', src, re.S).group(1)
ids = sorted(set(re.findall(r'id="([A-Za-z][\w-]*)"', src)) - {"configurateur-data"}, key=len, reverse=True)
def pid(t):
    for a in ("id", "for", "aria-labelledby", "aria-describedby", "aria-controls", "href"):
        t = re.sub(r'(%s)="(#?)([A-Za-z][\w-]*)"' % a, lambda m: f'{m.group(1)}="{m.group(2)}cfg-{m.group(3)}"' if m.group(3) in ids else m.group(0), t)
    return t
open(os.path.join(out, "outil.html"), "w").write('<div class="cfg-pc">\n' + pid(html) + '\n</div>\n')

# ---------- script ----------
js = re.search(r'<script>\n(.*?)</script>', src, re.S).group(1)
js = js.replace('const $=id=>document.getElementById(id)', 'const $=id=>document.getElementById("cfg-"+id)')
js = re.sub(r'id="(p|s)-\$\{', r'id="cfg-\1-${', js)
js = pid(js)
assert 'getElementById(id)' not in js
open(os.path.join(out, "configurateur.js"), "w").write("/* Configurateur PC (généré depuis la maquette par build-wp.py) */\n(()=>{\n" + js + "})();\n")
print("ok", len(scoped), len(html), len(js))
