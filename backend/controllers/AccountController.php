<?php

class AccountController {
    private Encryption $enc;

    public function __construct() {
        $this->enc = new Encryption();
    }

    public function index(): void {
        $user     = Middleware::requireAuth();
        $accounts = Database::fetchAll(
            'SELECT id, display_name, email_address, imap_host, imap_port, imap_encryption,
                    imap_username, smtp_host, smtp_port, smtp_encryption, smtp_username,
                    is_active, last_sync, sync_error, created_at
             FROM email_accounts WHERE user_id = ? ORDER BY id',
            [$user['sub']]
        );
        Response::success($accounts);
    }

    public function store(): void {
        $user = Middleware::requireAuth();
        $body = $this->getBody();

        $required = ['display_name','email_address','imap_host','imap_port','imap_encryption',
                     'imap_username','imap_password','smtp_host','smtp_port','smtp_encryption',
                     'smtp_username','smtp_password'];
        foreach ($required as $f) {
            if (empty($body[$f]) && $body[$f] !== '0') {
                Response::error("Field '$f' is required");
            }
        }

        if (!filter_var($body['email_address'], FILTER_VALIDATE_EMAIL)) {
            Response::error('Invalid email address');
        }

        $imapEnc = $this->enc->encrypt($body['imap_password']);
        $smtpEnc = $this->enc->encrypt($body['smtp_password']);

        Database::query(
            'INSERT INTO email_accounts
             (user_id, display_name, email_address,
              imap_host, imap_port, imap_encryption, imap_username, imap_password_enc, imap_password_iv,
              smtp_host, smtp_port, smtp_encryption, smtp_username, smtp_password_enc, smtp_password_iv)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                $user['sub'],
                $body['display_name'], $body['email_address'],
                $body['imap_host'], $body['imap_port'], $body['imap_encryption'],
                $body['imap_username'], $imapEnc['enc'], $imapEnc['iv'],
                $body['smtp_host'], $body['smtp_port'], $body['smtp_encryption'],
                $body['smtp_username'], $smtpEnc['enc'], $smtpEnc['iv'],
            ]
        );
        $id = (int)Database::lastInsertId();
        $account = Database::fetchOne('SELECT id, display_name, email_address FROM email_accounts WHERE id = ?', [$id]);
        Response::success($account, 'Account added', 201);
    }

    public function update(int $id): void {
        $user    = Middleware::requireAuth();
        $account = Middleware::requireAccountOwnership($id, $user['sub']);
        $body    = $this->getBody();

        $fields  = [];
        $params  = [];

        $strFields = ['display_name','email_address','imap_host','imap_encryption','imap_username',
                      'smtp_host','smtp_encryption','smtp_username'];
        $intFields = ['imap_port','smtp_port'];

        foreach ($strFields as $f) {
            if (isset($body[$f])) { $fields[] = "$f = ?"; $params[] = $body[$f]; }
        }
        foreach ($intFields as $f) {
            if (isset($body[$f])) { $fields[] = "$f = ?"; $params[] = (int)$body[$f]; }
        }
        if (isset($body['imap_password']) && $body['imap_password']) {
            $e = $this->enc->encrypt($body['imap_password']);
            $fields[] = 'imap_password_enc = ?'; $params[] = $e['enc'];
            $fields[] = 'imap_password_iv = ?';  $params[] = $e['iv'];
        }
        if (isset($body['smtp_password']) && $body['smtp_password']) {
            $e = $this->enc->encrypt($body['smtp_password']);
            $fields[] = 'smtp_password_enc = ?'; $params[] = $e['enc'];
            $fields[] = 'smtp_password_iv = ?';  $params[] = $e['iv'];
        }
        if (isset($body['is_active'])) {
            $fields[] = 'is_active = ?'; $params[] = $body['is_active'] ? 1 : 0;
        }

        if ($fields) {
            $params[] = $id;
            Database::query('UPDATE email_accounts SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
        }

        Response::success(null, 'Account updated');
    }

    public function destroy(int $id): void {
        $user = Middleware::requireAuth();
        Middleware::requireAccountOwnership($id, $user['sub']);
        Database::query('DELETE FROM email_accounts WHERE id = ?', [$id]);
        Response::success(null, 'Account deleted');
    }

    public function testConnection(int $id): void {
        $user    = Middleware::requireAuth();
        $account = Middleware::requireAccountOwnership($id, $user['sub']);

        $body = $this->getBody();
        $type = $body['type'] ?? 'imap'; // 'imap' or 'smtp'

        try {
            if ($type === 'smtp') {
                // Quick SMTP connection test (no send)
                $enc    = $this->enc;
                $host   = $account['smtp_host'];
                $port   = (int)$account['smtp_port'];
                $encType = $account['smtp_encryption'];

                $context = stream_context_create(['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
                $proto   = ($encType === 'ssl') ? 'ssl' : 'tcp';
                $sock    = @stream_socket_client("$proto://$host:$port", $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $context);
                if (!$sock) throw new RuntimeException("Cannot connect: $errstr");
                fclose($sock);
                Response::success(null, 'SMTP connection successful');
            } else {
                $imap = new IMAPClient($account, $this->enc);
                $imap->connect('INBOX');
                $imap->disconnect();
                Response::success(null, 'IMAP connection successful');
            }
        } catch (RuntimeException $e) {
            Response::error('Connection failed: ' . $e->getMessage());
        }
    }

    public function sync(int $id): void {
        $user    = Middleware::requireAuth();
        $account = Middleware::requireAccountOwnership($id, $user['sub']);

        if (!$account['is_active']) {
            Response::error('Account is inactive');
        }

        try {
            $svc   = new SyncService();
            $stats = $svc->syncAccount($account);
            Response::success($stats, 'Sync complete');
        } catch (RuntimeException $e) {
            Response::error('Sync failed: ' . $e->getMessage(), 500);
        }
    }

    private function getBody(): array {
        return json_decode(file_get_contents('php://input'), true) ?? [];
    }
}
