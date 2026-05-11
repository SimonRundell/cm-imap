<?php

class AdminController {
    public function listUsers(): void {
        Middleware::requireAdmin();
        $users = Database::fetchAll(
            'SELECT id, username, email, role, is_active, created_at,
             (SELECT COUNT(*) FROM email_accounts WHERE user_id = users.id) as account_count
             FROM users ORDER BY id'
        );
        Response::success($users);
    }

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

    public function deleteUser(int $id): void {
        $admin = Middleware::requireAdmin();
        if ($admin['sub'] == $id) Response::error('Cannot delete your own account');

        $user = Database::fetchOne('SELECT id FROM users WHERE id = ?', [$id]);
        if (!$user) Response::notFound('User not found');

        Database::query('DELETE FROM users WHERE id = ?', [$id]);
        Response::success(null, 'User deleted');
    }

    public function getSettings(): void {
        Middleware::requireAdmin();
        $rows = Database::fetchAll('SELECT `key`, `value` FROM settings ORDER BY `key`');
        $settings = [];
        foreach ($rows as $row) {
            $settings[$row['key']] = $row['value'];
        }
        Response::success($settings);
    }

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

    private function body(): array {
        return json_decode(file_get_contents('php://input'), true) ?? [];
    }
}
