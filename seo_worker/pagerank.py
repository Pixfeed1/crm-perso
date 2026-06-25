"""PageRank maison ("jus interne") sur le graphe de liens d'un site (networkx, damping 0.85).

Le PageRank est recalculé sur le GRAPHE ENTIER à chaque run (même en incrémental) : un seul
lien ajouté redistribue le jus sur tout le graphe.
"""
import networkx as nx


def compute(edges):
    """edges = liste de (from_url, to_url). Renvoie (pagerank: dict, inlinks: dict)."""
    g = nx.DiGraph()
    inlinks = {}
    for frm, to in edges:
        g.add_edge(frm, to)
        inlinks[to] = inlinks.get(to, 0) + 1
    if g.number_of_nodes() == 0:
        return {}, {}
    pr = nx.pagerank(g, alpha=0.85)
    return pr, inlinks
