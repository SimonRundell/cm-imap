<?php

/**
 * Manages HTML email signatures for users.
 *
 * Signatures belong to a user and may optionally be scoped to a specific email account.
 * At most one signature per user can be marked as the default; setting a new default
 * clears the previous one.
 *
 * @package CM-IMAP\Controllers
 */
class SignatureController {
    /**
     * List all signatures for the authenticated user.
     *
     * Defaults are returned first, then sorted alphabetically by name.
     *
     * @return void
     */
    public function index(): void {
        $user = Middleware::requireAuth();
        $sigs = Database::fetchAll(
            'SELECT * FROM signatures WHERE user_id = ? ORDER BY is_default DESC, name',
            [$user['sub']]
        );
        Response::success($sigs);
    }

    /**
     * Create a new signature.
     *
     * If `is_default` is true, all other signatures for the user are cleared first.
     * The optional `account_id` scopes the signature to a specific account; ownership
     * is verified when provided.
     *
     * @return void
     */
    public function store(): void {
        $user = Middleware::requireAuth();
        $body = $this->body();

        $name    = trim($body['name'] ?? '');
        $content = $body['html_content'] ?? '';
        if (!$name) Response::error('Name required');

        $accountId = isset($body['account_id']) ? (int)$body['account_id'] : null;
        if ($accountId) {
            Middleware::requireAccountOwnership($accountId, $user['sub']);
        }

        $isDefault = !empty($body['is_default']) ? 1 : 0;
        if ($isDefault) {
            Database::query('UPDATE signatures SET is_default = 0 WHERE user_id = ?', [$user['sub']]);
        }

        Database::query(
            'INSERT INTO signatures (user_id, account_id, name, html_content, is_default) VALUES (?,?,?,?,?)',
            [$user['sub'], $accountId, $name, $content, $isDefault]
        );

        $sig = Database::fetchOne('SELECT * FROM signatures WHERE id = ?', [Database::lastInsertId()]);
        Response::success($sig, 'Signature created', 201);
    }

    /**
     * Update an existing signature.
     *
     * Only fields present in the request body are modified. Setting `is_default = true`
     * clears the previous default before applying the change. Ownership is verified.
     *
     * @param  int $id Signature primary key.
     * @return void
     */
    public function update(int $id): void {
        $user = Middleware::requireAuth();
        $sig  = $this->ownerSig($id, $user['sub']);
        $body = $this->body();

        $fields = [];
        $params = [];

        if (isset($body['name']))         { $fields[] = 'name = ?';         $params[] = $body['name']; }
        if (isset($body['html_content'])) { $fields[] = 'html_content = ?'; $params[] = $body['html_content']; }
        if (isset($body['account_id']))   { $fields[] = 'account_id = ?';   $params[] = $body['account_id'] ?: null; }
        if (isset($body['is_default'])) {
            $isDefault = $body['is_default'] ? 1 : 0;
            if ($isDefault) {
                Database::query('UPDATE signatures SET is_default = 0 WHERE user_id = ?', [$user['sub']]);
            }
            $fields[] = 'is_default = ?';
            $params[] = $isDefault;
        }

        if ($fields) {
            $params[] = $id;
            Database::query('UPDATE signatures SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
        }

        Response::success(null, 'Signature updated');
    }

    /**
     * Delete a signature.
     *
     * Ownership is verified before deletion.
     *
     * @param  int $id Signature primary key.
     * @return void
     */
    public function destroy(int $id): void {
        $user = Middleware::requireAuth();
        $this->ownerSig($id, $user['sub']);
        Database::query('DELETE FROM signatures WHERE id = ?', [$id]);
        Response::success(null, 'Signature deleted');
    }

    /**
     * Fetch a signature row and verify it belongs to the given user.
     *
     * Responds with 404 and exits if not found or not owned by the user.
     *
     * @param  int $id     Signature primary key.
     * @param  int $userId Authenticated user ID.
     * @return array<string, mixed> The signatures row.
     */
    private function ownerSig(int $id, int $userId): array {
        $sig = Database::fetchOne('SELECT * FROM signatures WHERE id = ? AND user_id = ?', [$id, $userId]);
        if (!$sig) Response::notFound('Signature not found');
        return $sig;
    }

    /**
     * Decode the JSON request body.
     *
     * @return array<string, mixed>
     */
    private function body(): array {
        return json_decode(file_get_contents('php://input'), true) ?? [];
    }
}
