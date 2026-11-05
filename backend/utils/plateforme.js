// Plateforme et version d'un site : CONFIRMÉES ou seulement DÉDUITES, avec leur source.
// Calculé à partir de ce que le crawler a déjà relevé (signals, platform_version), donc valable aussi
// pour les analyses anciennes. Règle : un email ne nomme la plateforme que si elle est confirmée, et
// n'affirme une version que si le site la déclare lui-même (balise generator).

const signaux = (r) => String((r && r.signals) || '').split(/\s*\|\s*/).filter(Boolean);
const estDeduite = (v) => /\(d[ée]duit\)/i.test(String(v || ''));

/** 'confirmée' | 'déduite' | 'inconnue' */
function niveauPlateforme(r) {
  const p = String((r && r.platform) || '');
  if (!p || p === 'Inconnu') return 'inconnue';
  const s = signaux(r);
  // Le site se déclare (entête serveur, balise generator, version déclarée) ou plusieurs marqueurs
  // distincts concordent : confirmée. Un seul marqueur (un mot dans la page) : déduite.
  if (s.some((x) => x.startsWith('header:') || /^content="/.test(x))) return 'confirmée';
  if (r.platform_version && !estDeduite(r.platform_version)) return 'confirmée';
  if (s.length >= 2) return 'confirmée';
  return s.length || r.platform_version ? 'déduite' : 'inconnue';
}

/** { niveau: 'confirmée' | 'déduite' | 'inconnue', version, source } */
function versionPlateforme(r) {
  const v = String((r && r.platform_version) || '').trim();
  if (!v) return { niveau: 'inconnue', version: null, source: null };
  const propre = v.replace(/\s*\(d[ée]duit\)/i, '');
  return estDeduite(v)
    ? { niveau: 'déduite', version: propre, source: 'déduite des fichiers du site (thème, modules, bibliothèques) : indice, pas une preuve' }
    : { niveau: 'confirmée', version: propre, source: 'déclarée par le site (balise generator)' };
}

/** Ajoute à une ligne crawl_results les niveaux lisibles (pour la fiche). */
function annoter(r) {
  if (!r) return r;
  const v = versionPlateforme(r);
  return { ...r, plateforme_niveau: niveauPlateforme(r), version_niveau: v.niveau, version_source: v.source, categorie_site: require('./prospectScore').categorieSite(r) };
}

module.exports = { niveauPlateforme, versionPlateforme, annoter };
