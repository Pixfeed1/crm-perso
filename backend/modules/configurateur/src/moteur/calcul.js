/* Moteur déterministe : pour un profil, toutes les machines valides, puis la meilleure à chaque palier de budget.
   Aucune IA ici : mêmes données en entrée, même résultat en sortie. */
const config = require("../config");
const { choisirReste, verifier } = require("./compat");

const car = x => x.caracteristiques || {};

/** Échelles de performance normalisées (100 = composant de référence ou meilleur de la sélection). */
function echelles(C) {
  const gpus = Object.values(C).filter(x => x.categorie === "gpu"), cpus = Object.values(C).filter(x => x.categorie === "cpu");
  const ref = (liste, f, idRef) => { const r = C[idRef] && f(C[idRef]); return r || Math.max(1, ...liste.map(f).filter(Boolean)) / 1.6; };
  const rendu = x => x.mesure_blender?.score || 0;
  const refRendu = ref(gpus, rendu, "gpu-5080"), refCalcul = ref(cpus, rendu, "cpu-9950x");
  return {
    gpu: { rendu: x => x.integree ? 2 : 100 * rendu(x) / refRendu,
           rendu_nvidia: x => x.marque_puce === "nvidia" ? 100 * rendu(x) / refRendu : 0,
           jeu: x => x.indice_jeu?.valeur || 0 },
    cpu: { calcul: x => 100 * rendu(x) / refCalcul, jeu: x => x.indice_jeu?.valeur || 0 }
  };
}

/** Toutes les machines techniquement valides pour un profil (sans contrainte de budget), avec coût et utilité. */
function machines(pr, projet, C, E, cache) {
  const gpus = Object.values(C).filter(x => x.categorie === "gpu"), cpus = Object.values(C).filter(x => x.categorie === "cpu");
  const rams = Object.values(C).filter(x => x.categorie === "ram"), ssds = Object.values(C).filter(x => x.categorie === "ssd");
  const w = pr.w.slice(); let cap = pr.cap, ramMin = 16, vram = pr.vram || 0;
  if (projet === "leger") cap = Math.min(cap, 32);
  if (projet === "lourd") { ramMin = Math.min(pr.ramLourd || 32, cap); vram = Math.max(vram, pr.vramLourd || 0); w[2] *= 1.3; }
  const gperf = g => pr.gpuJeu ? (E.gpu[pr.gpu](g) + E.gpu.jeu(g)) / 2 : E.gpu[pr.gpu](g);
  const cperf = c => pr.cpu === "mix" ? (E.cpu.calcul(c) + E.cpu.jeu(c)) / 2 : E.cpu[pr.cpu](c);
  const out = [];
  for (const g of gpus) {
    if (vram && (car(g).vram || 0) < vram) continue;
    if (pr.nvidia && !g.integree && g.marque_puce !== "nvidia") continue;          // contrainte dure (Iray)
    if (pr.office && !g.integree && g.prix > 400) continue;                        // usage courant : pas de grosse carte
    const gp = gperf(g);
    for (const c of cpus) {
      const cp = cperf(c);
      // équilibre : une grosse carte ne doit pas être bridée par un petit processeur
      const cj = E.cpu.jeu(c), gj = E.gpu.jeu(g);
      if ((gj >= 100 && cj < 75) || (gj >= 140 && cj < 78)) continue;
      const reste = choisirReste(g.id, c.id, C, cache);
      if (!reste) continue;
      for (const r of rams) {
        const go = car(r).go;
        if (go > cap || go < ramMin) continue;
        if (gj >= 100 && go < Math.min(64, cap) && !pr.game) continue;
        for (const s of ssds) {
          if (pr.office && car(s).to > 1.2) continue;
          const cfg = { gpu: g.id, cpu: c.id, ram: r.id, ssd: s.id, ...reste.reste };
          const cout = g.prix + c.prix + r.prix + s.prix + reste.prix;
          const ssdv = pr.gen5 ? car(s).to * (car(s).gen === 5 ? 1.3 : 1) : Math.min(car(s).to, 2);
          const gpc = Math.min(gp, pr.gcap || 999), cpc = Math.min(cp, pr.ccap || 999), rg = Math.min(go, cap);
          const utile = w[0] * Math.sqrt(gpc) + w[1] * Math.sqrt(cpc) + w[2] * Math.sqrt(rg) + w[3] * Math.sqrt(ssdv * 10);
          const indice = (w[0] * gpc + w[1] * cpc) / (w[0] + w[1]);                 // vitesse relative pour comparer deux machines
          out.push({ cfg, cout: Math.round(cout * 100) / 100, utile, indice, gp: gpc, cp: cpc, go, vram: car(g).vram || 0 });
        }
      }
    }
  }
  return out;
}

