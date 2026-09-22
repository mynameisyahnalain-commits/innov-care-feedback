# Maison de Sante Innov Care - avis QR

Application React/Vite compatible Laragon. Le formulaire patient est accessible sur `/`. Le QR doit pointer vers cette adresse uniquement.

## Laragon

1. La base MySQL `code` et la table `feedbacks` ont été créées dans Laragon. Si besoin, rejouer [database/schema.sql](database/schema.sql) dans HeidiSQL.
2. Démarrer Apache et MySQL dans Laragon.
3. Ouvrir `http://localhost/Qr.Code/`.

Le frontend React utilise l'API locale pour enregistrer les avis dans la base `code`. Le patient peut sélectionner plusieurs services et envoyer une seule remarque globale pour l'ensemble de sa visite. L'espace responsable est disponible sur `/admin` et permet de lire les remarques et de télécharger un fichier CSV complet.

Pour une base existante, appliquer cette migration avant le déploiement : `ALTER TABLE feedbacks MODIFY service VARCHAR(250) NULL;`. Le schéma neuf contient déjà cette largeur.

L'espace super administrateur est disponible sur `/super-admin`. Il est protégé par `SUPER_ADMIN_PASSWORD` et permet de consulter les indicateurs système, voir tous les avis en lecture seule, créer des comptes responsables et modifier leurs mots de passe. Les avis envoyés par les patients ne peuvent pas être modifiés ou supprimés depuis cet espace.

En production, ajouter `SUPER_ADMIN_PASSWORD` dans les variables d'environnement Render avec une valeur longue et différente de `ADMIN_PASSWORD`, puis redéployer l'API. Ajouter aussi la même variable dans l'environnement local si l'espace super administrateur doit être testé sur Laragon.

Le QR doit utiliser l'adresse réseau du PC, par exemple `http://192.168.1.26:5173/`, afin qu'un téléphone connecté au même Wi-Fi ouvre directement le formulaire. Le téléphone ne reçoit aucune interface QR.

> Le QR est généré localement par React avec `qrcode.react`, sans service distant.
