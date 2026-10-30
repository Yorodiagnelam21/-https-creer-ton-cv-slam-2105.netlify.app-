# Configuration des statistiques

## Mise en ligne sur Netlify

Le tableau de bord utilise une Netlify Function et Netlify Blobs. Le déploiement doit inclure `netlify.toml`, `package.json` et `netlify/functions/stats.mjs`; un simple hébergement de fichiers statiques ne suffit pas.

1. Connecte ce projet à ton site Netlify avec le déploiement Git, ou déploie-le avec Netlify CLI.
2. Dans les variables d’environnement du site Netlify, ajoute :
   - `CV_ADMIN_USERNAME` : l’identifiant choisi.
   - `CV_ADMIN_PASSWORD` : un mot de passe unique d’au moins 16 caractères.
   - `CV_ADMIN_SESSION_SECRET` : une valeur aléatoire secrète d’au moins 32 caractères.
3. Redéploie le site après avoir configuré ces variables.
4. Ouvre `/statisticCV.html` sur le domaine du site pour te connecter.

Ne place jamais ces valeurs dans un fichier HTML, JavaScript, dépôt Git ou message public. La page n’est pas secrète par son adresse : c’est la fonction serveur qui protège les statistiques.

## Compteurs

- **Visites (sessions)** : une visite par session de navigateur et par jour. Ce nombre ne représente pas des personnes uniques garanties.
- **Clics sur les liens** : sessions ayant cliqué sur au moins un lien HTML de la page principale, comptées une fois par session et par jour.
- **Sessions avec modification d’un CV** : une session comptée lors de la première modification d’un champ, par jour.
- **Demandes de téléchargement** : sessions ayant lancé le parcours de téléchargement, comptées une fois par session et par jour. Le navigateur ne permet pas de confirmer que le fichier a effectivement été enregistré.

Le site ne transmet ni nom, ni coordonnées, ni contenu du CV au service de statistiques. Les compteurs sont agrégés dans Netlify Blobs et sont accessibles à l’administrateur après connexion.
