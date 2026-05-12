<?php
// Copy this file to app.php and fill in your values,
// or let setup.sh generate it automatically.
return [
    'jwt_secret'       => 'CHANGE_ME_run_openssl_rand_hex_48',
    'jwt_expiry'       => 3600,       // access token lifetime in seconds
    'jwt_refresh_days' => 30,         // refresh token lifetime in days
    'encryption_key'   => 'CHANGE_ME_run_openssl_rand_hex_32',
    'cors_origin'      => '*',        // restrict in production, e.g. 'https://mail.example.com'
    'attachment_path'  => '/var/www/cm-imap-attachments',
    'app_name'         => 'CM-IMAP',
];
