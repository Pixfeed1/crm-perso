// backend/services/contratMaintenance.js
// Contrat de maintenance complet (Essentiel, Professionnel, Sur mesure), rempli à partir du contrat
// de maintenance, de la fiche client et des informations de l'entreprise, rendu en PDF avec la même
// charte que les conditions (pdfService, Chromium).
// Le texte est celui des trois modèles rédigés le 27/10/2026. Un champ non renseigné apparaît comme
// une ligne pointillée à compléter à la main : le PDF n'affiche jamais de variable brute.
const pdfService = require('./pdfService');
const { maintenanceConditions } = require('./conditionsService');

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const VIDE = '<span class="blank">………………………</span>';
const formatEur = (n) => {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '';
};
const formatDate = (d) => {
  if (!d) return '';
  const s = d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : String(d).slice(0, 10);
  const [y, m, j] = s.split('-');
  return y && m && j ? `${j}/${m}/${y}` : '';
};

// Champs du formulaire « Contrat » (enregistrés sur le contrat de maintenance, réutilisés ensuite).
const CHAMPS_CLIENT = ['client_raison_sociale', 'client_forme_siret', 'client_adresse', 'client_representant'];
const CHAMPS_SERVICE = ['service_type', 'technologie'];
const CHAMPS_DEVIS = ['perimetre', 'devis_reference', 'heures_incluses', 'taux_horaire_ht', 'delai_prise_en_charge', 'plages_astreinte', 'duree_engagement', 'interlocuteur'];
const CHAMPS_PRESTATAIRE = ['prestataire_forme', 'mention_tva', 'tribunal'];

// Préremplissage depuis la fiche client : champs dédiés, puis lignes « Clé : valeur » des notes
// (format utilisé à la création des fiches : « Raison sociale : … », « Représentante : … »).
function lireNotes(notes) {
  const out = {};
  for (const l of String(notes || '').split(/\r?\n/)) {
    const m = /^\s*([^:]{3,40})\s*:\s*(.+)$/.exec(l);
    if (!m) continue;
    const k = m[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const v = m[2].trim();
    if (/raison sociale/.test(k)) out.raison = v.replace(/\s*\(nom commercial[^)]*\)\s*$/i, '');
    else if (/represent/.test(k)) out.representant = v;
    else if (/adresse/.test(k)) out.adresse = v;
  }
  const texte = String(notes || '');
  const forme = /\b(SARL|SAS|SASU|EURL|SA|SCI|SNC|EI|EIRL|entreprise individuelle|micro-entreprise)\b[^\n,]*(?:au capital de [^\n,]+)?/i.exec(texte);
  const siret = /SIRET[^0-9]*([0-9][0-9 ]{12,17}[0-9])/i.exec(texte);
  if (forme || siret) out.forme_siret = [forme ? forme[0].trim() : null, siret ? `SIRET ${siret[1].replace(/\s+/g, ' ').trim()}` : null].filter(Boolean).join(', ');
  return out;
}

function prefill(contract, client) {
  const n = lireNotes(client && client.notes);
  const plan = maintenanceConditions(contract.plan);
  return {
    client_raison_sociale: n.raison || (client && client.name) || '',
    client_forme_siret: n.forme_siret || (client && client.siret ? `SIRET ${client.siret}` : ''),
    client_adresse: n.adresse || (client && client.address) || '',
    client_representant: n.representant || '',
    service_type: plan.type === 'maintenance-essentiel' ? 'le site' : 'la boutique en ligne',
    technologie: '',
    perimetre: '', devis_reference: '', heures_incluses: '', taux_horaire_ht: '', delai_prise_en_charge: '', plages_astreinte: '', duree_engagement: 'sans engagement de durée', interlocuteur: 'Marc Gueffie'
  };
}

