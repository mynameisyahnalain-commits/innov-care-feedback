# Hébergement complet sur un VPS one.com

Cette configuration place l'application Node.js, la base MySQL et le HTTPS sur un même VPS one.com. Render et Aiven peuvent rester actifs pendant la préparation et les tests.

## 1. Commander le bon produit

Choisir un **VPS Linux / Cloud Server one.com**, avec Ubuntu 24.04 et au moins 2 Go de RAM. Un hébergement web mutualisé one.com ne permet pas de faire fonctionner durablement le serveur Node.js de cette application.

Dans le panneau one.com, terminer la configuration du VPS et noter :

- son adresse IPv4 ;
- le nom de domaine ou sous-domaine destiné à l'application ;
- l'utilisateur SSH et son mot de passe initial.

Ne pas changer les DNS à cette étape.

## 2. Installer Docker sur le VPS

Se connecter au VPS :

```bash
ssh administrator@ADRESSE_IP_DU_VPS
```

Installer Git et Docker :

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Se déconnecter puis se reconnecter en SSH pour activer le groupe Docker.

## 3. Installer l'application sans interrompre Render

```bash
sudo mkdir -p /opt/innovcare
sudo chown "$USER":"$USER" /opt/innovcare
git clone https://github.com/mynameisyahnalain-commits/innov-care-feedback /opt/innovcare
cd /opt/innovcare
cp .env.onecom.example .env.onecom
nano .env.onecom
```

Remplacer toutes les valeurs `REMPLACER_...`. `DOMAIN` doit contenir le domaine exact, par exemple `avis.maisoninnovcare.com`.

Construire et démarrer :

```bash
docker compose --env-file .env.onecom -f compose.onecom.yml up -d --build
docker compose --env-file .env.onecom -f compose.onecom.yml ps
docker compose --env-file .env.onecom -f compose.onecom.yml logs --tail=100 application
docker compose --env-file .env.onecom -f compose.onecom.yml exec -T application \
  wget -qO- http://127.0.0.1:3000/api/health
```

Le dernier appel doit retourner `{"ok":true,...}`. À ce stade, le site Render reste entièrement opérationnel.

## 4. Copier les données Aiven

Depuis le VPS, installer le client MySQL :

```bash
sudo apt-get install -y mysql-client
```

Créer l'export en remplaçant les valeurs Aiven affichées dans **Aiven > Service MySQL > Connection information** :

```bash
mysqldump --ssl-mode=REQUIRED --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF \
  -h HOTE_AIVEN -P PORT_AIVEN -u UTILISATEUR_AIVEN -p NOM_BASE_AIVEN \
  > /tmp/innovcare-aiven.sql
```

Importer dans MySQL one.com :

```bash
docker compose --env-file .env.onecom -f compose.onecom.yml exec -T database \
  sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  < /tmp/innovcare-aiven.sql

docker compose --env-file .env.onecom -f compose.onecom.yml restart application
docker compose --env-file .env.onecom -f compose.onecom.yml exec -T application \
  wget -qO- http://127.0.0.1:3000/api/health
```

Faire cette copie une première fois pour les tests. Juste avant la bascule finale, refaire un export/import pendant une courte période sans nouvelle saisie patient afin de ne perdre aucun avis reçu entre les deux copies.

## 5. Tester avec un sous-domaine

Dans **one.com > Domaine > Paramètres DNS**, créer un enregistrement `A` :

```text
Nom   : avis-test
Valeur: ADRESSE_IP_DU_VPS
TTL   : 300
```

Mettre `DOMAIN=avis-test.votre-domaine.com` dans `.env.onecom`, puis relancer Caddy :

```bash
docker compose --env-file .env.onecom -f compose.onecom.yml up -d
```

Tester le formulaire patient, `/admin`, `/super-admin`, l'envoi d'un avis de test et sa suppression.

## 6. Bascule finale

1. Choisir une heure calme.
2. Refaire l'export Aiven et l'import MySQL one.com.
3. Dans `.env.onecom`, remplacer le domaine de test par le domaine définitif.
4. Modifier l'enregistrement DNS `A` du domaine définitif vers l'IPv4 du VPS.
5. Relancer `docker compose --env-file .env.onecom -f compose.onecom.yml up -d`.
6. Vérifier `https://VOTRE_DOMAINE/api/health`, le formulaire et les deux espaces d'administration.
7. Conserver Render et Aiven pendant 48 heures avant de les arrêter.

Caddy obtient et renouvelle automatiquement le certificat HTTPS une fois le DNS dirigé vers le VPS.

## 7. Sauvegardes et mises à jour

Créer une sauvegarde manuelle :

```bash
chmod +x deploy/onecom/backup.sh
./deploy/onecom/backup.sh
```

Ajouter ensuite une sauvegarde quotidienne dans `crontab -e` :

```cron
15 2 * * * /opt/innovcare/deploy/onecom/backup.sh >> /var/log/innovcare-backup.log 2>&1
```

Télécharger régulièrement les sauvegardes hors du VPS. L'option Backups de one.com peut aussi créer une sauvegarde quotidienne complète du serveur.

Pour publier une future mise à jour :

```bash
cd /opt/innovcare
git pull --ff-only
docker compose --env-file .env.onecom -f compose.onecom.yml up -d --build
curl https://VOTRE_DOMAINE/api/health
```
