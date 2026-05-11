<?php

class FolderController {
    public function index(): void {
        $user      = Middleware::requireAuth();
        $accountId = (int)($_GET['account_id'] ?? 0);

        if ($accountId) {
            Middleware::requireAccountOwnership($accountId, $user['sub']);
            $folders = Database::fetchAll(
                'SELECT * FROM folders WHERE account_id = ? ORDER BY special_use DESC, full_path',
                [$accountId]
            );
        } else {
            // All folders for all user accounts
            $folders = Database::fetchAll(
                'SELECT f.* FROM folders f
                 JOIN email_accounts a ON f.account_id = a.id
                 WHERE a.user_id = ?
                 ORDER BY a.id, f.special_use DESC, f.full_path',
                [$user['sub']]
            );
        }

        Response::success($folders);
    }

    public function sync(): void {
        $user      = Middleware::requireAuth();
        $accountId = (int)($_GET['account_id'] ?? 0);
        if (!$accountId) Response::error('account_id required');

        $account = Middleware::requireAccountOwnership($accountId, $user['sub']);
        $enc     = new Encryption();
        $imap    = new IMAPClient($account, $enc);

        try {
            $imap->connect('INBOX');
            $remoteFolders = $imap->listFolders();
            $imap->disconnect();

            foreach ($remoteFolders as $path) {
                $name = $this->basename($path);
                Database::query(
                    'INSERT INTO folders (account_id, name, full_path) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE name = VALUES(name)',
                    [$accountId, $name, $path]
                );
            }

            $folders = Database::fetchAll(
                'SELECT * FROM folders WHERE account_id = ? ORDER BY full_path',
                [$accountId]
            );
            Response::success($folders, 'Folders synced');
        } catch (RuntimeException $e) {
            Response::error('Folder sync failed: ' . $e->getMessage(), 500);
        }
    }

    public function update(int $id): void {
        $user   = Middleware::requireAuth();
        $folder = Database::fetchOne('SELECT * FROM folders WHERE id = ?', [$id]);
        if (!$folder) Response::notFound('Folder not found');

        Middleware::requireAccountOwnership($folder['account_id'], $user['sub']);

        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        if (isset($body['is_subscribed'])) {
            Database::query(
                'UPDATE folders SET is_subscribed = ? WHERE id = ?',
                [$body['is_subscribed'] ? 1 : 0, $id]
            );
        }

        Response::success(null, 'Folder updated');
    }

    public function createFolder(): void {
        $user = Middleware::requireAuth();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $accountId = (int)($body['account_id'] ?? 0);
        $name      = trim($body['name'] ?? '');
        if (!$accountId || !$name) Response::error('account_id and name required');

        $account = Middleware::requireAccountOwnership($accountId, $user['sub']);
        $enc     = new Encryption();
        $imap    = new IMAPClient($account, $enc);

        try {
            $imap->connect('INBOX');
            $imap->createFolder($name);
            $imap->disconnect();

            Database::query(
                'INSERT IGNORE INTO folders (account_id, name, full_path) VALUES (?, ?, ?)',
                [$accountId, $name, $name]
            );

            Response::success(null, 'Folder created', 201);
        } catch (RuntimeException $e) {
            Response::error('Create folder failed: ' . $e->getMessage(), 500);
        }
    }

    private function basename(string $path): string {
        $parts = explode('/', str_replace(['\\', '.'], '/', $path));
        return end($parts) ?: $path;
    }
}
