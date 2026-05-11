<?php

class AuthController {
    public function login(): void {
        $body = $this->getBody();
        $username = trim($body['username'] ?? '');
        $password = $body['password'] ?? '';

        if (!$username || !$password) {
            Response::error('Username and password are required');
        }

        $user = Database::fetchOne(
            'SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1',
            [$username, $username]
        );

        if (!$user || !password_verify($password, $user['password_hash'])) {
            Response::error('Invalid credentials', 401);
        }

        $cfg    = require __DIR__ . '/../config/app.php';
        $tokens = JWT::createPair(
            ['sub' => $user['id'], 'username' => $user['username'], 'role' => $user['role']],
            $cfg['jwt_secret'], $cfg['jwt_expiry'], $cfg['jwt_refresh_days']
        );

        // Store refresh token hash
        Database::query(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
            [
                $user['id'],
                hash('sha256', $tokens['refresh_token']),
                date('Y-m-d H:i:s', $tokens['refresh_expires_at']),
            ]
        );

        // Clean expired tokens for this user
        Database::query(
            'DELETE FROM refresh_tokens WHERE user_id = ? AND expires_at < NOW()',
            [$user['id']]
        );

        Response::success([
            'access_token'  => $tokens['access_token'],
            'refresh_token' => $tokens['refresh_token'],
            'expires_in'    => $tokens['expires_in'],
            'user' => [
                'id'       => $user['id'],
                'username' => $user['username'],
                'email'    => $user['email'],
                'role'     => $user['role'],
            ],
        ]);
    }

    public function register(): void {
        $allowReg = Database::getSetting('allow_registration', '1');
        if (!$allowReg) {
            Response::error('Self-registration is disabled', 403);
        }

        $body     = $this->getBody();
        $username = trim($body['username'] ?? '');
        $email    = trim($body['email'] ?? '');
        $password = $body['password'] ?? '';

        if (!$username || !$email || !$password) {
            Response::error('Username, email and password are required');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Response::error('Invalid email address');
        }
        if (strlen($password) < 8) {
            Response::error('Password must be at least 8 characters');
        }
        if (!preg_match('/^[a-zA-Z0-9_\-\.]{3,50}$/', $username)) {
            Response::error('Username must be 3-50 alphanumeric characters');
        }

        $existing = Database::fetchOne(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [$username, $email]
        );
        if ($existing) {
            Response::error('Username or email already in use', 409);
        }

        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        Database::query(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [$username, $email, $hash]
        );

        Response::success(null, 'Registration successful', 201);
    }

    public function refresh(): void {
        $body         = $this->getBody();
        $refreshToken = $body['refresh_token'] ?? '';
        if (!$refreshToken) {
            Response::error('Refresh token required', 400);
        }

        $tokenHash = hash('sha256', $refreshToken);
        $stored    = Database::fetchOne(
            'SELECT rt.*, u.username, u.role, u.is_active FROM refresh_tokens rt
             JOIN users u ON rt.user_id = u.id
             WHERE rt.token_hash = ? AND rt.expires_at > NOW()',
            [$tokenHash]
        );

        if (!$stored || !$stored['is_active']) {
            Response::error('Invalid or expired refresh token', 401);
        }

        $cfg    = require __DIR__ . '/../config/app.php';
        $tokens = JWT::createPair(
            ['sub' => $stored['user_id'], 'username' => $stored['username'], 'role' => $stored['role']],
            $cfg['jwt_secret'], $cfg['jwt_expiry'], $cfg['jwt_refresh_days']
        );

        // Rotate refresh token
        Database::query('DELETE FROM refresh_tokens WHERE token_hash = ?', [$tokenHash]);
        Database::query(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
            [
                $stored['user_id'],
                hash('sha256', $tokens['refresh_token']),
                date('Y-m-d H:i:s', $tokens['refresh_expires_at']),
            ]
        );

        Response::success([
            'access_token'  => $tokens['access_token'],
            'refresh_token' => $tokens['refresh_token'],
            'expires_in'    => $tokens['expires_in'],
        ]);
    }

    public function logout(): void {
        $user = Middleware::requireAuth();
        $body = $this->getBody();
        $rt   = $body['refresh_token'] ?? '';
        if ($rt) {
            Database::query(
                'DELETE FROM refresh_tokens WHERE token_hash = ?',
                [hash('sha256', $rt)]
            );
        }
        Response::success(null, 'Logged out');
    }

    public function me(): void {
        $user = Middleware::requireAuth();
        $row  = Database::fetchOne(
            'SELECT id, username, email, role, created_at FROM users WHERE id = ?',
            [$user['sub']]
        );
        Response::success($row);
    }

    private function getBody(): array {
        $raw = file_get_contents('php://input');
        return json_decode($raw, true) ?? [];
    }
}
