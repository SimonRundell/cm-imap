<?php

/**
 * Manages IMAP folder listings, subscriptions, and server-side folder creation.
 *
 * @package CM-IMAP\Controllers
 */
class FolderController {
    /**
     * List folders for one or all of the authenticated user's accounts.
     *
     * If `account_id` is provided as a query parameter, ownership is verified and
     * folders for that account are returned. Otherwise all folders across all the
     * user's accounts are returned, ordered by account then special-use/path.
     *
     * @return void
     */
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

    /**
     * Sync the folder list from the IMAP server into the database.
     *
     * Connects to the server, retrieves all folder paths, and upserts them into
     * the `folders` table. Returns the updated folder list for the account.
     * Requires `account_id` as a query parameter.
     *
     * @return void
     */
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

    /**
     * Update a folder's local settings (currently: subscription status).
     *
     * Ownership of the folder's account is verified before any change is applied.
     *
     * @param  int $id Folder primary key.
     * @return void
     */
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

    /**
     * Create a new folder on the IMAP server and register it locally.
     *
     * Requires `account_id` and `name` in the request body. The folder is
     * created on the remote server first, then inserted into the local `folders`
     * table (IGNORE to avoid duplicates).
     *
     * @return void
     */
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

    /**
     * Extract the display name (final path segment) from a full folder path.
     *
     * @param  string $path Folder full path (may use `/`, `.`, or `\` as separator).
     * @return string Folder display name.
     */
    private function basename(string $path): string {
        $parts = explode('/', str_replace(['\\', '.'], '/', $path));
        return end($parts) ?: $path;
    }
}
