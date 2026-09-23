import mysql from 'mysql2/promise';
import fs from 'node:fs';

const uri = process.argv[2];

if (!uri) {
  console.log('\n❌ Veuillez fournir le Service URI Aiven.\nExemple : node setup-aiven.mjs "mysql://avnadmin:PASSWORD@mysql-5fd2566-mynameisyahnalain-349e.h.aivencloud.com:17188/defaultdb?ssl-mode=REQUIRED"\n');
  process.exit(1);
}

try {
  console.log(' Connexion à Aiven MySQL...');
  const connection = await mysql.createConnection({
    uri: uri.trim(),
    ssl: { rejectUnauthorized: false },
  });
  console.log(' Connexion réussie ! Création des tables...');

  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      username VARCHAR(80) NOT NULL,
      display_name VARCHAR(120) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('responsable') NOT NULL DEFAULT 'responsable',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY users_username_unique (username)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS feedbacks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      message TEXT NOT NULL,
      rating TINYINT UNSIGNED NULL,
      service VARCHAR(250) NULL,
      status ENUM('new', 'in_review', 'resolved') NOT NULL DEFAULT 'new',
      admin_note TEXT NULL,
      contact_email VARCHAR(200) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  console.log('\n✅ SUCCÈS : Les tables "feedbacks" et "users" ont été créées avec succès sur Aiven ! 🎉\n');
  await connection.end();
} catch (err) {
  console.error('\n❌ Erreur de connexion :', err.message, '\n');
}
