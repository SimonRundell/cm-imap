#!/usr/bin/env bash
# CM-IMAP Setup Script
# Run as root or with sudo privileges
# Usage: sudo bash setup.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. Check prerequisites ───────────────────────────────────────────────────
info "Checking PHP version…"
PHP_VER=$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;' 2>/dev/null) || error "PHP not found"
info "PHP $PHP_VER found"

# Detect PHP binary for the right version
PHP_PKG="php$(php -r 'echo PHP_MAJOR_VERSION . "." . PHP_MINOR_VERSION;')"

# ── 2. Install PHP extensions ────────────────────────────────────────────────
info "Installing required PHP extensions…"
apt-get update -qq
apt-get install -y "${PHP_PKG}-imap" "${PHP_PKG}-mysql" "${PHP_PKG}-mbstring" \
                   "${PHP_PKG}-xml" "${PHP_PKG}-curl" "${PHP_PKG}-openssl" \
                   apache2 libapache2-mod-php mysql-server nodejs npm 2>/dev/null || \
  warn "Some packages may not have installed — check output above"

# Enable Apache mods
a2enmod rewrite headers 2>/dev/null || true

# ── 3. Install Composer ──────────────────────────────────────────────────────
if ! command -v composer &>/dev/null; then
  info "Installing Composer…"
  EXPECTED_CHECKSUM="$(php -r 'copy("https://composer.github.io/installer.sig", "php://stdout");')"
  php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
  ACTUAL_CHECKSUM="$(php -r "echo hash_file('sha384', 'composer-setup.php');")"
  if [ "$EXPECTED_CHECKSUM" != "$ACTUAL_CHECKSUM" ]; then
    rm composer-setup.php
    error "Composer installer checksum mismatch"
  fi
  php composer-setup.php --quiet
  rm composer-setup.php
  mv composer.phar /usr/local/bin/composer
  info "Composer installed"
else
  info "Composer already installed"
fi

# ── 4. Database setup ────────────────────────────────────────────────────────
info "Setting up MySQL database…"

read -rp "MySQL developer password (leave blank if none): " MYSQL_ROOT_PASS

if [ -z "$MYSQL_ROOT_PASS" ]; then
  MYSQL_CMD="mysql -u developer"
else
  MYSQL_CMD="mysql -u developer -p${MYSQL_ROOT_PASS}"
fi

# Generate random DB password
DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)

$MYSQL_CMD <<SQL
CREATE DATABASE IF NOT EXISTS cm_imap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'cm_imap_user'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON cm_imap.* TO 'cm_imap_user'@'localhost';
FLUSH PRIVILEGES;
SQL

info "Importing database schema…"
$MYSQL_CMD cm_imap < "${SCRIPT_DIR}/sql/schema.sql"

info "Database: cm_imap, User: cm_imap_user, Pass: ${DB_PASS}"

# ── 5. Generate secrets ──────────────────────────────────────────────────────
JWT_SECRET=$(openssl rand -hex 48)
ENC_KEY=$(openssl rand -hex 32)

# ── 6. Write backend config ──────────────────────────────────────────────────
info "Writing backend config…"
cat > "${SCRIPT_DIR}/backend/config/database.php" <<PHP
<?php
return [
    'host'     => '127.0.0.1',
    'port'     => '3306',
    'name'     => 'cm_imap',
    'user'     => 'cm_imap_user',
    'password' => '${DB_PASS}',
    'charset'  => 'utf8mb4',
];
PHP

cat > "${SCRIPT_DIR}/backend/config/app.php" <<PHP
<?php
return [
    'jwt_secret'       => '${JWT_SECRET}',
    'jwt_expiry'       => 3600,
    'jwt_refresh_days' => 30,
    'encryption_key'   => '${ENC_KEY}',
    'cors_origin'      => '*',
    'attachment_path'  => '/var/www/cm-imap-attachments',
    'app_name'         => 'CM-IMAP',
];
PHP

# ── 7. Attachment directory ──────────────────────────────────────────────────
info "Creating attachment storage directory…"
mkdir -p /var/www/cm-imap-attachments
chown www-data:www-data /var/www/cm-imap-attachments
chmod 750 /var/www/cm-imap-attachments

# ── 8. Frontend build ────────────────────────────────────────────────────────
info "Installing frontend dependencies…"
cd "${SCRIPT_DIR}/frontend"
npm install

info "Copying TinyMCE to public directory…"
mkdir -p "${SCRIPT_DIR}/frontend/public/tinymce"
cp -r "${SCRIPT_DIR}/frontend/node_modules/tinymce/"* "${SCRIPT_DIR}/frontend/public/tinymce/"

info "Building frontend…"
npm run build
cd "${SCRIPT_DIR}"

# ── 9. Apache virtual host ───────────────────────────────────────────────────
read -rp "Server hostname/domain (e.g. mail.example.com or localhost): " VHOST

VHOST_CONF="/etc/apache2/sites-available/cm-imap.conf"
cat > "$VHOST_CONF" <<APACHE
<VirtualHost *:80>
    ServerName ${VHOST}
    DocumentRoot ${SCRIPT_DIR}
    DirectoryIndex dist/index.html

    <Directory ${SCRIPT_DIR}>
        AllowOverride All
        Require all granted
        Options -Indexes
    </Directory>

    # Backend PHP
    <Directory ${SCRIPT_DIR}/backend>
        AllowOverride All
        Require all granted
    </Directory>

    # Deny access to source files
    <DirectoryMatch "^${SCRIPT_DIR}/frontend/src">
        Require all denied
    </DirectoryMatch>

    ErrorLog \${APACHE_LOG_DIR}/cm-imap-error.log
    CustomLog \${APACHE_LOG_DIR}/cm-imap-access.log combined
</VirtualHost>
APACHE

a2ensite cm-imap.conf 2>/dev/null || true
systemctl reload apache2 2>/dev/null || true
info "Apache configured: ${VHOST_CONF}"

# ── 10. Cron job ─────────────────────────────────────────────────────────────
info "Installing cron job for email sync…"
CRON_LINE="*/5 * * * * www-data /usr/bin/php ${SCRIPT_DIR}/backend/cron/sync.php >> /var/log/cm-imap-sync.log 2>&1"
CRON_FILE="/etc/cron.d/cm-imap"
echo "$CRON_LINE" > "$CRON_FILE"
chmod 644 "$CRON_FILE"
info "Cron installed: ${CRON_FILE}"

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  CM-IMAP Installation Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  URL:           http://${VHOST}/"
echo "  Admin login:   admin / admin"
echo "  Database:      cm_imap (user: cm_imap_user)"
echo "  Attachments:   /var/www/cm-imap-attachments"
echo "  Sync log:      /var/log/cm-imap-sync.log"
echo ""
echo -e "${YELLOW}  IMPORTANT: Change the admin password on first login!${NC}"
echo ""
