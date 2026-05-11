<?php

class LabelController {
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

    public function destroy(int $id): void {
        $user = Middleware::requireAuth();
        $this->ownerLabel($id, $user['sub']);
        Database::query('DELETE FROM labels WHERE id = ?', [$id]);
        Response::success(null, 'Label deleted');
    }

    private function ownerLabel(int $id, int $userId): array {
        $label = Database::fetchOne(
            'SELECT l.* FROM labels l JOIN email_accounts a ON l.account_id = a.id
             WHERE l.id = ? AND a.user_id = ?',
            [$id, $userId]
        );
        if (!$label) Response::notFound('Label not found');
        return $label;
    }

    private function body(): array {
        return json_decode(file_get_contents('php://input'), true) ?? [];
    }
}
