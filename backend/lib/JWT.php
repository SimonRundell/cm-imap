<?php

/**
 * Minimal JWT implementation — HS256 only.
 * No external dependencies.
 *
 * @package CM-IMAP\Lib
 */
class JWT {
    /**
     * Encode binary data as a URL-safe Base64 string (no padding).
     *
     * @param  string $data Raw binary input.
     * @return string
     */
    private static function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    /**
     * Decode a URL-safe Base64 string back to binary.
     *
     * @param  string $data URL-safe Base64 input.
     * @return string
     */
    private static function base64UrlDecode(string $data): string {
        $padded = str_pad(strtr($data, '-_', '+/'), strlen($data) + (4 - strlen($data) % 4) % 4, '=');
        return base64_decode($padded);
    }

    /**
     * Create a signed JWT string from a payload array.
     *
     * @param  array  $payload Claims to embed in the token.
     * @param  string $secret  HMAC signing secret.
     * @return string Signed JWT (header.payload.signature).
     */
    public static function encode(array $payload, string $secret): string {
        $header  = self::base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = self::base64UrlEncode(json_encode($payload));
        $sig     = self::base64UrlEncode(hash_hmac('sha256', "$header.$payload", $secret, true));
        return "$header.$payload.$sig";
    }

    /**
     * Decode and validate a JWT.
     *
     * Verifies the HMAC-SHA256 signature and the optional `exp` claim.
     * Returns the payload array on success, throws on any failure.
     *
     * @param  string $token  JWT string.
     * @param  string $secret HMAC signing secret.
     * @return array<string, mixed> Decoded payload.
     * @throws RuntimeException If structure, signature, payload or expiry is invalid.
     */
    public static function decode(string $token, string $secret): array {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new RuntimeException('Invalid token structure');
        }
        [$headerB64, $payloadB64, $sigB64] = $parts;

        $expected = self::base64UrlEncode(hash_hmac('sha256', "$headerB64.$payloadB64", $secret, true));
        if (!hash_equals($expected, $sigB64)) {
            throw new RuntimeException('Invalid token signature');
        }

        $payload = json_decode(self::base64UrlDecode($payloadB64), true);
        if (!is_array($payload)) {
            throw new RuntimeException('Invalid token payload');
        }

        if (isset($payload['exp']) && $payload['exp'] < time()) {
            throw new RuntimeException('Token expired');
        }

        return $payload;
    }

    /**
     * Create an access + refresh token pair for a user.
     *
     * The access token is a signed JWT with `iat`, `exp`, and `type=access` claims.
     * The refresh token is a cryptographically random hex string (not a JWT); only
     * its SHA-256 hash should be stored in the database.
     *
     * @param  array  $userPayload  Base claims to include in the access token (e.g. sub, username, role).
     * @param  string $secret       HMAC signing secret.
     * @param  int    $accessExpiry Access token lifetime in seconds.
     * @param  int    $refreshDays  Refresh token lifetime in days.
     * @return array{access_token: string, refresh_token: string, expires_in: int, refresh_expires_at: int}
     */
    public static function createPair(array $userPayload, string $secret, int $accessExpiry, int $refreshDays): array {
        $now = time();
        $access = self::encode(array_merge($userPayload, [
            'iat' => $now,
            'exp' => $now + $accessExpiry,
            'type' => 'access',
        ]), $secret);

        $refreshToken = bin2hex(random_bytes(32));
        return [
            'access_token'  => $access,
            'refresh_token' => $refreshToken,
            'expires_in'    => $accessExpiry,
            'refresh_expires_at' => $now + ($refreshDays * 86400),
        ];
    }
}
