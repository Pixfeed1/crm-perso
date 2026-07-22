// backend/services/sireneEnrich.js
// Enrichissement société via l'API publique recherche-entreprises.api.gouv.fr (GRATUITE,
// sans clé). À partir d'un nom/domaine, retourne raison sociale, dirigeant, SIREN, NAF,
// adresse, effectif -> permet un cold email nominatif ("Bonjour M. Dupont, [Raison Sociale]...").
const axios = require('axios');

const API = 'https://recherche-entreprises.api.gouv.fr/search';

const trancheEffectif = (code) => {
  const map = {
    '00': '0 salarié', '01': '1-2', '02': '3-5', '03': '6-9', '11': '10-19',
    '12': '20-49', '21': '50-99', '22': '100-199', '31': '200-249', '32': '250-499',
    '41': '500-999', '42': '1000-1999', '51': '2000-4999', '52': '5000+', '53': '5000+'
  };
  return code ? (map[code] || null) : null;
};

const formatAddress = (siege) => {
  if (!siege) return null;
  const parts = [];
  if (siege.numero_voie && siege.type_voie && siege.libelle_voie) parts.push(`${siege.numero_voie} ${siege.type_voie} ${siege.libelle_voie}`);
  else if (siege.libelle_voie) parts.push(siege.libelle_voie);
  if (siege.code_postal && siege.libelle_commune) parts.push(`${siege.code_postal} ${siege.libelle_commune}`);
  return parts.join(', ') || null;
};

const dirigeantName = (dirigeants) => {
  if (!Array.isArray(dirigeants) || !dirigeants.length) return null;
  const d = dirigeants[0];
  // Personne physique : prénoms + nom. Personne morale : dénomination.
  if (d.nom || d.prenoms) return `${(d.prenoms || '').trim()} ${(d.nom || '').trim()}`.trim();
  return d.denomination || null;
};

// Parse une réponse brute de l'API en objet normalisé (exporté pour tests).
function parseCompany(company) {
  if (!company) return { found: false };
  return {
    found: true,
    raison_sociale: company.nom_complet || company.nom_raison_sociale || null,
    siren: company.siren || null,
    siret: company.siege?.siret || null,
    naf: company.activite_principale || null,
    naf_label: company.libelle_activite_principale || null,
    dirigeant: dirigeantName(company.dirigeants),
    effectif: trancheEffectif(company.tranche_effectif_salarie),
    adresse: formatAddress(company.siege)
  };
}

// query = nom d'entreprise (idéalement le titre de la home) ou racine de domaine.
async function enrich(query) {
  const q = (query || '').trim();
  if (!q) return { found: false };
  try {
    const res = await axios.get(API, { params: { q, per_page: 1, page: 1 }, timeout: 8000 });
    const company = res.data?.results?.[0];
    return parseCompany(company);
  } catch (e) {
    return { found: false, error: e.message };
  }
}

module.exports = { enrich, parseCompany };