// ─── Texte du contrat ───────────────────────────────────────────────────────
// Blocs : { p } paragraphe (HTML déjà échappé), { ul: [] }, { ol: [] }, { table: { head, rows } }.
function articles(formule, v) {
  const pro = formule !== 'maintenance-essentiel';
  const sm = formule === 'maintenance-sur-mesure';
  const objet = sm ? 'du Périmètre' : pro ? `de ${v.service_url}` : `du site ${v.service_url}`;
  const nomFormule = sm ? 'Sur mesure' : pro ? 'Professionnel' : 'Essentiel';
  const A = [];

  A.push({ titre: 'Objet', blocs: [{ p: `Le présent contrat définit les conditions dans lesquelles le Prestataire assure la maintenance${sm ? ' et l’infogérance' : ' technique'} ${objet} selon la formule ${nomFormule}, à compter du ${v.date_debut}.` }] });

  A.push({ titre: 'Définitions', blocs: [{ ul: sm ? [
    `<strong>Périmètre</strong> : les sites, applications, serveurs et services listés dans le devis : ${v.perimetre}.`,
    '<strong>Incident bloquant</strong> : panne qui rend un élément du Périmètre inaccessible, empêche une fonction essentielle ou résulte d’un piratage.',
    '<strong>Heures ouvrées</strong> : du lundi au vendredi, de 9 h à 18 h, heure de Paris, hors jours fériés en France.',
    `<strong>Astreinte</strong> : disponibilité du Prestataire en dehors des heures ouvrées, sur les plages ${v.plages_astreinte}.`,
    '<strong>Heures incluses</strong> : volume mensuel d’heures de développement compris dans le forfait.'
  ] : pro ? [
    `<strong>Service</strong> : ${v.service_type} ${v.service_url}, son code, ses dépendances, sa configuration et sa base de données.`,
    '<strong>Incident bloquant</strong> : panne qui rend le Service inaccessible, empêche une fonction essentielle (paiement, prise de commande, connexion des utilisateurs, enregistrement des données) ou résulte d’un piratage.',
    '<strong>Heures ouvrées</strong> : du lundi au vendredi, de 9 h à 18 h, heure de Paris, hors jours fériés en France.',
    '<strong>Modification mineure</strong> : petit ajustement ne nécessitant pas de développement, par exemple un texte, une image, un réglage ou une correction d’affichage.',
    '<strong>Signalement</strong> : demande envoyée par email à contact@pixfeed.net par le Client.'
  ] : [
    `<strong>Site</strong> : le site ${v.service_url}, son CMS, son thème, ses extensions et sa base de données.`,
    '<strong>Incident bloquant</strong> : panne qui rend le site inaccessible, empêche une fonction essentielle (formulaire de contact, prise de commande, connexion) ou résulte d’un piratage.',
    '<strong>Jours ouvrés</strong> : du lundi au vendredi, de 9 h à 18 h, heure de Paris, hors jours fériés en France.',
    '<strong>Signalement</strong> : demande envoyée par email à contact@pixfeed.net par le Client.'
  ] }] });

  if (sm) {
    A.push({ titre: 'Prestations incluses', blocs: [
      { p: 'Le forfait comprend l’ensemble des prestations de la formule Professionnel, appliquées à chaque élément du Périmètre : mises à jour, sauvegardes quotidiennes conservées 30 jours, monitoring de sécurité, surveillance automatique 24 heures sur 24, nettoyage après piratage sans limite, optimisation des performances, environnement de préproduction et rapport mensuel. S’y ajoutent les prestations suivantes.' },
      { ol: [
        '<strong>Infogérance serveur complète</strong> : administration des serveurs du Périmètre, mises à jour de sécurité du système, configuration du pare-feu, des certificats et des services, surveillance des ressources et gestion des incidents d’infrastructure.',
        '<strong>Intégration et déploiement continus</strong> : mise en place et entretien d’une chaîne de déploiement automatisée, avec tests, déploiement en préproduction puis en production, et retour arrière possible.',
        `<strong>Astreinte étendue</strong> sur les plages ${v.plages_astreinte}, pour les incidents bloquants.`,
        `<strong>Heures de développement incluses</strong> : ${v.heures_incluses} par mois, pour des évolutions ou corrections demandées par le Client. Les heures non utilisées ne sont pas reportées, sauf mention contraire du devis.`,
        `<strong>Interlocuteur dédié</strong> : ${v.interlocuteur}, qui suit le Périmètre, centralise les demandes et présente un point mensuel sur l’état de l’infrastructure.`
      ] }
    ] });
  } else {
    const liste = pro ? [
      '<strong>Mises à jour</strong> du CMS ou du framework, du thème, des extensions et des dépendances, testées d’abord sur l’environnement de préproduction quand le risque le justifie.',
      '<strong>Sauvegardes quotidiennes</strong> des fichiers et de la base de données, conservées 30 jours, avec restauration sur demande.',
      '<strong>Monitoring de sécurité</strong> : surveillance des failles connues, détection de code malveillant et durcissement de l’installation.',
      '<strong>Monitoring 24/7</strong> : surveillance automatique de la disponibilité et de la sécurité, 24 heures sur 24 et 7 jours sur 7, avec alerte au Prestataire en cas d’incident. La surveillance est continue ; l’intervention suit les délais de l’article « Niveaux de service ».',
      '<strong>Prise en charge prioritaire sous 4 heures ouvrées</strong> des incidents bloquants.',
      '<strong>Nettoyage après piratage sans limite</strong> : suppression du code malveillant, restauration d’une sauvegarde saine si nécessaire, changement des accès compromis et renforcement de la sécurité, autant de fois que nécessaire.',
      '<strong>Optimisation des performances</strong> : réglages réguliers du cache, compression des images, entretien de la base de données et suivi des temps de chargement.',
      '<strong>Modifications mineures incluses</strong>, dans la limite d’une heure cumulée par mois, non reportable d’un mois sur l’autre. Au-delà, sur devis.',
      '<strong>Environnement de préproduction</strong> pour tester les mises à jour et les modifications avant leur mise en ligne.',
      '<strong>Rapport mensuel</strong> des interventions, des incidents et des vérifications réalisées.'
    ] : [
      '<strong>Mises à jour</strong> : mise à jour du CMS, du thème et des extensions, avec vérification du bon fonctionnement du site après chaque mise à jour. Une mise à jour qui présente un risque connu de régression peut être reportée, le Client en est alors informé.',
      '<strong>Sauvegardes quotidiennes</strong> : sauvegarde automatique des fichiers et de la base de données, conservées 30 jours, avec restauration sur demande.',
      '<strong>Monitoring de sécurité</strong> : surveillance des failles connues, détection de code malveillant et durcissement de base de l’installation.',
      '<strong>Prise en charge sous 1 jour ouvré</strong> des incidents bloquants signalés.',
      '<strong>Nettoyage après piratage, une fois par année contractuelle</strong> : suppression du code malveillant, restauration d’une sauvegarde saine si nécessaire, changement des accès compromis et renforcement de la sécurité. Les nettoyages suivants sur la même année sont facturés sur devis.',
      '<strong>Rapport mensuel</strong> des interventions et vérifications réalisées sur le site.'
    ];
    A.push({ titre: 'Prestations incluses', blocs: [{ p: 'Pour un prix mensuel forfaitaire, le Prestataire réalise les prestations suivantes.' }, { ol: liste }] });
  }

  A.push({ titre: 'Prestations exclues', blocs: [
    { p: sm ? `Les prestations suivantes ne sont pas comprises dans le forfait. Elles peuvent être réalisées sur devis ou décomptées au taux de ${v.taux_horaire_ht} HT de l’heure.` : 'Les prestations suivantes ne sont pas comprises dans le forfait. Elles peuvent être réalisées sur devis accepté par le Client.' },
    { ul: sm ? [
      'Éléments ajoutés au Périmètre après la signature, tant qu’un avenant ne les intègre pas.', 'Heures de développement au-delà du volume inclus.',
      'Refonte, migration d’hébergeur ou d’architecture, et projets qui dépassent la maintenance.', 'Création ou rédaction de contenus, référencement et campagnes marketing.',
      'Coûts d’hébergement, de serveurs, de noms de domaine, de licences et de services tiers, à la charge du Client sauf mention contraire du devis.', 'Remise en état après une intervention d’un tiers sur le Périmètre.'
    ] : [
      'Création de pages, de fonctionnalités ou de modules.', pro ? 'Modifications dépassant l’heure mensuelle de modifications mineures.' : 'Modifications de contenu ou de mise en page.',
      'Refonte graphique et intégration de nouvelles maquettes.', 'Création ou rédaction de contenus : textes, visuels, articles.', 'Référencement et campagnes marketing.',
      'Développements spécifiques, migrations et gros chantiers techniques.', `Hébergement, nom de domaine${pro ? ', licences et services tiers payants' : ' et licences d’extensions payantes'}, qui restent à la charge du Client.`,
      `Remise en état après une intervention d’un tiers sur le ${pro ? 'Service' : 'site'}.`, pro ? 'Interventions en dehors des heures ouvrées, sauf accord préalable.' : 'Nettoyages après piratage au-delà de celui inclus chaque année.'
    ] }
  ] });

  A.push({ titre: 'Niveaux de service', blocs: [
    { table: { head: ['Engagement', `Formule ${nomFormule}`], rows: sm ? [
      ['Canal de signalement', 'Email à l’interlocuteur dédié ; téléphone pendant l’astreinte'], ['Prise en charge d’un incident bloquant', v.delai_prise_en_charge],
      ['Astreinte', v.plages_astreinte], ['Surveillance', 'Automatique, 24 heures sur 24, 7 jours sur 7'],
      ['Sauvegardes', 'Quotidiennes, conservées 30 jours, sauf durée plus longue au devis'], ['Heures de développement', `${v.heures_incluses} par mois`], ['Point de suivi', 'Mensuel, avec l’interlocuteur dédié']
    ] : pro ? [
      ['Canal de signalement', 'Email à contact@pixfeed.net'], ['Prise en charge d’un incident bloquant', 'Sous 4 heures ouvrées après le signalement ou l’alerte'],
      ['Horaires d’intervention', 'Heures ouvrées, 9 h à 18 h, heure de Paris'], ['Surveillance', 'Automatique, 24 heures sur 24, 7 jours sur 7'],
      ['Sauvegardes', 'Quotidiennes, conservées 30 jours'], ['Nettoyage après piratage', 'Sans limite'], ['Modifications mineures', '1 heure cumulée par mois, non reportable'], ['Rapport', 'Mensuel']
    ] : [
      ['Canal de signalement', 'Email à contact@pixfeed.net'], ['Prise en charge d’un incident bloquant', 'Sous 1 jour ouvré après le signalement'],
      ['Horaires couverts', 'Jours ouvrés, 9 h à 18 h, heure de Paris'], ['Sauvegardes', 'Quotidiennes, conservées 30 jours'],
      ['Nettoyage après piratage', '1 par année contractuelle'], ['Rapport', 'Mensuel']
    ] } },
    { p: `La prise en charge signifie le début du diagnostic, pas la résolution. Le Prestataire est tenu d’une obligation de moyens : il met en œuvre les compétences et le soin d’un professionnel pour rétablir le service dans les meilleurs délais.${sm ? ' Le décompte des heures est tenu à jour et joint au rapport mensuel.' : ''}` }
  ] });

  A.push({ titre: 'Obligations du Prestataire', blocs: [{ p: sm
    ? 'Le Prestataire réalise les prestations avec diligence et selon les règles de l’art. Il documente l’infrastructure et la chaîne de déploiement qu’il met en place, et tient cette documentation à la disposition du Client. Il prévient le Client avant toute opération susceptible d’interrompre le service et la planifie, sauf urgence, en dehors des heures de forte activité. Il conserve les accès confiés de manière sécurisée.'
    : `Le Prestataire réalise les prestations avec diligence et selon les règles de l’art.${pro ? ' Il teste les mises à jour risquées en préproduction avant leur mise en ligne.' : ''} Il informe le Client de toute anomalie importante constatée et de toute intervention ayant un effet visible. Il conserve les accès confiés de manière sécurisée et ne les utilise que pour l’exécution du contrat.` }] });

  A.push({ titre: 'Obligations du Client', blocs: [{ p: sm
    ? 'Le Client fournit les accès nécessaires aux serveurs, aux dépôts de code, aux comptes d’hébergement et aux services tiers. Il désigne un interlocuteur de son côté, joignable pendant l’astreinte pour les décisions urgentes. Il informe le Prestataire de toute modification qu’il ou un tiers apporte au Périmètre.'
    : `Le Client fournit et maintient à jour les accès nécessaires : administration, ${pro ? 'serveur ou hébergement, dépôt de code s’il existe' : 'hébergement'}, nom de domaine${pro ? ' et services tiers' : ''}. Il signale les incidents dès qu’il les constate et s’abstient de modifier le cœur technique du ${pro ? 'Service' : 'site'} sans en informer le Prestataire. Il reste responsable des contenus publiés, de son hébergement et du paiement des services tiers.` }] });

  const retard = 'En cas de retard de paiement, des pénalités sont dues de plein droit au taux de trois fois l’intérêt légal, ainsi qu’une indemnité forfaitaire de 40 € pour frais de recouvrement, conformément aux articles L. 441-10 et D. 441-5 du Code de commerce.';
  A.push({ titre: 'Prix et paiement', blocs: sm ? [
    { p: `Le forfait est de <strong>${v.prix} HT par mois</strong>, ${v.mention_tva}, conformément au devis ${v.devis_reference}. Il est payable d’avance, par prélèvement SEPA ou par carte bancaire, le ${v.jour_prelevement} de chaque mois, via la plateforme de paiement Stripe.` },
    { p: `Les heures réalisées au-delà du volume inclus sont facturées au taux de ${v.taux_horaire_ht} HT, après accord du Client sur l’estimation, et payées à 30 jours. Les interventions d’astreinte sont comprises dans le forfait dans la limite prévue au devis.` },
    { p: `${retard} Après une relance restée sans effet 15 jours, le Prestataire peut suspendre les prestations, hors sécurité et sauvegardes, jusqu’à régularisation.` },
    { p: 'Le prix peut être révisé une fois par an, avec un préavis de 60 jours par email. Le Client peut alors résilier le contrat sans frais avant la prise d’effet.' }
  ] : [
    { p: `Le prix est de <strong>${v.prix} HT par mois</strong>, ${v.mention_tva}. Il est payable d’avance, par prélèvement SEPA ou par carte bancaire, le ${v.jour_prelevement} de chaque mois, via la plateforme de paiement Stripe. Une facture est émise à chaque échéance.` },
    { p: 'Le premier mois est dû au démarrage des prestations. Les prestations ne commencent qu’après la mise en place du moyen de paiement.' },
    { p: `${retard} Après une relance restée sans effet 15 jours, le Prestataire peut suspendre les prestations jusqu’à régularisation.` },
    { p: 'Le prix peut être révisé une fois par an. Le Prestataire en informe le Client par email au moins 30 jours avant la prise d’effet. Le Client peut alors résilier le contrat sans frais avant cette date.' }
  ] });

  A.push({ titre: 'Durée et résiliation', blocs: sm ? [
    { p: `Le contrat prend effet le ${v.date_debut}, pour ${v.duree_engagement}. Il se poursuit ensuite pour une durée indéterminée.` },
    { p: 'Après la durée initiale, chaque partie peut résilier le contrat par email avec un préavis d’un mois. Pendant la durée initiale, la résiliation anticipée par le Client rend exigibles les mensualités restant à courir, sauf manquement grave du Prestataire.' },
    { p: 'En cas de manquement grave d’une partie, non corrigé 15 jours après une mise en demeure par email, l’autre partie peut résilier le contrat avec effet immédiat.' }
  ] : [
    { p: `Le contrat prend effet le ${v.date_debut} pour une durée indéterminée, <strong>sans engagement de durée</strong>. Il se renouvelle chaque mois par le paiement de l’échéance.` },
    { p: 'Chaque partie peut le résilier à tout moment par email. La résiliation prend effet à la fin de la période mensuelle en cours, sans remboursement au prorata.' },
    { p: 'En cas de manquement grave d’une partie, non corrigé 15 jours après une mise en demeure par email, l’autre partie peut résilier le contrat avec effet immédiat.' },
    { p: `À la fin du contrat, le Prestataire remet au Client, sur demande formulée dans les 30 jours, la dernière sauvegarde complète du ${pro ? 'Service et, si elle existe, une copie de l’environnement de préproduction' : 'site'}. Il lui rappelle de changer les accès qui lui avaient été confiés. Les sauvegardes détenues par le Prestataire sont ensuite supprimées.` }
  ] });

  if (sm) A.push({ titre: 'Réversibilité', blocs: [{ p: `À la fin du contrat, quelle qu’en soit la cause, le Prestataire accompagne la transition vers le Client ou le prestataire qu’il désigne. Il remet la dernière sauvegarde complète, la documentation de l’infrastructure et de la chaîne de déploiement, et la liste des accès à révoquer. Le transfert de connaissance est compris dans le forfait dans la limite d’un mois d’heures incluses ; au-delà, il est facturé au taux de ${v.taux_horaire_ht} HT. Les sauvegardes détenues par le Prestataire sont supprimées 30 jours après la remise.` }] });

  A.push({ titre: 'Responsabilité', blocs: [
    { p: 'La responsabilité du Prestataire ne peut être engagée qu’en cas de faute prouvée. Elle est limitée aux dommages directs et plafonnée au montant total payé par le Client au titre des 12 derniers mois du contrat.' },
    { p: `Le Prestataire n’est pas responsable des dommages indirects, tels que perte de chiffre d’affaires, de clientèle ou d’image. Il n’est pas non plus responsable des défaillances ${sm ? 'des hébergeurs, des fournisseurs de serveurs, des éditeurs de logiciels ou des services tiers' : pro ? 'de l’hébergeur, du registraire du nom de domaine, des éditeurs de logiciels ou des services tiers intégrés au Service' : 'de l’hébergeur, du registraire du nom de domaine ou des éditeurs d’extensions'}, ni des conséquences d’une modification faite par le Client ou un tiers.` }
  ] });

  const rgpd = [
    'ne traiter ces données que sur instruction documentée du Client et pour les seuls besoins du contrat ;',
    ...(pro ? ['limiter l’accès aux données, notamment aux contenus des utilisateurs, au strict nécessaire de chaque intervention ;', 'n’utiliser en préproduction que des données anonymisées ou fictives, sauf accord écrit du Client ;'] : []),
    'garantir la confidentialité des données et ne les copier qu’au sein des sauvegardes prévues ;',
    sm ? 'mettre en œuvre des mesures de sécurité adaptées : accès nominatifs, double authentification, chiffrement des sauvegardes, journalisation des accès aux serveurs ;'
      : 'mettre en œuvre des mesures de sécurité adaptées : accès nominatifs, mots de passe forts, double authentification lorsqu’elle est disponible, sauvegardes chiffrées ou stockées sur un espace privé ;',
    'informer le Client de tout recours à un sous-traitant ultérieur, notamment l’espace de stockage des sauvegardes, et lui permettre de s’y opposer ;',
    pro ? 'aider le Client à répondre aux demandes d’exercice des droits des personnes concernées et à réaliser, le cas échéant, une analyse d’impact ;' : 'aider le Client à répondre aux demandes d’exercice des droits des personnes concernées ;',
    'notifier au Client toute violation de données dans les 48 heures après en avoir pris connaissance ;',
    'supprimer ou restituer les données à la fin du contrat, selon le choix du Client ;',
    sm ? 'mettre à sa disposition les informations nécessaires pour démontrer le respect de ces obligations, et permettre un audit à ses frais, une fois par an, avec un préavis de 30 jours.'
      : 'mettre à sa disposition les informations nécessaires pour démontrer le respect de ces obligations.'
  ];
  A.push({ titre: 'Données personnelles', blocs: [
    { p: `Pour exécuter le contrat, le Prestataire ${pro ? 'accède' : 'peut accéder'} aux données personnelles ${sm ? 'traitées par le Périmètre' : pro ? 'traitées par le Service, notamment les comptes et contenus de ses utilisateurs' : 'contenues dans le site, par exemple les messages de contact ou les comptes d’utilisateurs'}. Le Client agit en qualité de responsable de traitement et le Prestataire en qualité de sous-traitant, au sens de l’article 28 du règlement général sur la protection des données.` },
    { p: 'Le Prestataire s’engage à :' }, { ul: rgpd }, { p: 'Le détail des traitements figure en annexe.' }
  ] });

  A.push({ titre: 'Confidentialité', blocs: [{ p: `Chaque partie garde confidentielles les informations de l’autre dont elle a connaissance pendant le contrat, notamment les accès, ${pro ? 'le code, ' : ''}${sm ? 'l’architecture, ' : ''}les données et les informations commerciales. Cette obligation dure pendant le contrat et ${sm ? 'trois' : 'deux'} ans après sa fin.` }] });
  A.push({ titre: 'Propriété', blocs: [{ p: sm
    ? 'Le Client reste propriétaire de son Périmètre, de son code, de ses contenus et de ses données. Les développements, configurations et scripts de déploiement réalisés pour lui lui appartiennent dès leur paiement. Les outils génériques et méthodes propres au Prestataire restent sa propriété ; le Client en reçoit un droit d’usage pour le Périmètre.'
    : `Le Client reste propriétaire de son ${pro ? 'Service, de son code' : 'site'}, de ses contenus et de ses données. Les outils, scripts et méthodes propres au Prestataire restent sa propriété.${pro ? ' Les modifications réalisées dans le cadre du contrat appartiennent au Client dès leur paiement.' : ''}` }] });
  A.push({ titre: 'Force majeure', blocs: [{ p: 'Aucune partie n’est responsable d’un retard ou d’une inexécution causé par un événement de force majeure au sens de l’article 1218 du Code civil.' }] });
  A.push({ titre: 'Droit applicable et litiges', blocs: [{ p: `Le contrat est soumis au droit français. En cas de différend, les parties recherchent d’abord une solution amiable pendant 30 jours. À défaut, le litige est porté devant ${v.tribunal}.` }] });
  return A;
}

