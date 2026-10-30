/* Compatibilité et choix du « reste de la machine ».
   Le reste (carte mère, ventirad, alimentation, boîtier) est choisi selon les BESOINS techniques
   de la carte graphique et du processeur ; le prix ne sert qu'à départager les candidats valides. */
const config = require("../config");

const car = x => x.caracteristiques || {};
const parCategorie = (C, cat) => Object.values(C).filter(x => x.categorie === cat);

/** Puissance d'alimentation nécessaire : conso réelle carte + processeur + reste du PC, avec marge,
    et jamais moins que la recommandation du fabricant de la carte. */
function besoinAlim(gpu, cpu) {
  const g = car(gpu), c = car(cpu);
  return Math.max(g.alim_recommandee || 0, ((g.tdp || 0) + (c.conso_max || c.tdp || 0) + config.alimentation.resteDuPc) * config.alimentation.marge);
}

/** Liste des raisons d'incompatibilité d'une configuration complète (vide = compatible). */
function verifier(cfg, C) {
  const g = C[cfg.gpu], c = C[cfg.cpu], r = C[cfg.ram], cm = C[cfg.cm], v = C[cfg.ventirad], a = C[cfg.alim], b = C[cfg.boitier];
  const e = [];
  if (!g || !c || !r || !cm || !v || !a || !b || !C[cfg.ssd]) return ["composant manquant"];
  if (car(c).socket !== car(cm).socket) e.push("socket");
  if (!(car(cm).familles || []).includes(c.famille)) e.push("bios/famille");
  if (car(r).memoire !== car(cm).memoire) e.push("memoire");
  if ((car(c).conso_max || 0) > (car(cm).vrm_max || 0)) e.push("vrm");
  if (g.integree && car(c).graphique_integree !== "forte") e.push("graphique_integree");
  if (!g.integree && car(c).graphique_integree === "forte") e.push("apu_avec_carte");
  if (v.inclus_dans === "cpu" && !car(c).ventirad_fourni) e.push("ventirad_non_fourni");
  if (!(car(v).sockets || []).includes(car(c).socket)) e.push("ventirad_socket");
  if ((car(v).tdpMax || 0) < (car(c).conso_max || 0)) e.push("refroidissement");
  if (car(v).type === "aio" ? !(car(b).radiateurs || []).includes(car(v).radiateur) : (car(v).hauteur || 0) > (car(b).ventiradMax || 0)) e.push("ventirad_boitier");
  if (!(car(b).formats || []).includes(car(cm).format)) e.push("format_carte_mere");
  if ((car(g).longueur || 0) > (car(b).gpuMax || 0)) e.push("longueur");
  if ((car(g).tdp || 0) + (car(c).conso_max || 0) > (car(b).chaleurMax || 0)) e.push("chaleur_boitier"); // chaleur à évacuer par le boîtier
  if ((car(a).watts || 0) < besoinAlim(g, c)) e.push("alimentation");
  if (car(g).connecteur && !(car(a).connecteurs || []).includes(car(g).connecteur)) e.push("connecteur");
  return e;
}

/** Choisit le reste de la machine pour un couple carte/processeur : le moins cher qui passe tous les contrôles.
    Le choix ne dépend que des caractéristiques ; à caractéristiques égales, le prix départage. */
function choisirReste(gpuId, cpuId, C, cache = new Map()) {
  const k = gpuId + "|" + cpuId;
  if (cache.has(k)) return cache.get(k);
  const tri = l => l.sort((x, y) => x.prix - y.prix);
  const cms = tri(parCategorie(C, "cm")), vs = tri(parCategorie(C, "ventirad")), as = tri(parCategorie(C, "alim")), bs = tri(parCategorie(C, "boitier"));
  const ramQuelconque = parCategorie(C, "ram")[0], ssdQuelconque = parCategorie(C, "ssd")[0];
  let best = null;
  for (const cm of cms) for (const v of vs) for (const a of as) for (const b of bs) {
    const cfg = { gpu: gpuId, cpu: cpuId, ram: ramQuelconque.id, ssd: ssdQuelconque.id, cm: cm.id, ventirad: v.id, alim: a.id, boitier: b.id };
    if (verifier(cfg, C).length) continue;
    const prix = cm.prix + v.prix + a.prix + b.prix;
    if (!best || prix < best.prix) best = { prix, reste: { cm: cm.id, ventirad: v.id, alim: a.id, boitier: b.id } };
  }
  cache.set(k, best);
  return best;
}

module.exports = { verifier, choisirReste, besoinAlim };
