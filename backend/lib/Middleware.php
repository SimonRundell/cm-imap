<?php

/**
 * HTTP middleware guards for authentication and authorisation.
 *
 * All methods terminate the request via {@see Response} on failure, so
 * callers can treat a successful return as a guarantee.
 *
 * @package CM-IMAP\Lib
 */
class Middleware {
    /** @var array<string, mixed>|null JWT payload of the currently authenticated user */
    private static ?array $currentUser = null;

    /**
     * Require a valid JWT access token in the Authorization header.
     *
     * Reads the Bearer token, decodes and validates it, and stores the
     * payload in `$currentUser`. Calls {@see Response::unauthorized()} and
     * exits if the token is missing, invalid, expired, or the wrong type.
     *
     * @return array<string, mixed> Decoded JWT payload (includes `sub`, `username`, `role`).
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
     *
     * Calls {@see requireAuth()} first, then checks the `role` claim.
     * Calls {@see Response::forbidden()} and exits if the role is not 'admin'.
     *
     * @return array<string, mixed> Decoded JWT payload of the admin user.
     */
    public static function requireAdmin(): array {
        $user = self::requireAuth();
        if (($user['role'] ?? '') !== 'admin') {
            Response::forbidden('Admin access required');
        }
        return $user;
    }

    /**
     * Verify that an email account belongs to the authenticated user.
     *
     * Fetches the account row and ensures its `user_id` matches `$userId`.
     * Calls {@see Response::forbidden()} and exits if there is no match.
     *
     * @param  int $accountId Account primary key to look up.
     * @param  int $userId    `sub` claim from the authenticated user's JWT.
     * @return array<string, mixed> The email_accounts row.
     */
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

    /**
     * Extract the Bearer token from the Authorization header.
     *
     * Checks both `HTTP_AUTHORIZATION` and `REDIRECT_HTTP_AUTHORIZATION`
     * to handle servers that rewrite the header after a redirect.
     *
     * @return string|null Token string, or null if none found.
     */
    private static function extractToken(): ?string {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
            return trim($m[1]);
        }
        return null;
    }
}