function annexe(formule, v) {
  const pro = formule !== 'maintenance-essentiel';
  const sm = formule === 'maintenance-sur-mesure';
  return [
    ['Nature des opérations', sm ? 'Administration des serveurs, sauvegarde, restauration, surveillance, déploiement, tests en préproduction' : pro ? 'Accès technique, sauvegarde, restauration, surveillance, nettoyage après piratage, tests en préproduction' : 'Accès technique, sauvegarde, restauration, nettoyage après piratage'],
    ['Finalité', sm ? 'Maintenance, infogérance, sécurité et évolution du Périmètre' : `Maintenance, sécurité et continuité de ${v.service_url}`],
    ['Catégories de données', sm ? 'Celles traitées par le Périmètre, à lister par le Client avant signature' : pro ? 'Celles traitées par le Service : identité et coordonnées des utilisateurs, comptes, contenus déposés, commandes éventuelles' : 'Celles contenues dans le site : identité et coordonnées des visiteurs, messages, comptes d’utilisateurs'],
    ...(pro ? [['Données sensibles', 'À préciser par le Client avant signature']] : []),
    ['Personnes concernées', sm ? 'Utilisateurs, clients et salariés du Client, selon le Périmètre' : pro ? 'Utilisateurs, clients et visiteurs du Service' : 'Visiteurs, clients et utilisateurs du site'],
    ['Durée', sm ? 'Durée du contrat, puis 30 jours après la remise de réversibilité' : 'Durée du contrat, sauvegardes conservées 30 jours'],
    ['Lieu de stockage des sauvegardes', VIDE],
    ['Sous-traitants ultérieurs', VIDE]
  ];
}

