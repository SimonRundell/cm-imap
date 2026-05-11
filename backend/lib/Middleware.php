<?php

class Middleware {
    private static ?array $currentUser = null;

    /**
     * Require a valid JWT access token.
     * Returns the user payload on success, calls Response::unauthorized on failure.
     */
    public static function requireAuth(): array {
        $cfg   = require __DIR__ . '/../config/app.php';
        $token = self::extractToken();
        if (!$token) {
            Response::unauthorized('No token provided');
        }
        try {
            $payload = JWT::decode($token, $cfg['jwt_secret']);
            if (($payload['type'] ?? '') !== 'access') {
                Response::unauthorized('Invalid token type');
            }
            self::$currentUser = $payload;
            return $payload;
        } catch (RuntimeException $e) {
            Response::unauthorized($e->getMessage());
        }
    }

    /**
     * Require the authenticated user to have the 'admin' role.
     */
    public static function requireAdmin(): array {
        $user = self::requireAuth();
        if (($user['role'] ?? '') !== 'admin') {
            Response::forbidden('Admin access required');
        }
        return $user;
    }

    /** Verify that an email account belongs to the authenticated user */
    public static function requireAccountOwnership(int $accountId, int $userId): array {
        $account = Database::fetchOne(
            'SELECT * FROM email_accounts WHERE id = ? AND user_id = ?',
            [$accountId, $userId]
        );
        if (!$account) {
            Response::forbidden('Account not found or access denied');
        }
        return $account;
    }

    private static function extractToken(): ?string {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
            return trim($m[1]);
        }
        return null;
    }
}