/** Mesure concrète d'une machine pour le profil (durée en secondes), si le profil en a une. */
function mesurer(pr, m, C) {
  if (!pr.mesure) return {};
  const comp = pr.mesure.base === "gpu" ? C[m.cfg.gpu] : C[m.cfg.cpu];
  const score = comp?.mesure_blender?.score;
  if (!score) return {};
  return { duree: Math.round(60 * pr.mesure.echantillons / score / 5) * 5 };
}
const vitesse = (m, mes) => mes.duree ? 1 / mes.duree : m.indice;

/** Calcule tous les paliers d'un profil. */
function profil(pr, projet, C, E, cache) {
  const { min, max, pas } = config.budget;
  const toutes = machines(pr, projet, C, E, cache).sort((a, b) => a.cout - b.cout);
  const thrift = pr.office ? 0.03 : pr.game ? 0.002 : 0.0015;
  const sig = m => [m.cfg.gpu, m.cfg.cpu, m.cfg.ram, m.cfg.ssd].join("|");
  const paliers = []; let dernier = "";
  for (let b = min; b <= max; b += pas) {
    let top = null;
    for (const m of toutes) { if (m.cout > b) break; const sc = m.utile - thrift * m.cout; if (!top || sc > top.sc) top = { m, sc }; }
    if (top && sig(top.m) !== dernier) { paliers.push({ budget: b, m: top.m }); dernier = sig(top.m); }
  }
  const plafond = paliers.length && paliers[paliers.length - 1].budget < max ? paliers[paliers.length - 1].budget : null;
  paliers.forEach(p => { p.mesures = mesurer(pr, p.m, C); p.v = vitesse(p.m, p.mesures); });

  // palier suivant qui vaut vraiment la dépense
  const gmin = config.suivant.gainMinPct;
  paliers.forEach((p, i) => {
    p.suivant = null;
    for (let j = i + 1; j < paliers.length; j++) {
      const z = paliers[j].m, a = p.m, g = {};
      if (z.cfg.gpu !== a.cfg.gpu) g.gpu = a.gp ? Math.round((z.gp / a.gp - 1) * 100) : 100;
      if (z.cfg.cpu !== a.cfg.cpu) g.cpu = a.cp ? Math.round((z.cp / a.cp - 1) * 100) : 100;
      if ((g.gpu || 0) >= gmin || (g.cpu || 0) >= gmin || z.go > a.go) { p.suivant = { budget: paliers[j].budget, gains: g }; break; }
    }
  });

  // alternative raisonnable (règle validée : -10 % et -100 € au moins, 5 % de vitesse en moins au plus, ni moins de RAM ni moins de mémoire vidéo)
  const A = config.alternative;
  paliers.forEach(p => {
    p.alternative = null;
    const plafondCout = Math.min(p.m.cout * (1 - A.economieMinPct / 100), p.m.cout - A.economieMinEuros);
    for (const q of toutes) {
      if (q.cout > plafondCout) break;
      if (q.go < p.m.go || q.vram < p.m.vram) continue;
      const mq = mesurer(pr, q, C), vq = vitesse(q, mq);
      if (vq >= p.v * (1 - A.perteMaxPct / 100)) {
        p.alternative = { config: q.cfg, cout: q.cout, mesures: mq, ecart_pct: Math.max(0, Math.round((1 - vq / p.v) * 100)) };
        break;  // la moins chère qui remplit les conditions
      }
    }
  });

  // repères : changements du composant prioritaire
  const w = pr.w, pk = w[0] >= w[1] && w[0] >= w[2] ? "gpu" : w[1] >= w[2] ? "cpu" : "ram";
  const reperes = []; let prev = null;
  for (const p of paliers) { const v = p.m.cfg[pk]; if (prev !== null && v !== prev) reperes.push({ budget: p.budget, libelle: C[v].court || C[v].puce }); prev = v; }

  // budgets conseillés
  const B = config.budgetsConseilles, budgets = [];
  if (paliers.length) {
    const first = paliers[0].budget, top = plafond || max;
    const at = b => { let r = null; for (const p of paliers) if (p.budget <= b) r = p; return r; };
    const lo = at(first).m.utile, hi = at(top).m.utile; let coude = null;
    for (let b = first; b <= top; b += pas) { if (hi - lo <= 0) break; if ((at(b).m.utile - lo) / (hi - lo) >= B.coude) { coude = b; break; } }
    if (top > first) {
      budgets.push({ libelle: "Le minimum", budget: first });
      if (coude && coude > first && top - coude >= B.ecartMinPlafond) budgets.push({ libelle: "Le bon équilibre", budget: coude });
      budgets.push({ libelle: plafond ? "Le plafond utile" : "Le haut de gamme", budget: top });
    } else budgets.push({ libelle: "Tout ce qu'il faut", budget: first });
  }
  return { priorite: pk, plafond, budgets, reperes, paliers };
}

module.exports = { echelles, machines, profil, mesurer, verifier };
