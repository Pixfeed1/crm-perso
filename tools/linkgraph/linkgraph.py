#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
linkgraph — Découverte de cibles backlinks (0 € : Common Crawl + crawl direct)
==============================================================================

Deux moteurs complémentaires :

  1. snowball : depuis des sites "seeds" (hubs de la niche), suit les liens
     sortants (profondeur 2) et cartographie les domaines de la communauté.
     -> Résultats en MINUTES (crawl HTTP direct).

  2. linkers  : depuis le GRAPHE DE LIENS Common Crawl (niveau domaine,
     ~118 M de domaines / ~2,8 Mds d'arêtes), sort TOUS les domaines qui
     linkent les hubs. Exhaustif mais lourd -> batch de nuit.
     Flux recommandé :
        linkgraph.py fetch   --release cc-main-2026-apr-may-jun --dir /data/ccgraph
        linkgraph.py linkers --dir /data/ccgraph --hubs daz3d.com,renderosity.com \
                             --output linkers.csv

Sorties CSV (ingérées par le CRM) : domain, via, detail
  - snowball : via=snowball, detail=profondeur
  - linkers  : via=graph,    detail=hubs touchés (;) + nb de liens

Aucun envoi d'email ici : découverte uniquement.
"""

import argparse
import asyncio
import csv
import gzip
import io
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import httpx

CC_BASE = "https://data.commoncrawl.org/projects/hyperlinkgraph"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

# Domaines "plateforme" jamais pertinents comme cibles de backlinks (bruit).
JUNK_DOMAINS = {
    "google.com", "youtube.com", "facebook.com", "instagram.com", "twitter.com",
    "x.com", "linkedin.com", "pinterest.com", "tiktok.com", "wikipedia.org",
    "amazon.com", "amazon.fr", "apple.com", "microsoft.com", "wordpress.org",
    "wordpress.com", "blogger.com", "tumblr.com", "reddit.com", "discord.com",
    "discord.gg", "twitch.tv", "vimeo.com", "flickr.com", "paypal.com",
    "patreon.com", "github.com", "gravatar.com", "cloudflare.com", "archive.org",
    "bit.ly", "goo.gl", "t.co", "fonts.googleapis.com", "youtu.be", "deviantart.com",
}


def registered_domain(host: str) -> str:
    """Approximation du domaine enregistrable (gère .co.uk/.com.br/.asso.fr simples)."""
    host = (host or "").lower().strip(".")
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    second_level = {"co", "com", "org", "net", "gov", "ac", "asso", "gouv"}
    if parts[-2] in second_level and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def reverse_domain(domain: str) -> str:
    """daz3d.com -> com.daz3d (notation du graphe Common Crawl)."""
    return ".".join(reversed(domain.lower().strip().split(".")))


def unreverse_domain(rev: str) -> str:
    return ".".join(reversed(rev.strip().split(".")))


# --------------------------------------------------------------------------- #
#  FETCH : téléchargement (avec reprise) des fichiers du graphe domaine
# --------------------------------------------------------------------------- #

def graph_file_urls(release: str) -> dict:
    """URLs des fichiers vertices/edges du graphe DOMAINE d'une release.
    Essaie d'abord la liste .paths.gz (fichiers multiples), sinon fichier unique."""
    base = f"{CC_BASE}/{release}/domain"
    out = {"vertices": [], "edges": []}
    with httpx.Client(timeout=60, follow_redirects=True, headers={"User-Agent": UA}) as c:
        for kind in ("vertices", "edges"):
            paths_url = f"{base}/{release}-domain-{kind}.paths.gz"
            try:
                r = c.get(paths_url)
                if r.status_code == 200:
                    text = gzip.decompress(r.content).decode("utf-8", "replace")
                    for line in text.splitlines():
                        line = line.strip()
                        if line:
                            out[kind].append(
                                line if line.startswith("http")
                                else f"https://data.commoncrawl.org/{line.lstrip('/')}")
                    continue
            except Exception:
                pass
            out[kind].append(f"{base}/{release}-domain-{kind}.txt.gz")
    return out


def fetch_file(url: str, dest: Path, timeout: float = 120.0):
    """Télécharge avec reprise (Range) — les fichiers edges font des dizaines de Go."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    done_marker = dest.with_suffix(dest.suffix + ".done")
    if done_marker.exists():
        print(f"  déjà téléchargé : {dest.name}", file=sys.stderr)
        return
    start = dest.stat().st_size if dest.exists() else 0
    headers = {"User-Agent": UA}
    if start > 0:
        headers["Range"] = f"bytes={start}-"
        print(f"  reprise à {start / 1e9:.2f} Go : {dest.name}", file=sys.stderr)
    with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as c:
        with c.stream("GET", url) as r:
            if r.status_code == 416:  # déjà complet
                done_marker.touch()
                return
            r.raise_for_status()
            mode = "ab" if (start > 0 and r.status_code == 206) else "wb"
            with open(dest, mode) as f:
                got = start
                for chunk in r.iter_bytes(chunk_size=1 << 20):
                    f.write(chunk)
                    got += len(chunk)
                    if got % (1 << 30) < (1 << 20):
                        print(f"    ... {got / 1e9:.1f} Go", file=sys.stderr)
    done_marker.touch()


def cmd_fetch(args):
    urls = graph_file_urls(args.release)
    d = Path(args.dir)
    print(f"Release {args.release} : {len(urls['vertices'])} fichier(s) vertices, "
          f"{len(urls['edges'])} fichier(s) edges", file=sys.stderr)
    manifest = {"release": args.release, "vertices": [], "edges": []}
    for kind in ("vertices", "edges"):
        for u in urls[kind]:
            name = u.rsplit("/", 1)[-1]
            fetch_file(u, d / name)
            manifest[kind].append(name)
    (d / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Terminé -> {d}/manifest.json")


# --------------------------------------------------------------------------- #
#  LINKERS : qui linke les hubs ? (scan streaming du graphe)
# --------------------------------------------------------------------------- #

def _open_gz_lines(path: Path):
    with gzip.open(path, "rt", encoding="utf-8", errors="replace") as f:
        for line in f:
            yield line


def _manifest(dir_: Path) -> dict:
    mf = dir_ / "manifest.json"
    if not mf.exists():
        sys.exit(f"manifest.json introuvable dans {dir_} — lance d'abord `fetch`.")
    return json.loads(mf.read_text(encoding="utf-8"))


def cmd_linkers(args):
    d = Path(args.dir)
    manifest = _manifest(d)
    hubs = [registered_domain(h) for h in re.split(r"[\s,;]+", args.hubs) if h.strip()]
    hub_revs = {reverse_domain(h): h for h in hubs}
    print(f"Hubs ({len(hubs)}) : {', '.join(hubs)}", file=sys.stderr)

    # Passe 1 (vertices) : ids des hubs.
    hub_ids = {}
    for name in manifest["vertices"]:
        for line in _open_gz_lines(d / name):
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2 and parts[1] in hub_revs:
                hub_ids[int(parts[0])] = hub_revs[parts[1]]
                if len(hub_ids) == len(hub_revs):
                    break
        if len(hub_ids) == len(hub_revs):
            break
    if not hub_ids:
        sys.exit("Aucun hub trouvé dans le graphe (vérifie l'orthographe des domaines).")
    print(f"Ids trouvés : {hub_ids}", file=sys.stderr)

    # Passe 2 (edges) : sources qui pointent vers un hub. Cap mémoire par --max-linkers.
    linkers = {}  # from_id -> {hub_domain: count}
    scanned = 0
    for name in manifest["edges"]:
        print(f"Scan edges : {name}", file=sys.stderr)
        for line in _open_gz_lines(d / name):
            scanned += 1
            if scanned % 100_000_000 == 0:
                print(f"    ... {scanned / 1e9:.1f} Mds d'arêtes, {len(linkers)} linkers",
                      file=sys.stderr)
            tab = line.find("\t")
            if tab < 0:
                continue
            try:
                to_id = int(line[tab + 1:])
            except ValueError:
                continue
            hub = hub_ids.get(to_id)
            if hub is None:
                continue
            from_id = int(line[:tab])
            if from_id in hub_ids:
                continue  # un hub qui linke un hub : sans intérêt
            slot = linkers.setdefault(from_id, {})
            slot[hub] = slot.get(hub, 0) + 1
            if len(linkers) > args.max_linkers:
                print("  cap --max-linkers atteint, arrêt de la collecte", file=sys.stderr)
                break
        else:
            continue
        break
    print(f"{len(linkers)} domaines linkers (avant résolution des noms)", file=sys.stderr)

    # Passe 3 (vertices) : ids -> noms de domaines.
    names = {}
    remaining = set(linkers.keys())
    for name in manifest["vertices"]:
        if not remaining:
            break
        for line in _open_gz_lines(d / name):
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2:
                i = int(parts[0])
                if i in remaining:
                    names[i] = unreverse_domain(parts[1])
                    remaining.discard(i)
                    if not remaining:
                        break

    with open(args.output, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["domain", "via", "detail"])
        for from_id, hubs_hit in linkers.items():
            dom = names.get(from_id)
            if not dom or registered_domain(dom) in JUNK_DOMAINS:
                continue
            detail = ";".join(f"{h}:{n}" for h, n in sorted(hubs_hit.items()))
            w.writerow([dom, "graph", detail])
    print(f"Terminé : {args.output}")


# --------------------------------------------------------------------------- #
#  SNOWBALL : crawl des seeds, liens sortants, profondeur 2
# --------------------------------------------------------------------------- #

_HREF_RE = re.compile(r'href=["\'](https?://[^"\'>\s]+)', re.IGNORECASE)


async def _outbound_domains(client, url: str) -> set:
    try:
        r = await client.get(url)
        html = r.text or ""
    except Exception:
        return set()
    base = registered_domain(urlparse(str(url if str(url).startswith("http") else f"https://{url}")).netloc
                             or str(url))
    out = set()
    for href in _HREF_RE.findall(html):
        host = urlparse(href).netloc
        dom = registered_domain(host)
        if dom and dom != base and dom not in JUNK_DOMAINS and "." in dom:
            out.add(dom)
    return out


async def _snowball(seeds, depth, max_domains, concurrency, timeout):
    sem = asyncio.Semaphore(concurrency)
    found = {}  # domain -> depth de découverte
    frontier = []
    for s in seeds:
        dom = registered_domain(re.sub(r"^https?://", "", s).split("/")[0])
        if dom:
            frontier.append(dom)

    async with httpx.AsyncClient(headers={"User-Agent": UA}, follow_redirects=True,
                                 timeout=timeout, verify=False) as client:
        for level in range(1, depth + 1):
            async def fetch(dom):
                async with sem:
                    return dom, await _outbound_domains(client, f"https://{dom}")
            results = await asyncio.gather(*(fetch(d) for d in frontier))
            next_frontier = []
            for _, outs in results:
                for dom in outs:
                    if dom not in found:
                        found[dom] = level
                        next_frontier.append(dom)
                        if len(found) >= max_domains:
                            print(f"  cap --max-domains atteint (niveau {level})", file=sys.stderr)
                            return found
            print(f"  niveau {level} : {len(found)} domaines cumulés", file=sys.stderr)
            frontier = next_frontier
    return found


def cmd_snowball(args):
    seeds = [s for s in re.split(r"[\s,;]+", args.seeds) if s.strip()]
    if not seeds:
        sys.exit("Aucun seed fourni.")
    print(f"Boule de neige depuis {len(seeds)} seed(s), profondeur {args.depth}…", file=sys.stderr)
    found = asyncio.run(_snowball(seeds, args.depth, args.max_domains,
                                  args.concurrency, args.timeout))
    with open(args.output, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["domain", "via", "detail"])
        for dom, level in sorted(found.items(), key=lambda kv: (kv[1], kv[0])):
            w.writerow([dom, "snowball", f"profondeur {level}"])
    print(f"Terminé : {len(found)} domaines -> {args.output}")


# --------------------------------------------------------------------------- #
#  CLI
# --------------------------------------------------------------------------- #

def main():
    p = argparse.ArgumentParser(description="Découverte de cibles backlinks (Common Crawl + crawl direct).")
    sub = p.add_subparsers(dest="command", required=True)

    f = sub.add_parser("fetch", help="Télécharge le graphe domaine d'une release CC (reprise auto)")
    f.add_argument("--release", required=True, help="ex: cc-main-2026-apr-may-jun")
    f.add_argument("--dir", required=True, help="dossier de destination")

    l = sub.add_parser("linkers", help="Qui linke les hubs ? (scan du graphe téléchargé)")
    l.add_argument("--dir", required=True, help="dossier du graphe (après fetch)")
    l.add_argument("--hubs", required=True, help="domaines hubs, séparés par des virgules")
    l.add_argument("--output", default="linkers.csv")
    l.add_argument("--max-linkers", type=int, default=200_000)

    s = sub.add_parser("snowball", help="Boule de neige depuis des seeds (rapide)")
    s.add_argument("--seeds", required=True, help="domaines seeds, séparés par des virgules")
    s.add_argument("--depth", type=int, default=2)
    s.add_argument("--max-domains", type=int, default=1500)
    s.add_argument("--concurrency", type=int, default=10)
    s.add_argument("--timeout", type=float, default=10.0)
    s.add_argument("--output", default="snowball.csv")

    args = p.parse_args()
    if args.command == "fetch":
        cmd_fetch(args)
    elif args.command == "linkers":
        cmd_linkers(args)
    elif args.command == "snowball":
        cmd_snowball(args)


if __name__ == "__main__":
    main()
