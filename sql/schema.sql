-- CM-IMAP Email Client Database Schema
-- MySQL 5.7+ / MariaDB 10.3+

SET FOREIGN_KEY_CHECKS = 0;
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO';

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    username        VARCHAR(50) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('user','admin') NOT NULL DEFAULT 'user',
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- EMAIL ACCOUNTS (per user, multiple allowed)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_accounts (
    id                      INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id                 INT UNSIGNED NOT NULL,
    display_name            VARCHAR(100) NOT NULL,
    email_address           VARCHAR(255) NOT NULL,
    -- IMAP
    imap_host               VARCHAR(255) NOT NULL,
    imap_port               SMALLINT UNSIGNED NOT NULL DEFAULT 993,
    imap_encryption         ENUM('ssl','tls','starttls','none') NOT NULL DEFAULT 'ssl',
    imap_username           VARCHAR(255) NOT NULL,
    imap_password_enc       TEXT NOT NULL,
    imap_password_iv        VARCHAR(64) NOT NULL,
    -- SMTP
    smtp_host               VARCHAR(255) NOT NULL,
    smtp_port               SMALLINT UNSIGNED NOT NULL DEFAULT 587,
    smtp_encryption         ENUM('ssl','tls','starttls','none') NOT NULL DEFAULT 'starttls',
    smtp_username           VARCHAR(255) NOT NULL,
    smtp_password_enc       TEXT NOT NULL,
    smtp_password_iv        VARCHAR(64) NOT NULL,
    -- Status
    is_active               TINYINT(1) NOT NULL DEFAULT 1,
    last_sync               TIMESTAMP NULL,
    sync_error              TEXT NULL,
    sync_progress           TEXT DEFAULT NULL,
    created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- FOLDERS (IMAP folder mirror)
-- ============================================================
CREATE TABLE IF NOT EXISTS folders (
    id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    account_id      INT UNSIGNED NOT NULL,
    name            VARCHAR(255) NOT NULL,
    full_path       VARCHAR(500) NOT NULL,
    parent_id       INT UNSIGNED NULL DEFAULT NULL,
    delimiter       CHAR(3) NOT NULL DEFAULT '/',
    uidvalidity     INT UNSIGNED NULL,
    uidnext         INT UNSIGNED NULL DEFAULT 1,
    message_count   INT UNSIGNED NOT NULL DEFAULT 0,
    unread_count    INT UNSIGNED NOT NULL DEFAULT 0,
    is_subscribed   TINYINT(1) NOT NULL DEFAULT 1,
    is_selectable   TINYINT(1) NOT NULL DEFAULT 1,
    special_use     ENUM('inbox','sent','drafts','trash','spam','archive','') NOT NULL DEFAULT '',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_folder_path (account_id, full_path),
    FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- THREADS
-- ============================================================
CREATE TABLE IF NOT EXISTS threads (
    id                  INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    account_id          INT UNSIGNED NOT NULL,
    subject_normalized  VARCHAR(500) NULL,
    message_count       INT UNSIGNED NOT NULL DEFAULT 1,
    last_message_at     TIMESTAMP NULL,
    has_unread          TINYINT(1) NOT NULL DEFAULT 1,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
    INDEX idx_account_subject (account_id, subject_normalized(100)),
    INDEX idx_last_message (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id                  INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    account_id          INT UNSIGNED NOT NULL,
    folder_id           INT UNSIGNED NOT NULL,
    thread_id           INT UNSIGNED NULL,
    uid                 INT UNSIGNED NOT NULL,
    message_id          VARCHAR(500) NULL,
    in_reply_to         VARCHAR(500) NULL,
    references_header   TEXT NULL,
    subject             VARCHAR(1000) NULL,
    from_address        VARCHAR(255) NULL,
    from_name           VARCHAR(255) NULL,
    to_addresses        JSON NULL,
    cc_addresses        JSON NULL,
    bcc_addresses       JSON NULL,
    reply_to            VARCHAR(255) NULL,
    date                TIMESTAMP NULL,
    body_text           LONGTEXT NULL,
    body_html           LONGTEXT NULL,
    is_read             TINYINT(1) NOT NULL DEFAULT 0,
    is_starred          TINYINT(1) NOT NULL DEFAULT 0,
    is_flagged          TINYINT(1) NOT NULL DEFAULT 0,
    is_deleted          TINYINT(1) NOT NULL DEFAULT 0,
    is_draft            TINYINT(1) NOT NULL DEFAULT 0,
    has_attachments     TINYINT(1) NOT NULL DEFAULT 0,
    size                INT UNSIGNED NOT NULL DEFAULT 0,
    priority            TINYINT NOT NULL DEFAULT 3,
    rules_applied       TINYINT(1) NOT NULL DEFAULT 0,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_message (account_id, folder_id, uid),
    FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE SET NULL,
    INDEX idx_thread (thread_id),
    INDEX idx_date (date),
    INDEX idx_read (is_read),
    INDEX idx_message_id (message_id(100)),
    INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ATTACHMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS attachments (
    id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    message_id  INT UNSIGNED NOT NULL,
    filename    VARCHAR(500) NOT NULL,
    mime_type   VARCHAR(255) NULL,
    size        INT UNSIGNED NOT NULL DEFAULT 0,
    file_path   VARCHAR(1000) NULL,
    content_id  VARCHAR(500) NULL,
    is_inline   TINYINT(1) NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    INDEX idx_message (message_id),
    INDEX idx_content_id (content_id(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- LABELS
-- ============================================================
CREATE TABLE IF NOT EXISTS labels (
    id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    account_id  INT UNSIGNED NOT NULL,
    name        VARCHAR(100) NOT NULL,
    color       VARCHAR(20) NOT NULL DEFAULT '#3B82F6',
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_label_name (account_id, name),
    FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_labels (
    message_id  INT UNSIGNED NOT NULL,
    label_id    INT UNSIGNED NOT NULL,
    PRIMARY KEY (message_id, label_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SIGNATURES
-- ============================================================
CREATE TABLE IF NOT EXISTS signatures (
    id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id         INT UNSIGNED NOT NULL,
    account_id      INT UNSIGNED NULL DEFAULT NULL,
    name            VARCHAR(100) NOT NULL,
    html_content    LONGTEXT NOT NULL,
    is_default      TINYINT(1) NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- AUTOREPLIES
-- ============================================================
CREATE TABLE IF NOT EXISTS autoreplies (
    id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    account_id  INT UNSIGNED NOT NULL,
    is_enabled  TINYINT(1) NOT NULL DEFAULT 0,
    subject     VARCHAR(500) NOT NULL,
    html_body   LONGTEXT NOT NULL,
    start_date  DATE NULL,
    end_date    DATE NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_account_autoreply (account_id),
    FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Track auto-replies sent (one per external sender per account)
CREATE TABLE IF NOT EXISTS autoreply_sent (
    id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    account_id      INT UNSIGNED NOT NULL,
    sender_email    VARCHAR(255) NOT NULL,
    sent_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_autoreply_sent (account_id, sender_email),
    FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- RULES
-- ============================================================
CREATE TABLE IF NOT EXISTS rules (
    id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    account_id      INT UNSIGNED NOT NULL,
    name            VARCHAR(255) NOT NULL,
    is_enabled      TINYINT(1) NOT NULL DEFAULT 1,
    condition_logic ENUM('AND','OR') NOT NULL DEFAULT 'AND',
    stop_processing TINYINT(1) NOT NULL DEFAULT 0,
    priority        INT NOT NULL DEFAULT 10,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
    INDEX idx_account_priority (account_id, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rule_conditions (
    id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    rule_id     INT UNSIGNED NOT NULL,
    field       ENUM('from_address','from_name','to','cc','subject','body','has_attachment') NOT NULL,
    operator    ENUM('contains','not_contains','starts_with','ends_with','equals','not_equals') NOT NULL,
    value       VARCHAR(1000) NOT NULL,
    FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rule_actions (
    id              INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    rule_id         INT UNSIGNED NOT NULL,
    action_type     ENUM('move_to_folder','add_label','mark_read','mark_starred','set_priority','delete','move_to_spam','autoreply') NOT NULL,
    action_value    VARCHAR(500) NULL,
    FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SYSTEM SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
    `key`       VARCHAR(100) PRIMARY KEY,
    `value`     TEXT NULL,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default settings
INSERT INTO settings (`key`, `value`) VALUES
    ('app_name', 'CM-IMAP'),
    ('attachment_path', '/var/www/cm-imap-attachments'),
    ('allow_registration', '1'),
    ('max_attachment_size_mb', '25'),
    ('sync_interval_minutes', '5'),
    ('session_lifetime_hours', '24')
ON DUPLICATE KEY UPDATE `key` = `key`;

-- ============================================================
-- JWT REFRESH TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id     INT UNSIGNED NOT NULL,
    token_hash  VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_token (token_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- NOTIFICATION TRACKING (for dedup)
-- ============================================================
CREATE TABLE IF NOT EXISTS notified_messages (
    id          INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    user_id     INT UNSIGNED NOT NULL,
    message_id  INT UNSIGNED NOT NULL,
    notified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_notified (user_id, message_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- DEFAULT ADMIN USER (password: admin — CHANGE ON FIRST LOGIN)
-- ============================================================
-- password_hash is bcrypt of 'admin'
INSERT IGNORE INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@localhost', '$2y$12$l28hVVKgh6g2D2oSCT6.LuBAq1EoGxyeddecxyMRgMvo5mnTRppUe', 'admin');
