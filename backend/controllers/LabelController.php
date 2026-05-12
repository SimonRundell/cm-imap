<?php

/**
 * Manages user-defined labels for email accounts.
 *
 * Labels are scoped to an email account (not to a user directly) and can be
 * applied to messages. Each label has a display name and a hex colour code.
 *
 * @package CM-IMAP\Controllers
 */
class LabelController {
    /**
     * List all labels for a given account with their message counts.
     *
     * Requires `account_id` query parameter.
     *
     * @return void
     */
    public function index(): void {
        $user      = Middleware::requireAuth();
        $accountId = (int)($_GET['account_id'] ?? 0);
        if (!$accountId) Response::error('account_id required');

        Middleware::requireAccountOwnership($accountId, $user['sub']);

        $labels = Database::fetchAll(
            'SELECT l.*, COUNT(ml.message_id) as message_count
             FROM labels l
             LEFT JOIN message_labels ml ON l.id = ml.label_id
             WHERE l.account_id = ?
             GROUP BY l.id
             ORDER BY l.name',
            [$accountId]
        );

        Response::success($labels);
    }

    /**
     * Create a new label for an account.
     *
     * Defaults the colour to blue (`#3B82F6`) if not provided.
     *
     * @return void
     */
    public function store(): void {
        $user = Middleware::requireAuth();
        $body = $this->body();

        $accountId = (int)($body['account_id'] ?? 0);
        if (!$accountId) Response::error('account_id required');
        Middleware::requireAccountOwnership($accountId, $user['sub']);

        $name  = trim($body['name'] ?? '');
        $color = trim($body['color'] ?? '#3B82F6');
        if (!$name) Response::error('Label name required');

        Database::query(
            'INSERT INTO labels (account_id, name, color) VALUES (?,?,?)',
            [$accountId, $name, $color]
        );
        $label = Database::fetchOne('SELECT * FROM labels WHERE id = ?', [Database::lastInsertId()]);
        Response::success($label, 'Label created', 201);
    }

    /**
     * Update a label's name and/or colour.
     *
     * Ownership is verified via {@see ownerLabel()}.
     *
     * @param  int $id Label primary key.
     * @return void
     */
    public function update(int $id): void {
        $user  = Middleware::requireAuth();
        $label = $this->ownerLabel($id, $user['sub']);
        $body  = $this->body();

        $fields = [];
        $params = [];
        if (isset($body['name']))  { $fields[] = 'name = ?';  $params[] = $body['name']; }
        if (isset($body['color'])) { $fields[] = 'color = ?'; $params[] = $body['color']; }

        if ($fields) {
            $params[] = $id;
            Database::query('UPDATE labels SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
        }
        Response::success(null, 'Label updated');
    }

    /**
     * Delete a label.
     *
     * Associated `message_labels` rows are removed by the database cascade.
     * Ownership is verified before deletion.
     *
     * @param  int $id Label primary key.
     * @return void
     */
    public function destroy(int $id): void {
        $user = Middleware::requireAuth();
        $this->ownerLabel($id, $user['sub']);
        Database::query('DELETE FROM labels WHERE id = ?', [$id]);
        Response::success(null, 'Label deleted');
    }

    /**
     * Fetch a label row and verify it belongs to an account owned by the user.
     *
     * Responds with 404 and exits if the label does not exist or the user
     * does not own the parent account.
     *
     * @param  int $id     Label primary key.
     * @param  int $userId Authenticated user ID.
     * @return array<string, mixed> The labels row.
     */
    private function ownerLabel(int $id, int $userId): array {
        $label = Database::fetchOne(
            'SELECT l.* FROM labels l JOIN email_accounts a ON l.account_id = a.id
             WHERE l.id = ? AND a.user_id = ?',
            [$id, $userId]
        );
        if (!$label) Response::notFound('Label not found');
        return $label;
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
