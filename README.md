# CM-IMAP

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

A self-hosted, multi-user web email client built on IMAP/SMTP. Manage multiple email accounts from a single interface, with full threading, HTML composition, attachment support, a rules engine, and date-range autoreplies — all running on a standard LAMP stack with no external SaaS dependencies.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Install](#quick-install)
- [Manual Installation](#manual-installation)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Architecture Overview](#architecture-overview)
- [API Reference](#api-reference)
- [Development Workflow](#development-workflow)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## Features

- **Multi-account** — each user can add unlimited IMAP/SMTP accounts
- **Unified inbox** — view mail from all accounts in one sorted list
- **IMAP folder replication** — subscribed folders stay in sync; incremental sync is UIDVALIDITY-aware
- **Full threading** — messages are grouped by `In-Reply-To` / `References` headers with normalised-subject fallback
- **HTML email composition** — TinyMCE rich-text editor, self-hosted (no API key required)
- **Inline images & attachments** — drag-and-drop upload in the composer; MIME multipart/mixed + related + alternative output
- **Reply / Reply All / Forward** — pre-fills quoted body and correct recipient lists
- **HTML signatures with images** — per-account, inserted automatically on compose
- **Date-range autoreplies** — account-level, with duplicate suppression (one reply per sender per window)
- **Rules engine** — ordered, AND/OR condition trees matched against `From`, `To`, `Subject`, `Body`; actions include move to folder, add label, mark read/starred, set priority, delete, move to spam, and autoreply
- **Labels** — arbitrary colour-coded tags applied manually or by rules
- **Browser notifications** — Web Notifications API triggered on new mail (60-second poll)
- **Admin panel** — manage users, toggle active state, change roles, view sync status, edit system-wide settings
- **JWT authentication** — HS256 access tokens (1 h) + refresh tokens (30 days) with rotation

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web server | Apache 2.4 + mod_rewrite |
| Backend language | PHP 8.2 (no framework) |
| Database | MySQL 5.7+ / MariaDB 10.3+ |
| IMAP | php-imap extension |
| SMTP | Pure-PHP raw socket client (SSL / STARTTLS) |
| Frontend framework | React 18 + Vite 5 |
| Server state | TanStack Query v5 |
| UI state | Zustand 4 |
| Styling | Tailwind CSS 3 (dark theme) |
| Rich text editor | TinyMCE 7 (self-hosted) |
| HTTP client | Axios 1 |
| Routing | React Router DOM v6 |

---

## Prerequisites

| Requirement | Minimum version |
|---|---|
| PHP | 8.1 |
| PHP extensions | `imap`, `mysql` / `mysqli`, `mbstring`, `xml`, `curl`, `openssl` |
| MySQL / MariaDB | 5.7 / 10.3 |
| Apache | 2.4 with `mod_rewrite`, `mod_headers`, `libapache2-mod-php` |
| Node.js | 18 |
| npm | 9 |
| Composer | 2 |

---

## Quick Install

The included `setup.sh` automates every step. Run it as root or with `sudo`:

```bash
sudo bash setup.sh
```

It will:

1. Detect the installed PHP version and install the required extensions
2. Install or verify Composer
3. Prompt for a MySQL administrator username and password, create the `cm_imap` database and a dedicated user with a randomly-generated password
4. Import `sql/schema.sql`
5. Generate a 384-bit JWT secret and 256-bit AES encryption key
6. Write `backend/config/database.php` and `backend/config/app.php` with the generated values
7. Create the attachment storage directory at `/var/www/cm-imap-attachments` with correct ownership
8. Run `npm install` and `npm run build` for the frontend
9. Copy the self-hosted TinyMCE bundle to `frontend/public/tinymce/`
10. Prompt for a server hostname and write an Apache VirtualHost
11. Install a cron job at `/etc/cron.d/cm-imap` to sync email every 5 minutes

After setup completes, visit `http://<your-hostname>/` and log in with:

```
Username: admin
Password: admin
```

> **Change the admin password immediately on first login.**

---

## Manual Installation

If you prefer to install step by step:

### 1. PHP extensions

```bash
sudo apt-get install php8.2-imap php8.2-mysql php8.2-mbstring php8.2-xml php8.2-curl
sudo phpenmod imap
```

### 2. Database

```bash
mysql -u root -p <<'SQL'
CREATE DATABASE cm_imap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cm_imap_user'@'localhost' IDENTIFIED BY 'your_password_here';
GRANT ALL PRIVILEGES ON cm_imap.* TO 'cm_imap_user'@'localhost';
FLUSH PRIVILEGES;
SQL

mysql -u cm_imap_user -p cm_imap < sql/schema.sql
```

### 3. Backend configuration

```bash
cp backend/config/database.example.php backend/config/database.php
cp backend/config/app.example.php      backend/config/app.php
```

Edit both files. For `app.php`, generate secure random values:

```bash
# jwt_secret  (48 bytes → 96 hex chars)
openssl rand -hex 48

# encryption_key  (32 bytes → 64 hex chars)
openssl rand -hex 32
```

### 4. Attachment storage

```bash
sudo mkdir -p /var/www/cm-imap-attachments
sudo chown www-data:www-data /var/www/cm-imap-attachments
sudo chmod 750 /var/www/cm-imap-attachments
```

### 5. Frontend build

```bash
cd frontend
npm install
cp -r node_modules/tinymce/* public/tinymce/
npm run build
cd ..
```

The build output goes to `dist/` in the project root (configured in `frontend/vite.config.js`).

### 6. Apache VirtualHost

```apache
<VirtualHost *:80>
    ServerName mail.example.com
    DocumentRoot /path/to/cm-imap

    DirectoryIndex dist/index.html

    <Directory /path/to/cm-imap>
        AllowOverride All
        Require all granted
        Options -Indexes
    </Directory>

    ErrorLog  ${APACHE_LOG_DIR}/cm-imap-error.log
    CustomLog ${APACHE_LOG_DIR}/cm-imap-access.log combined
</VirtualHost>
```

Enable it:

```bash
sudo a2enmod rewrite headers
sudo a2ensite cm-imap
sudo systemctl reload apache2
```

### 7. Cron job (background sync)

```bash
echo "*/5 * * * * www-data /usr/bin/php /path/to/cm-imap/backend/cron/sync.php >> /var/log/cm-imap-sync.log 2>&1" \
  | sudo tee /etc/cron.d/cm-imap
sudo chmod 644 /etc/cron.d/cm-imap
```

---

## Configuration

### `backend/config/app.php`

| Key | Default | Description |
|---|---|---|
| `jwt_secret` | *(generated)* | HMAC-SHA256 signing secret for JWTs. Min 32 hex chars recommended. |
| `jwt_expiry` | `3600` | Access token lifetime in seconds. |
| `jwt_refresh_days` | `30` | Refresh token lifetime in days. |
| `encryption_key` | *(generated)* | AES-256-CBC key for IMAP/SMTP passwords at rest. |
| `cors_origin` | `*` | `Access-Control-Allow-Origin` header value. Restrict to your domain in production. |
| `attachment_path` | `/var/www/cm-imap-attachments` | Absolute path where uploaded attachments are stored. Must be writable by `www-data`. |
| `app_name` | `CM-IMAP` | Displayed in the UI and notification titles. |

### `backend/config/database.php`

Standard PDO connection parameters: `host`, `port`, `name`, `user`, `password`, `charset`.

---

## Project Structure

```
cm-imap/
├── backend/
│   ├── api.php                  # Single-entry router (all /api/* requests)
│   ├── .htaccess                # Deny direct access to PHP source files
│   ├── config/
│   │   ├── app.example.php      # Template — copy to app.php and fill in
│   │   └── database.example.php # Template — copy to database.php and fill in
│   ├── controllers/
│   │   ├── AccountController.php
│   │   ├── AdminController.php
│   │   ├── AttachmentController.php
│   │   ├── AuthController.php
│   │   ├── AutoreplyController.php
│   │   ├── FolderController.php
│   │   ├── LabelController.php
│   │   ├── MessageController.php
│   │   ├── RuleController.php
│   │   └── SignatureController.php
│   ├── lib/
│   │   ├── Database.php         # PDO wrapper
│   │   ├── Encryption.php       # AES-256-CBC helpers
│   │   ├── IMAPClient.php       # php-imap wrapper
│   │   ├── JWT.php              # Pure-PHP HS256 JWT
│   │   ├── Middleware.php       # Auth guard — injects $GLOBALS['user']
│   │   ├── Response.php         # JSON response helpers
│   │   ├── RulesEngine.php      # Condition evaluation + action dispatch
│   │   ├── SMTPClient.php       # Raw-socket SMTP + MIME builder
│   │   └── SyncService.php      # IMAP → DB incremental sync
│   └── cron/
│       └── sync.php             # CLI entry point for background sync
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js           # Proxy /api → :80; build → ../dist
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── public/
│   │   └── tinymce/             # Self-hosted TinyMCE (populated by setup.sh)
│   └── src/
│       ├── main.jsx
│       ├── App.jsx              # BrowserRouter, route guards, QueryClientProvider
│       ├── api/                 # Axios wrappers for every backend endpoint group
│       ├── store/               # Zustand stores (auth, email, ui)
│       ├── hooks/               # TanStack Query hooks + polling
│       ├── utils/               # Date formatting, email helpers, MIME utilities
│       ├── components/
│       │   ├── auth/
│       │   ├── layout/          # AppLayout, Header, Sidebar
│       │   ├── inbox/           # MessageList, MessageItem, MessagePreview
│       │   ├── compose/         # ComposeWindow (TinyMCE)
│       │   ├── settings/        # Accounts, Signatures, Autoreplies, Rules, Labels
│       │   ├── admin/           # UserManager, SystemSettings
│       │   └── common/          # ToastContainer
│       └── pages/               # InboxPage, SettingsPage, AdminPage
├── dist/                        # Built frontend (generated — not committed)
├── sql/
│   └── schema.sql               # Full database schema + seed data
├── .htaccess                    # Root rewrite rules
├── setup.sh                     # Automated installer
└── README.md
```

---

## Architecture Overview

### Request lifecycle

```
Browser
  │
  ├─ /api/*  → Apache mod_rewrite → backend/api.php
  │              │
  │              ├─ route() matches method + URI pattern
  │              ├─ Middleware::auth() validates Bearer JWT
  │              ├─ Controller method called with URL params
  │              └─ Response::json() / Response::error()
  │
  └─ /*      → dist/index.html (React SPA, client-side routing)
```

### Authentication flow

1. `POST /api/auth/login` validates credentials, returns a short-lived **access token** (JWT, 1 h) and a **refresh token** (opaque, 30 days, stored in `refresh_tokens` table).
2. Every subsequent request sends `Authorization: Bearer <access_token>`.
3. When the access token expires (HTTP 401), the Axios client automatically calls `POST /api/auth/refresh` with the refresh token, rotates both tokens, and retries the original request transparently.
4. Refresh tokens are single-use; each refresh issues a new pair.

### IMAP sync

`SyncService::syncAccount()` is called either by the cron job (every 5 minutes) or on demand via `POST /api/accounts/:id/sync`.

1. Fetch the current folder list from the IMAP server; create/update rows in `folders`.
2. For each subscribed folder, compare the server's `UIDVALIDITY` against the stored value. A mismatch triggers a full re-sync (all cached messages for that folder are purged).
3. Fetch only new UIDs (greater than the stored `last_uid`); fetch each message's full MIME content.
4. Parse headers, body parts (HTML/plain), and attachments; write to `messages` and `attachments` tables.
5. Resolve thread membership via `In-Reply-To` → `References` → normalised subject.
6. Pass each newly stored message through `RulesEngine::apply()`.
7. Check autoreply eligibility and dispatch if applicable.

### Rules engine

Each rule has an ordered list of **conditions** (evaluated as AND or OR) and a list of **actions** executed in order. Condition fields: `from`, `to`, `subject`, `body`. Operators: `contains`, `starts_with`, `ends_with`, `equals`, `regex`. Actions: `move_to_folder`, `add_label`, `mark_read`, `mark_starred`, `set_priority`, `delete`, `move_to_spam`, `autoreply`.

### Credential encryption

IMAP and SMTP passwords are encrypted with AES-256-CBC before being written to the database. The encryption key in `backend/config/app.php` is hashed with SHA-256 to produce a 32-byte key. Each password is stored as two columns: `*_enc` (base64 ciphertext) and `*_iv` (base64 initialisation vector).

---

## API Reference

All endpoints are prefixed `/api/`. Protected endpoints require `Authorization: Bearer <token>`.

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | — | Login; returns `access_token`, `refresh_token`, user object |
| POST | `/auth/register` | — | Register a new user |
| POST | `/auth/refresh` | — | Rotate tokens using `refresh_token` in request body |
| POST | `/auth/logout` | ✓ | Revoke the current refresh token |
| GET | `/auth/me` | ✓ | Return the authenticated user |

### Accounts

| Method | Path | Description |
|---|---|---|
| GET | `/accounts` | List the authenticated user's email accounts |
| POST | `/accounts` | Add an email account (IMAP + SMTP credentials) |
| PUT | `/accounts/:id` | Update account settings |
| DELETE | `/accounts/:id` | Remove an account and all its data |
| POST | `/accounts/:id/sync` | Trigger an immediate IMAP sync |
| POST | `/accounts/:id/test` | Test IMAP/SMTP connectivity without saving |

### Messages

| Method | Path | Description |
|---|---|---|
| GET | `/messages` | List messages; query params: `account_id`, `folder_id`, `unified=1`, `search`, `page`, `limit` |
| GET | `/messages/poll` | Return unread messages since `?since=<ISO timestamp>` (used by the 60 s poller) |
| GET | `/messages/:id` | Fetch a single message with body and attachment metadata |
| PUT | `/messages/:id` | Update flags (`is_read`, `is_starred`, `is_flagged`, `priority`) |
| DELETE | `/messages/:id` | Move to trash or permanently delete |
| POST | `/messages/:id/move` | Move to a folder: `{ "folder_id": n }` |
| POST | `/messages/:id/labels` | Set labels: `{ "label_ids": [1,2] }` |
| POST | `/messages/send` | Compose and send; supports `reply_to_id`, `forward_of_id`, inline images, attachments |

### Folders

| Method | Path | Description |
|---|---|---|
| GET | `/folders` | List all folders for the authenticated user |
| POST | `/folders/sync` | Re-sync folder list from IMAP server |
| POST | `/folders` | Create a folder on the IMAP server |
| PUT | `/folders/:id` | Update subscription or display name |

### Attachments

| Method | Path | Description |
|---|---|---|
| GET | `/attachments/:id` | Download or inline-preview an attachment (`?inline=1`) |
| POST | `/attachments` | Upload an attachment for use in the composer; returns `attachment_id` |

### Signatures

| Method | Path | Description |
|---|---|---|
| GET | `/signatures` | List the authenticated user's signatures |
| POST | `/signatures` | Create a signature |
| PUT | `/signatures/:id` | Update a signature |
| DELETE | `/signatures/:id` | Delete a signature |

### Autoreplies

| Method | Path | Description |
|---|---|---|
| GET | `/autoreplies` | List autoreplies for the user's accounts |
| POST | `/autoreplies` | Create or update an autoreply for an account |
| DELETE | `/autoreplies/:accountId` | Delete the autoreply for an account |

### Rules

| Method | Path | Description |
|---|---|---|
| GET | `/rules` | List rules (ordered by `priority`) |
| POST | `/rules` | Create a rule with conditions and actions |
| PUT | `/rules/:id` | Update a rule |
| DELETE | `/rules/:id` | Delete a rule |

### Labels

| Method | Path | Description |
|---|---|---|
| GET | `/labels` | List the user's labels |
| POST | `/labels` | Create a label |
| PUT | `/labels/:id` | Rename or recolour a label |
| DELETE | `/labels/:id` | Delete a label |

### Admin *(admin role required)*

| Method | Path | Description |
|---|---|---|
| GET | `/admin/users` | List all users |
| POST | `/admin/users` | Create a user |
| PUT | `/admin/users/:id` | Update user details, role, or active state |
| DELETE | `/admin/users/:id` | Delete a user |
| GET | `/admin/settings` | Read system-wide settings |
| PUT | `/admin/settings` | Write system-wide settings |
| GET | `/admin/sync-status` | View last-sync timestamp and any error per account |

---

## Development Workflow

### Run the Vite dev server

The dev server proxies all `/api/*` requests to `http://localhost:80` (Apache), so the backend must be running.

```bash
cd frontend
npm run dev
# App available at http://localhost:5173
```

### Build for production

```bash
cd frontend
npm run build
# Output written to ../dist/
```

### Manual sync (without cron)

```bash
php backend/cron/sync.php
```

### Sync log

```bash
tail -f /var/log/cm-imap-sync.log
```

### Apache logs

```bash
sudo tail -f /var/log/apache2/cm-imap-error.log
sudo tail -f /var/log/apache2/cm-imap-access.log
```

### Database access

```bash
mysql -u cm_imap_user -p cm_imap
```

---

## Security

### Credentials at rest

IMAP and SMTP passwords are encrypted with **AES-256-CBC** before being stored. The encryption key never leaves the server. Rotate it by re-running `setup.sh` or generating a new key in `app.php` and re-saving all accounts.

### JWT secrets

The JWT signing secret is generated by `openssl rand -hex 48` during setup. Never commit `backend/config/app.php` — it is excluded by `.gitignore` for this reason.

### Password hashing

User passwords are hashed with `bcrypt` (cost factor 12) via PHP's `password_hash()`.

### `backend/.htaccess`

Direct HTTP access to PHP source files under `backend/` is denied. Only `api.php` is reachable via the mod_rewrite rule.

### CORS

`cors_origin` defaults to `*` for local development. **Set this to your domain** in production (`app.php`).

### Attachment storage

Attachments are written to a directory outside the web root (`/var/www/cm-imap-attachments`), owned by `www-data`, and served only through `AttachmentController` which enforces ownership checks.

### Refresh token rotation

Every use of a refresh token invalidates it and issues a new pair. Stolen tokens can only be used once before the legitimate user's next request invalidates them.

---

## Troubleshooting

### `Call to undefined function imap_open()`

The `php-imap` extension is not installed or not enabled:

```bash
sudo apt-get install php8.2-imap
sudo phpenmod imap
sudo systemctl reload apache2
```

### 403 on `/api/*` requests

Apache cannot traverse the project directory. Ensure the parent directories are executable by `www-data`:

```bash
chmod o+x /home/<your-user>
```

Or move the project to `/var/www/`.

### 404 on all `/api/*` requests

`mod_rewrite` is not enabled, or `AllowOverride All` is not set for the project directory. Check that the VirtualHost has `AllowOverride All` and that `mod_rewrite` is enabled:

```bash
sudo a2enmod rewrite
sudo systemctl reload apache2
```

### Vite dev server cannot reach the API

Ensure Apache is running and listening on port 80. The Vite proxy target is `http://localhost:80` (see `frontend/vite.config.js`).

### TinyMCE editor does not load

The self-hosted TinyMCE bundle must be present at `frontend/public/tinymce/`. If it is missing, re-run:

```bash
cd frontend
cp -r node_modules/tinymce/* public/tinymce/
npm run build
```

### Emails are not syncing automatically

Check the cron job exists and that `www-data` can execute PHP:

```bash
cat /etc/cron.d/cm-imap
sudo -u www-data php /path/to/cm-imap/backend/cron/sync.php
```

---

## License

Copyright (c) 2026 Simon Rundell.

This project is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-nc-sa/4.0/).

You are free to share and adapt this work for non-commercial purposes, provided you give appropriate credit and distribute any derivatives under the same license. See [LICENSE](LICENSE) for the full terms.
