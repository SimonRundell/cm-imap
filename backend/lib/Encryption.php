<?php

/**
 * AES-256-CBC encryption for storing IMAP/SMTP credentials.
 * Each value gets a unique IV stored alongside the ciphertext.
 */
class Encryption {
    private string $key;

    public function __construct() {
        $cfg = require __DIR__ . '/../config/app.php';
        // Key must be 32 bytes for AES-256
        $this->key = substr(hash('sha256', $cfg['encryption_key'], true), 0, 32);
    }

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
