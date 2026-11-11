# Signatures des mails de netlinking, par site

Un fichier par site : `site-<site_id>.html` (jurojin.net : `site-2.html`). Il contient le HTML de la
signature de la boîte d'envoi, tel qu'il est réglé dans Roundcube (Paramètres > Identités > signature,
mode HTML : copier la source). Le CRM l'ajoute à chaque mail, après le corps ; elle n'est jamais saisie
dans le corps. Ces fichiers restent sur le serveur (ignorés par git). Sans ce fichier, l'envoi est refusé.
