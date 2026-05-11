<?php

class SignatureController {
    public function index(): void {
        $user = Middleware::requireAuth();
        $sigs = Database::fetchAll(
            'SELECT * FROM signatures WHERE user_id = ? ORDER BY is_default DESC, name',
            [$user['sub']]
        );
        Response::success($sigs);
    }

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

    public function destroy(int $id): void {
        $user = Middleware::requireAuth();
        $this->ownerSig($id, $user['sub']);
        Database::query('DELETE FROM signatures WHERE id = ?', [$id]);
        Response::success(null, 'Signature deleted');
    }

    private function ownerSig(int $id, int $userId): array {
        $sig = Database::fetchOne('SELECT * FROM signatures WHERE id = ? AND user_id = ?', [$id, $userId]);
        if (!$sig) Response::notFound('Signature not found');
        return $sig;
    }

    private function body(): array {
        return json_decode(file_get_contents('php://input'), true) ?? [];
    }
}
