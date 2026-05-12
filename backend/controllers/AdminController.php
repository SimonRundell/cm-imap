<?php

/**
 * Admin-only endpoints for user management and application settings.
 *
 * Every method enforces the 'admin' role via {@see Middleware::requireAdmin()}.
 *
 * @package CM-IMAP\Controllers
 */
class AdminController {
    /**
     * List all users with their account counts.
     *
     * @return void
     */
    public function listUsers(): void {
        Middleware::requireAdmin();
        $users = Database::fetchAll(
            'SELECT id, username, email, role, is_active, created_at,
             (SELECT COUNT(*) FROM email_accounts WHERE user_id = users.id) as account_count
             FROM users ORDER BY id'
        );
        Response::success($users);
    }

    /**
     * Create a new user account.
     *
     * Validates uniqueness of username and email, hashes the password with
     * bcrypt (cost 12), and assigns the given role (defaults to 'user').
     *
     * @return void
     */
    public function createUser(): void {
        Middleware::requireAdmin();
        $body = $this->body();

        $username = trim($body['username'] ?? '');
        $email    = trim($body['email'] ?? '');
        $password = $body['password'] ?? '';
        $role     = in_array($body['role'] ?? 'user', ['user','admin']) ? $body['role'] : 'user';

        if (!$username || !$email || !$password) {
            Response::error('Username, email and password required');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Invalid email');
        }

        $exists = Database::fetchOne(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [$username, $email]
        );
        if ($exists) Response::error('Username or email already exists', 409);

        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        Database::query(
            'INSERT INTO users (username, email, password_hash, role) VALUES (?,?,?,?)',
            [$username, $email, $hash, $role]
        );

        Response::success(['id' => (int)Database::lastInsertId()], 'User created', 201);
    }

    /**
     * Update an existing user's profile fields.
     *
     * Only fields present in the request body are modified. Password is re-hashed
     * if provided. An admin cannot change the role of a non-existent user.
     *
     * @param  int $id User primary key.
     * @return void
     */
    public function updateUser(int $id): void {
        Middleware::requireAdmin();
        $body = $this->body();

        $user = Database::fetchOne('SELECT * FROM users WHERE id = ?', [$id]);
        if (!$user) Response::notFound('User not found');

        $fields = [];
        $params = [];

        if (isset($body['email'])) {
            if (!filter_var($body['email'], FILTER_VALIDATE_EMAIL)) Response::error('Invalid email');
            $fields[] = 'email = ?'; $params[] = $body['email'];
        }
        if (isset($body['username'])) { $fields[] = 'username = ?';   $params[] = $body['username']; }
        if (isset($body['role']) && in_array($body['role'], ['user','admin'])) {
            $fields[] = 'role = ?'; $params[] = $body['role'];
        }
        if (isset($body['is_active'])) { $fields[] = 'is_active = ?'; $params[] = $body['is_active'] ? 1 : 0; }
        if (!empty($body['password'])) {
            $fields[] = 'password_hash = ?';
            $params[] = password_hash($body['password'], PASSWORD_BCRYPT, ['cost' => 12]);
        }

        if ($fields) {
            $params[] = $id;
            Database::query('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
        }

        Response::success(null, 'User updated');
    }

    /**
     * Delete a user account.
     *
     * An admin cannot delete their own account. Cascading deletes remove all
     * associated email accounts, messages, etc. via database foreign keys.
     *
     * @param  int $id User primary key.
     * @return void
     */
    public function deleteUser(int $id): void {
        $admin = Middleware::requireAdmin();
        if ($admin['sub'] == $id) Response::error('Cannot delete your own account');

        $user = Database::fetchOne('SELECT id FROM users WHERE id = ?', [$id]);
        if (!$user) Response::notFound('User not found');

        Database::query('DELETE FROM users WHERE id = ?', [$id]);
        Response::success(null, 'User deleted');
    }

    /**
     * Retrieve all application settings as a key/value map.
     *
     * @return void
     */
    public function getSettings(): void {
        Middleware::requireAdmin();
        $rows = Database::fetchAll('SELECT `key`, `value` FROM settings ORDER BY `key`');
        $settings = [];
        foreach ($rows as $row) {
            $settings[$row['key']] = $row['value'];
        }
        Response::success($settings);
    }

    /**
     * Update application settings.
     *
     * Only keys in the explicit allowlist are accepted; unknown keys are silently
     * ignored. Uses INSERT … ON DUPLICATE KEY UPDATE for upsert behaviour.
     *
     * @return void
     */
    public function updateSettings(): void {
        Middleware::requireAdmin();
        $body = $this->body();

        $allowed = [
            'app_name', 'attachment_path', 'allow_registration',
            'max_attachment_size_mb', 'sync_interval_minutes', 'session_lifetime_hours',
        ];

        foreach ($body as $key => $value) {
            if (!in_array($key, $allowed)) continue;
            Database::query(
                'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
                [$key, $value, $value]
            );
        }

        Response::success(null, 'Settings updated');
    }

    /**
     * Return sync status for all email accounts across all users.
     *
     * Includes the last sync timestamp and any stored sync error per account,
     * ordered by most recently synced first.
     *
     * @return void
     */
    public function syncStatus(): void {
        Middleware::requireAdmin();
        $accounts = Database::fetchAll(
            'SELECT a.id, a.email_address, a.display_name, a.last_sync, a.sync_error,
                    u.username
             FROM email_accounts a JOIN users u ON a.user_id = u.id
             ORDER BY a.last_sync DESC'
        );
        Response::success($accounts);
    }

    /**
     * Decode the JSON request body.
     *
     * @return array<string, mixed>
     */
    private function body(): array {
        return json_decode(file_get_contents('php://input'), true) ?? [];
    }
}
