# Mise en ligne gratuite

## Architecture

- Frontend React/Vite : Vercel.
- API Node/Express : Render.
- Base MySQL compatible : TiDB Cloud Serverless.

Le niveau gratuit de Render peut mettre l'API en veille après une période sans trafic. Le premier chargement peut donc prendre quelques secondes. Une disponibilité garantie nécessite un hébergement payant.

## 1. Créer la base en ligne

1. Créer un compte TiDB Cloud.
2. Créer un cluster Serverless gratuit.
3. Ouvrir le SQL Editor.
4. Coller le contenu de `database/schema.sql`.
5. Conserver les paramètres MySQL fournis : hôte, utilisateur, mot de passe, port et base `code`.

## 2. Publier l'API sur Render

1. Pousser ce dossier sur un dépôt GitHub privé ou public.
2. Sur Render, choisir **New > Web Service**, puis sélectionner le dépôt.
3. Paramètres :
   - Runtime : `Node`
   - Build command : `npm install`
   - Start command : `npm run api`
   - Instance : `Free`
4. Ajouter ces variables d'environnement Render :

```text
DB_HOST=<hote-tidb>
DB_USERNAME=<utilisateur-tidb>
DB_PASSWORD=<mot-de-passe-tidb>
DB_DATABASE=code
DB_SSL=true
ADMIN_PASSWORD=<mot-de-passe-admin-long-et-unique>
```

5. Ajouter le certificat ou les options SSL demandées par le fournisseur MySQL si nécessaire.
6. Tester l'URL Render : `https://<nom-api>.onrender.com/api/health` doit répondre avec `ok: true`.

## 3. Publier le f
   - Framework : `Vite`
   - Build command : `npm run build`
   - Output directory : `dist`
3. Ajouter ces variables d'environnement Vercel :

```text
VITE_API_BASE_URL=https://<nom-api>.onrender.com
VITE_PUBLIC_URL=https://<nom-frontend>.vercel.app
```

4. Déployer.
5. Régénérer le QR depuis `/admin` après le déploiement. Il doit afficher l'URL Vercel, jamais `127.0.0.1` ni `192.168.x.x`.

## 4. Livrer l'accès au responsable

- Transmettre au responsable uniquement l'URL `/admin` et le mot de passe défini dans `ADMIN_PASSWORD`.
## Deploiement

Le deploiement recommande est Netlify avec Netlify Functions et TiDB Cloud. Il evite la mise en veille de Render et utilise le meme domaine pour le formulaire patient et le dashboard admin.

Suivre [NETLIFY.md](NETLIFY.md) pour les variables d'environnement, la base de donnees et les tests de livraison.
## 5. Vérification avant livraison

1. Scanner le QR avec un téléphone qui n'est pas connecté au Wi-Fi du PC.
2. Envoyer un avis test.
3. Ouvrir `/admin` sur le téléphone du responsable.
4. Vérifier que l'avis apparaît.
5. Télécharger le CSV.
6. Tester le formulaire déjà ouvert en mode avion : il conserve l'avis et le transmet au retour de la connexion.
7. Remplacer le mot de passe de démonstration par une valeur longue et privée.

## Limite du hors connexion

Un QR ne peut pas ouvrir un site qui n'a jamais été chargé sans aucun réseau. Le téléphone doit avoir ouvert la fiche au moins une fois, ou l'établissement doit fournir un Wi-Fi local. Après le premier chargement, la PWA peut conserver la fiche et mettre les avis en attente jusqu'au retour d'Internet.
