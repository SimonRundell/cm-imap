<?php

/**
 * Minimal JWT implementation — HS256 only.
 * No external dependencies.
 */
class JWT {
    private static function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): string {
        $padded = str_pad(strtr($data, '-_', '+/'), strlen($data) + (4 - strlen($data) % 4) % 4, '=');
        return base64_decode($padded);
    }

    public static function encode(array $payload, string $secret): string {
        $header  = self::base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = self::base64UrlEncode(json_encode($payload));
        $sig     = self::base64UrlEncode(hash_hmac('sha256', "$header.$payload", $secret, true));
        return "$header.$payload.$sig";
    }

    /**
     * Decode and validate a JWT.
     * Returns payload array on success, throws on failure.
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

    /** Create an access + refresh token pair */
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
