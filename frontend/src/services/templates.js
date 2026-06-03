// src/services/templates.js

/**
 * Service de gestion des templates de notes et emails prédéfinis
 * Permet d'insérer rapidement des modèles de texte dans les formulaires
 */

export const templateCategories = {
  LEAD: 'lead',
  CLIENT: 'client',
  PROJECT: 'project',
  INTERACTION: 'interaction',
  EMAIL: 'email'
};

/**
 * Templates prédéfinis organisés par catégorie
 */
export const templates = {
  // Templates pour les Leads
  [templateCategories.LEAD]: [
    {
      id: 'lead-first-contact',
      name: 'Premier contact',
      category: 'lead',
      content: `Premier contact - ${new Date().toLocaleDateString('fr-FR')}

Contact établi avec : [Nom du contact]
Entreprise : [Nom de l'entreprise]
Poste : [Fonction]

Besoin exprimé :
-

Budget estimé :
Échéance :

Prochaine étape :
-

Notes complémentaires :
`
    },
    {
      id: 'lead-qualification',
      name: 'Qualification du lead',
      category: 'lead',
      content: `Qualification - ${new Date().toLocaleDateString('fr-FR')}

BANT Analysis :
Budget : [Montant estimé]
Authority : [Décideur identifié : Oui/Non]
Need : [Besoin principal]
Timing : [Échéance projet]

Pain Points :
-
-

Opportunité :
Probabilité de conversion : [%]
Valeur estimée : [€]

Actions à mener :
-
`
    },
    {
      id: 'lead-meeting-notes',
      name: 'Notes de réunion',
      category: 'lead',
      content: `Réunion - ${new Date().toLocaleDateString('fr-FR')}

Participants :
-
-

Objectif de la réunion :


Points discutés :
1.
2.
3.

Décisions prises :
-

Actions à suivre :
- [ ]
- [ ]

Prochaine réunion : [Date]
`
    },
    {
      id: 'lead-lost',
      name: 'Lead perdu - Analyse',
      category: 'lead',
      content: `Lead perdu - ${new Date().toLocaleDateString('fr-FR')}

Raison de la perte :
[ ] Prix trop élevé
[ ] Concurrent choisi
[ ] Projet reporté/annulé
[ ] Pas de réponse
[ ] Autre :

Concurrent retenu (si connu) :


Leçons apprises :
-

Opportunité de reconversion future : [Oui/Non]
Relance prévue le :
`
    }
  ],

  // Templates pour les Clients
  [templateCategories.CLIENT]: [
    {
      id: 'client-onboarding',
      name: 'Onboarding client',
      category: 'client',
      content: `Nouveau client - ${new Date().toLocaleDateString('fr-FR')}

Documents reçus :
- [ ] Contrat signé
- [ ] Conditions générales acceptées
- [ ] Informations de facturation
- [ ] Brief projet

Accès fournis :
- [ ]
- [ ]

Planning de démarrage :
- Kick-off meeting : [Date]
- Livraison prévue : [Date]

Contact principal :
Nom :
Email :
Téléphone :

Notes :
`
    },
    {
      id: 'client-meeting-report',
      name: 'Compte-rendu réunion client',
      category: 'client',
      content: `Compte-rendu réunion - ${new Date().toLocaleDateString('fr-FR')}

Client : [Nom]
Participants : [Liste]
Durée : [Durée]

Ordre du jour :
1.
2.
3.

Synthèse des échanges :


Décisions validées :
-
-

Points d'attention :
-

Prochaines étapes :
- [ ]
- [ ]

Prochaine réunion : [Date et heure]
`
    },
    {
      id: 'client-issue',
      name: 'Signalement problème',
      category: 'client',
      content: `Incident client - ${new Date().toLocaleDateString('fr-FR')}

Nature du problème :
Priorité : [ ] Faible [ ] Moyenne [ ] Élevée [ ] Critique

Description :


Impact :
-

Actions correctives :
1.
2.

Responsable :
Date de résolution prévue :

Statut : [ ] En cours [ ] Résolu [ ] En attente client
`
    }
  ],

  // Templates pour les Projets
  [templateCategories.PROJECT]: [
    {
      id: 'project-kickoff',
      name: 'Kick-off projet',
      category: 'project',
      content: `Lancement projet - ${new Date().toLocaleDateString('fr-FR')}

Objectif du projet :


Périmètre :
-
-

Équipe projet :
- Chef de projet :
- Développeurs :
- Designer :

Jalons principaux :
1. [Date] -
2. [Date] -
3. [Date] - Livraison finale

Contraintes identifiées :
-

Budget alloué :
`
    },
    {
      id: 'project-status',
      name: 'Point d\'avancement',
      category: 'project',
      content: `Point d'avancement - ${new Date().toLocaleDateString('fr-FR')}

Avancement global : [%]

Réalisé cette semaine :
-
-

En cours :
-
-

Prévu semaine prochaine :
-
-

Risques identifiés :
-

Besoins / Blocages :
-

Budget consommé : [%]
Respect du planning : [ ] Oui [ ] Retard de [X jours]
`
    },
    {
      id: 'project-delivery',
      name: 'Livraison projet',
      category: 'project',
      content: `Livraison projet - ${new Date().toLocaleDateString('fr-FR')}

Livrables :
- [ ]
- [ ]
- [ ]

Tests effectués :
- [ ] Tests fonctionnels
- [ ] Tests de performance
- [ ] Tests utilisateurs
- [ ] Documentation

Formation réalisée : [ ] Oui [ ] Non
Date formation :

Points de vigilance :
-

Garantie / Support :
Durée :
Contact support :

Retours client :
Satisfaction : [ ] Excellent [ ] Bien [ ] Moyen [ ] Insuffisant
`
    }
  ],

  // Templates pour les Interactions
  [templateCategories.INTERACTION]: [
    {
      id: 'interaction-call',
      name: 'Note d\'appel',
      category: 'interaction',
      content: `Appel téléphonique - ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}

Interlocuteur :
Durée : [minutes]

Objet de l'appel :


Points abordés :
-
-

Accords / Engagements :
-

Actions décidées :
- [ ]

Relance prévue :
`
    },
    {
      id: 'interaction-email-sent',
      name: 'Email envoyé',
      category: 'interaction',
      content: `Email envoyé - ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}

Destinataire :
Objet :

Résumé :


Documents joints :
-

Réponse attendue avant le :
Relance si pas de réponse :
`
    }
  ],

  // Templates d'emails
  [templateCategories.EMAIL]: [
    {
      id: 'email-proposal',
      name: 'Email de proposition commerciale',
      category: 'email',
      content: `Objet : Proposition commerciale pour [Nom du projet]

Bonjour [Prénom],

Suite à notre échange du [date], j'ai le plaisir de vous transmettre notre proposition pour [brève description du projet].

Nous avons identifié les besoins suivants :
-
-

Notre proposition comprend :
1.
2.
3.

Investissement : [Montant] HT
Délai de réalisation : [Durée]

Je reste à votre disposition pour échanger sur cette proposition et répondre à vos questions.

Je vous propose un rendez-vous [suggérer date et heure] pour en discuter.

Cordialement,
[Votre nom]
`
    },
    {
      id: 'email-followup',
      name: 'Email de relance',
      category: 'email',
      content: `Objet : Relance - [Sujet]

Bonjour [Prénom],

Je me permets de revenir vers vous concernant [sujet/projet].

Je n'ai pas eu de retour suite à mon email du [date] et souhaitais savoir si vous aviez pu consulter [proposition/devis/document].

Êtes-vous disponible pour un point cette semaine ? Je suis libre [proposer créneaux].

N'hésitez pas si vous avez des questions.

Cordialement,
[Votre nom]
`
    },
    {
      id: 'email-thankyou',
      name: 'Email de remerciement',
      category: 'email',
      content: `Objet : Merci pour votre confiance

Bonjour [Prénom],

Je tenais à vous remercier pour votre confiance et pour avoir choisi de collaborer avec nous sur [projet].

Nous sommes ravis de travailler ensemble et mettrons tout en œuvre pour répondre à vos attentes.

Comme convenu, [prochaine étape] est prévu(e) le [date].

Je reste à votre écoute pour toute question.

À très bientôt,
[Votre nom]
`
    },
    {
      id: 'email-meeting-request',
      name: 'Demande de rendez-vous',
      category: 'email',
      content: `Objet : Rendez-vous - [Sujet]

Bonjour [Prénom],

Je souhaiterais organiser un rendez-vous avec vous pour [objectif de la réunion].

Seriez-vous disponible pour un échange de [durée] l'une de ces dates :
- [Date et heure option 1]
- [Date et heure option 2]
- [Date et heure option 3]

Le rendez-vous pourrait avoir lieu [en visio/dans nos bureaux/dans vos locaux].

Ordre du jour proposé :
1.
2.
3.

Dans l'attente de votre retour,

Cordialement,
[Votre nom]
`
    }
  ]
};

/**
 * Récupère tous les templates d'une catégorie
 * @param {string} category - Catégorie de templates
 * @returns {Array} Liste des templates
 */
export const getTemplatesByCategory = (category) => {
  return templates[category] || [];
};

/**
 * Récupère un template par son ID
 * @param {string} templateId - ID du template
 * @returns {Object|null} Template trouvé ou null
 */
export const getTemplateById = (templateId) => {
  for (const category in templates) {
    const template = templates[category].find(t => t.id === templateId);
    if (template) return template;
  }
  return null;
};

/**
 * Récupère tous les templates disponibles
 * @returns {Array} Tous les templates
 */
export const getAllTemplates = () => {
  return Object.values(templates).flat();
};

/**
 * Remplace les variables dans un template
 * @param {string} content - Contenu du template
 * @param {Object} variables - Variables à remplacer {clé: valeur}
 * @returns {string} Contenu avec variables remplacées
 */
export const fillTemplate = (content, variables = {}) => {
  let result = content;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\[${key}\\]`, 'gi');
    result = result.replace(regex, value);
  }
  return result;
};

export default {
  templateCategories,
  templates,
  getTemplatesByCategory,
  getTemplateById,
  getAllTemplates,
  fillTemplate
};
