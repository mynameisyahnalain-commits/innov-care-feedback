# Deploiement Netlify

## Architecture

- Frontend React/Vite : Netlify.
- API : Netlify Functions dans `netlify/functions/api.mjs`.
- Base de donnees : TiDB Cloud Serverless.
- Frontend et API utilisent le meme domaine via `/api`.

Cette architecture evite la mise en veille de Render et empeche le formulaire patient et le dashboard admin de pointer vers deux APIs differentes.

## 1. Base de donnees

Dans TiDB Cloud, ouvrir SQL Editor et executer [database/schema.sql](database/schema.sql). Pour une base existante, executer aussi :

```sql
ALTER TABLE feedbacks MODIFY service VARCHAR(250) NULL;
```

La table `users` est necessaire pour les comptes responsables.

## 2. Deploiement

1. Pousser ce dossier dans un depot GitHub.
2. Dans Netlify, choisir `Add new site` puis `Import an existing project`.
3. Selectionner le depot.
4. Netlify lit automatiquement `netlify.toml`.
5. Ajouter ces variables dans Site configuration > Environment variables :

```text
DB_HOST=<hote-tidb>
DB_PORT=4000
DB_USERNAME=<utilisateur-tidb>
DB_PASSWORD=<mot-de-passe-tidb>
DB_DATABASE=code
DB_SSL=true
ADMIN_PASSWORD=<mot-de-passe-admin-long-et-unique>
SUPER_ADMIN_PASSWORD=<mot-de-passe-super-admin-long-et-unique>
```

Ne pas definir `VITE_API_BASE_URL` en production : l'application utilise `/api` sur le meme domaine Netlify.

## 3. Verification

Apres le deploiement, tester :

```text
https://<nom-du-site>.netlify.app/api/health
https://<nom-du-site>.netlify.app/
https://<nom-du-site>.netlify.app/admin
https://<nom-du-site>.netlify.app/super-admin
```

Faire un avis test avec plusieurs services, puis ouvrir `/admin`. Le message doit apparaitre dans la liste. Supprimer ensuite l'avis de test directement dans TiDB Cloud si necessaire.

## 4. Comptes

Le super administrateur cree les comptes responsables depuis `/super-admin`. Les responsables se connectent depuis `/admin` avec leur identifiant et leur mot de passe. Les avis patients restent en lecture seule.
