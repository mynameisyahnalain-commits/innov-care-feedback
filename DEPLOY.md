# 🚀 Guide d'Hébergement Gratuit & Rapide

Ce guide vous explique comment héberger gratuitement et en quelques minutes l'application **Maison de Santé Innov Care** pour que n'importe quel patient puisse scanner le QR Code depuis son smartphone, n'importe où dans le monde.

---

## 🌟 Option 1 : Hébergement Gratuit sur Render.com (Recommandé - 5 minutes)

[Render.com](https://render.com) permet d'héberger le frontend et l'API Node.js gratuitement avec une adresse HTTPS sécurisée (ex: `https://innov-care.onrender.com`).

### Étapes :
1. **Créez un compte gratuit sur GitHub** et déposez votre projet sur un dépôt (*repository*).
2. Connectez-vous sur [Render.com](https://dashboard.render.com).
3. Cliquez sur **New +** → **Web Service**.
4. Sélectionnez votre dépôt GitHub `Qr.Code`.
5. Remplissez les paramètres suivants :
   * **Name** : `innov-care-feedback`
   * **Environment** : `Node`
   * **Build Command** : `npm install && npm run build`
   * **Start Command** : `node server.mjs`
6. Dans la section **Environment Variables** (Variables d'environnement), ajoutez :
   * `NODE_ENV` = `production`
   * `ADMIN_PASSWORD` = `innov-care-2026`
   * `SUPER_ADMIN_PASSWORD` = `innov-super-2026`
   * `DB_HOST` = *(adresse de votre base MySQL hébergée)*
   * `DB_USERNAME` = *(nom d'utilisateur)*
   * `DB_PASSWORD` = *(mot de passe)*
   * `DB_DATABASE` = *(nom de la base)*
7. Cliquez sur **Create Web Service**. 

🎉 Votre site sera en ligne avec son lien HTTPS sécurisé !

---

## 🗄️ Base de données MySQL Gratuite

Pour la base de données MySQL en ligne :
* **[Aiven.io](https://aiven.io)** (Offre gratuite MySQL 1 Go - très rapide et sans carte de crédit).
* **[Railway.app](https://railway.app)** (Offre gratuite avec MySQL).

Une fois la base créée sur Aiven ou Railway, exécutez-y simplement le fichier `database/schema.sql` pour créer les tables.

---

## 📲 Scanner le QR Code une fois Hébergé

Une fois le site hébergé sur internet (ex: `https://innov-care-feedback.onrender.com`) :
1. Rendez-vous sur votre espace d'administration `/admin`.
2. Cliquez sur **📲 QR Code à scanner**.
3. Le QR Code encodera directement votre adresse internet HTTPS officielle.
4. **Scannez-le depuis n'importe quel smartphone** : le formulaire s'ouvrira immédiatement, sans aucun réglage Wi-Fi ni blocage de pare-feu !
