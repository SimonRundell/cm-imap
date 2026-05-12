<?php

/**
 * AES-256-CBC encryption for storing IMAP/SMTP credentials.
 * Each value gets a unique IV stored alongside the ciphertext.
 *
 * @package CM-IMAP\Lib
 */
class Encryption {
    /** @var string 32-byte AES-256 key derived from the app config value */
    private string $key;

    /**
     * Derive the encryption key from app config.
     *
     * The raw config value is hashed with SHA-256 to guarantee exactly 32 bytes
     * suitable for AES-256.
     */
    public function __construct() {
        $cfg = require __DIR__ . '/../config/app.php';
        // Key must be 32 bytes for AES-256
        $this->key = substr(hash('sha256', $cfg['encryption_key'], true), 0, 32);
    }

    /**
     * Encrypt a plaintext string using AES-256-CBC with a random IV.
     *
     * @param  string $plaintext Value to encrypt.
     * @return array{enc: string, iv: string} Base64-encoded ciphertext and IV.
     * @throws RuntimeException If openssl_encrypt fails.
     */
    public function encrypt(string $plaintext): array {
        $iv         = random_bytes(16);
        $ciphertext = openssl_encrypt($plaintext, 'AES-256-CBC', $this->key, OPENSSL_RAW_DATA, $iv);
        if ($ciphertext === false) {
            throw new RuntimeException('Encryption failed');
        }
        return [
            'enc' => base64_encode($ciphertext),
            'iv'  => base64_encode($iv),
        ];
    }

    /**
     * Decrypt a value previously produced by {@see encrypt()}.
     *
     * @param  string $enc Base64-encoded ciphertext.
     * @param  string $iv  Base64-encoded initialisation vector.
     * @return string Decrypted plaintext.
     * @throws RuntimeException If openssl_decrypt fails.
     */
    public function decrypt(string $enc, string $iv): string {
        $plaintext = openssl_decrypt(
            base64_decode($enc),
            'AES-256-CBC',
            $this->key,
            OPENSSL_RAW_DATA,
            base64_decode($iv)
        );
        if ($plaintext === false) {
            throw new RuntimeException('Decryption failed');
        }
        return $plaintext;
    }
}
