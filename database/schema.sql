-- ============================================================
-- CyberGuard AI - MySQL Database Schema
-- Database: cyber_aggression
-- Import via phpMyAdmin (XAMPP)
-- ============================================================

CREATE DATABASE IF NOT EXISTS cyber_aggression_copy
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE cyber_aggression_copy;

-- ------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(100) DEFAULT NULL,
    profile_picture VARCHAR(255) DEFAULT NULL,
    bio             TEXT         DEFAULT NULL,
    status          ENUM('online','offline') NOT NULL DEFAULT 'offline',
    last_seen       DATETIME     DEFAULT CURRENT_TIMESTAMP,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- ADMINS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- FRIEND_REQUESTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friend_requests (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    sender      VARCHAR(50)  NOT NULL,
    receiver    VARCHAR(50)  NOT NULL,
    status      ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_friend_pair (sender, receiver),
    INDEX idx_fr_sender (sender),
    INDEX idx_fr_receiver (receiver),
    INDEX idx_fr_status (status),
    CONSTRAINT fk_fr_sender FOREIGN KEY (sender) REFERENCES users(username) ON DELETE CASCADE,
    CONSTRAINT fk_fr_receiver FOREIGN KEY (receiver) REFERENCES users(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- FRIENDSHIPS (accepted friends - derived from friend_requests)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friendships (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user1       VARCHAR(50) NOT NULL,
    user2       VARCHAR(50) NOT NULL,
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_friendship (user1, user2),
    INDEX idx_fs_user1 (user1),
    INDEX idx_fs_user2 (user2),
    CONSTRAINT fk_fs_user1 FOREIGN KEY (user1) REFERENCES users(username) ON DELETE CASCADE,
    CONSTRAINT fk_fs_user2 FOREIGN KEY (user2) REFERENCES users(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- CHAT_MESSAGES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    sender               VARCHAR(50)  NOT NULL,
    receiver             VARCHAR(50)  NOT NULL,
    message              TEXT         NOT NULL,
    message_type         ENUM('text') NOT NULL DEFAULT 'text',
    created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at         DATETIME     DEFAULT NULL,
    read_at              DATETIME     DEFAULT NULL,
    is_deleted           BOOLEAN      NOT NULL DEFAULT FALSE,
    deleted_for_everyone BOOLEAN      NOT NULL DEFAULT FALSE,
    INDEX idx_msg_sender (sender),
    INDEX idx_msg_receiver (receiver),
    INDEX idx_msg_created (created_at),
    INDEX idx_msg_pair (sender, receiver),
    CONSTRAINT fk_msg_sender FOREIGN KEY (sender) REFERENCES users(username) ON DELETE CASCADE,
    CONSTRAINT fk_msg_receiver FOREIGN KEY (receiver) REFERENCES users(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- ABUSERS (violation tracking)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS abusers (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    username       VARCHAR(50)  NOT NULL UNIQUE,
    violations     INT          NOT NULL DEFAULT 0,
    last_violation DATETIME     DEFAULT NULL,
    risk_level     ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'LOW',
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_abuser_username (username),
    INDEX idx_abuser_risk (risk_level),
    CONSTRAINT fk_abuser_user FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- BLOCKED_MESSAGES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blocked_messages (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    username       VARCHAR(50)  NOT NULL,
    receiver       VARCHAR(50)  DEFAULT NULL,
    message        TEXT         NOT NULL,
    classification VARCHAR(50)  NOT NULL DEFAULT 'AGGRESSIVE',
    confidence     FLOAT        NOT NULL DEFAULT 0.0,
    reason         VARCHAR(255) DEFAULT NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_bm_username (username),
    INDEX idx_bm_created (created_at),
    CONSTRAINT fk_bm_user FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- CHAT_READ_STATUS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_read_status (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    username             VARCHAR(50) NOT NULL,
    friend               VARCHAR(50) NOT NULL,
    last_read_message_id INT         DEFAULT 0,
    updated_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_read_pair (username, friend),
    INDEX idx_crs_username (username),
    INDEX idx_crs_friend (friend),
    CONSTRAINT fk_crs_user FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
    CONSTRAINT fk_crs_friend FOREIGN KEY (friend) REFERENCES users(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- NOTIFICATIONS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(50)  NOT NULL,
    type        VARCHAR(50)  NOT NULL,
    title       VARCHAR(255) NOT NULL,
    message     VARCHAR(500) DEFAULT NULL,
    is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notif_username (username),
    INDEX idx_notif_read (is_read),
    CONSTRAINT fk_notif_user FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- USER_ACTIVITY (login/logout tracking)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_activity (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(50) NOT NULL,
    action      VARCHAR(50) NOT NULL,
    ip_address  VARCHAR(45) DEFAULT NULL,
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ua_username (username),
    INDEX idx_ua_created (created_at),
    CONSTRAINT fk_ua_user FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE conversation_clears (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    other_username VARCHAR(100) NOT NULL,
    cleared_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_clear (
        username,
        other_username
    )
);


-- ------------------------------------------------------------
-- Default admin (password: admin123)
-- The hash is generated by Werkzeug's generate_password_hash
-- This is a pbkdf2:sha256 hash of "admin123"
-- ------------------------------------------------------------
INSERT INTO admins (username, password_hash) VALUES
('admin', 'pbkdf2:sha256:600000$W4CyGuard$9e8a0c7b3d2f1e6a5c4b3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1')
ON DUPLICATE KEY UPDATE username = username;