// Valeurs injectées : tout est échappé ; un champ vide devient une ligne à compléter.
function valeurs(contract, infos, company) {
  const f = (x) => (String(x || '').trim() ? esc(String(x).trim()) : VIDE);
  const c = company || {};
  const adresse = [c.address, [c.postal_code, c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const siret = String(c.siret || '').replace(/\s+/g, '');
  const siretLisible = /^\d{14}$/.test(siret) ? `${siret.slice(0, 3)} ${siret.slice(3, 6)} ${siret.slice(6, 9)} ${siret.slice(9)}` : siret;
  const identite = [c.company_name || 'PixFeed', infos.prestataire_forme, siretLisible ? `SIRET ${siretLisible}` : null, adresse || null].filter(Boolean).join(', ');
  // Un hébergeur noté « inconnu » ou « à demander » devient une ligne à compléter.
  const hebergeur = /^\s*(inconnu|à demander|a demander|\?)/i.test(String(contract.hosting_provider || '')) ? '' : contract.hosting_provider;
  return {
    prestataire_identite: esc(identite),
    client_raison_sociale: f(infos.client_raison_sociale), client_forme_siret: f(infos.client_forme_siret),
    client_adresse: f(infos.client_adresse), client_representant: f(infos.client_representant),
    service_type: esc(infos.service_type || 'le site'), service_nom: f(contract.site_name), service_url: f(contract.site_url),
    technologie: f(infos.technologie), hebergeur: f(hebergeur),
    date_debut: f(formatDate(contract.contract_start_date)), prix: f(formatEur(contract.monthly_amount)),
    jour_prelevement: contract.billing_day ? esc(String(contract.billing_day)) : VIDE,
    mention_tva: f(infos.mention_tva || 'TVA en sus au taux en vigueur'),
    tribunal: esc(infos.tribunal || 'le tribunal compétent du ressort du siège du Prestataire'),
    date_signature: f(infos.date_signature),
    perimetre: f(infos.perimetre), devis_reference: f(infos.devis_reference), heures_incluses: f(infos.heures_incluses),
    taux_horaire_ht: f(infos.taux_horaire_ht), delai_prise_en_charge: f(infos.delai_prise_en_charge), plages_astreinte: f(infos.plages_astreinte),
    duree_engagement: f(infos.duree_engagement), interlocuteur: f(infos.interlocuteur)
  };
}

const CSS = `
:root{--purple:#8e44ad;--ink:#0f172a;--muted:#64748b;--line:#ddd5c8;--cream:#f5f0e8}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Plus Jakarta Sans',Arial,sans-serif;color:var(--ink);font-size:10.5pt;line-height:1.55;-webkit-font-smoothing:antialiased}
.page{padding:0 18mm}
.serif{font-family:'DM Serif Display',Georgia,serif}
.head{border-bottom:1px solid var(--line);padding-bottom:14px;margin-bottom:18px}
.kicker{font-size:8.5pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--purple)}
h1{font-size:24pt;line-height:1.1;margin:8px 0 6px}
.meta{font-size:9pt;color:var(--muted)}
h2{font-size:11.5pt;font-weight:700;margin:16px 0 6px;break-after:avoid}
h2 .num{color:var(--purple);margin-right:6px}
p{margin:0 0 7px;text-align:justify}
ul,ol{margin:0 0 8px 18px}
li{margin:0 0 4px}
table{width:100%;border-collapse:collapse;margin:4px 0 10px;font-size:9.5pt}
tr{break-inside:avoid}
th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{background:var(--cream);font-weight:700}
.parties p{text-align:left}
.blank{color:#94a3b8;letter-spacing:.05em}
.sign{margin-top:14px;break-inside:avoid}
.sign td{height:95px;width:50%}
.annexe{break-before:page}
`;

function bloc(b) {
  if (b.p) return `<p>${b.p}</p>`;
  if (b.ul) return `<ul>${b.ul.map((x) => `<li>${x}</li>`).join('')}</ul>`;
  if (b.ol) return `<ol>${b.ol.map((x) => `<li>${x}</li>`).join('')}</ol>`;
  if (b.table) return `<table><thead><tr>${b.table.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${b.table.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return '';
}

/**
 * HTML du contrat.
 * @param {object} contract  ligne maintenance_contracts (plan, site_name, site_url, monthly_amount, contract_start_date, billing_day, hosting_provider)
 * @param {object} infos     champs du formulaire « Contrat » (client, service, devis, prestataire)
 * @param {object} company   company_settings
 */
function renderHtml(contract, infos = {}, company = {}) {
  const { type } = maintenanceConditions(contract.plan);
  const v = valeurs(contract, infos, company);
  const nomFormule = type === 'maintenance-sur-mesure' ? 'Sur mesure' : type === 'maintenance-pro' ? 'Professionnel' : 'Essentiel';
  const pro = type !== 'maintenance-essentiel';
  const sm = type === 'maintenance-sur-mesure';
  const preambule = sm
    ? [`Le Client exploite une infrastructure numérique comprenant ${v.perimetre}. Il souhaite en confier au Prestataire la maintenance, l’infogérance et l’évolution, avec un niveau de service adapté à son activité.`,
      `Les besoins du Client ont été étudiés et chiffrés dans le devis ${v.devis_reference}, accepté par le Client et joint en annexe. En cas de contradiction, le présent contrat prévaut sur le devis, sauf pour le prix, les délais et les volumes, qui sont ceux du devis.`]
    : pro
      ? [`Le Client exploite ${v.service_type} ${v.service_nom}, accessible à l’adresse ${v.service_url}, développé avec ${v.technologie} et hébergé chez ${v.hebergeur}. Il souhaite confier au Prestataire sa maintenance technique, avec une prise en charge prioritaire des incidents.`,
        'Le Prestataire est développeur web indépendant, spécialisé dans la maintenance et le dépannage de sites et d’applications professionnels.']
      : [`Le Client exploite le site ${v.service_nom}, accessible à l’adresse ${v.service_url} et hébergé chez ${v.hebergeur}. Il souhaite confier au Prestataire la maintenance technique de ce site afin d’en assurer la mise à jour, la sauvegarde et la sécurité.`,
        'Le Prestataire est développeur web indépendant, spécialisé dans la maintenance et le dépannage de sites professionnels.'];
  const arts = articles(type, v).map((a, i) => `<h2><span class="num">Article ${i + 1}.</span>${a.titre}</h2>${a.blocs.map(bloc).join('')}`).join('');
  const annexeRows = annexe(type, v).map(([k, d]) => `<tr><td><strong>${k}</strong></td><td>${d}</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Contrat de maintenance ${esc(nomFormule)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body><div class="page">
<div class="head"><p class="kicker">Contrat de maintenance</p><h1 class="serif">Formule ${esc(nomFormule)}</h1>
<p class="meta">${v.service_nom} · ${v.service_url} · ${v.prix} HT par mois</p></div>
<div class="parties"><h2>Entre les soussignés</h2>
<p><strong>${v.prestataire_identite}</strong>, exerçant sous le nom commercial PixFeed, représenté par Marc Gueffie, ci-après « le Prestataire »,</p>
<p>et</p>
<p><strong>${v.client_raison_sociale}</strong>, ${v.client_forme_siret}, dont le siège est situé ${v.client_adresse}, représentée par ${v.client_representant}, ci-après « le Client ».</p></div>
<h2>Préambule</h2>${preambule.map((p) => `<p>${p}</p>`).join('')}<p>Les parties ont convenu de ce qui suit.</p>
${arts}
<div class="sign"><h2>Signatures</h2><p>Fait en deux exemplaires, électroniques ou papier, le ${v.date_signature}.</p>
<table><thead><tr><th>Pour le Prestataire</th><th>Pour le Client</th></tr></thead><tbody>
<tr><td>Marc Gueffie, PixFeed<br><br>Signature précédée de « Bon pour accord »</td><td>${v.client_representant}, ${v.client_raison_sociale}<br><br>Signature précédée de « Bon pour accord »</td></tr></tbody></table></div>
<div class="annexe">${sm ? `<h2>Annexe 1. Devis accepté</h2><p>Le devis ${v.devis_reference}, signé par le Client, est joint au présent contrat. Il fixe le Périmètre, le forfait, les heures incluses, le taux horaire, le délai de prise en charge, les plages d’astreinte et la durée d’engagement.</p>` : ''}
<h2>${sm ? 'Annexe 2' : 'Annexe'}. Détail des traitements de données</h2>
<table><thead><tr><th>Élément</th><th>Description</th></tr></thead><tbody>${annexeRows}</tbody></table></div>
</div></body></html>`;
}

async function renderPdf(contract, infos = {}, company = {}) {
  const html = renderHtml(contract, infos, company);
  return pdfService.generatePDF(html, {
    margin: { top: '16mm', bottom: '18mm', left: '0', right: '0' },
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;font-size:8px;color:#64748b;text-align:center;font-family:Arial,sans-serif">Contrat de maintenance PixFeed · page <span class="pageNumber"></span> sur <span class="totalPages"></span></div>'
  });
}

function nomFichier(contract, infos = {}) {
  const { label } = maintenanceConditions(contract.plan);
  const nom = String(infos.client_raison_sociale || contract.site_name || 'client').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'client';
  return `Contrat_Maintenance_${label}_${nom}.pdf`;
}

module.exports = { renderHtml, renderPdf, prefill, lireNotes, nomFichier, CHAMPS_CLIENT, CHAMPS_SERVICE, CHAMPS_DEVIS, CHAMPS_PRESTATAIRE };
