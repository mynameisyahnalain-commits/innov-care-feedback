CREATE DATABASE IF NOT EXISTS `code` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `code`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(80) NOT NULL,
  `display_name` VARCHAR(120) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('responsable') NOT NULL DEFAULT 'responsable',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_username_unique` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `feedbacks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `submission_id` BIGINT UNSIGNED NULL,
  `comment_index` SMALLINT UNSIGNED NULL,
  `message` TEXT NOT NULL,
  `rating` TINYINT UNSIGNED NULL,
  `service` VARCHAR(250) NULL,
  `status` ENUM('new', 'in_review', 'resolved') NOT NULL DEFAULT 'new',
  `admin_note` TEXT NULL,
  `contact_email` VARCHAR(200) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `archived_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_feedbacks_submission_id` (`submission_id`),
  KEY `idx_feedbacks_created_at` (`created_at`),
  KEY `idx_feedbacks_service` (`service`),
  KEY `idx_feedbacks_status` (`status`),
  KEY `idx_feedbacks_rating` (`rating`),
  KEY `idx_feedbacks_archived_at` (`archived_at`),
  CONSTRAINT `feedbacks_rating_check` CHECK (`rating` IS NULL OR (`rating` BETWEEN 1 AND 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `feedback_submissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `message` TEXT NOT NULL,
  `comments_json` JSON NULL,
  `contact_email` VARCHAR(200) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_feedback_submissions_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
