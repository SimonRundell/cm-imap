<?php

/**
 * Manages out-of-office / vacation autoreply settings per email account.
 *
 * Each account has at most one autoreply record. The upsert endpoint creates or
 * replaces it. Disabling an autoreply also clears the `autoreply_sent` deduplication
 * log so the reply will fire again if the feature is later re-enabled.
 *
 * @package CM-IMAP\Controllers
 */
class AutoreplyController {
    /**
     * Return the autoreply configuration for a given account.
     *
     * Returns null data if no autoreply has been configured yet.
     *
     * @return void — expects `account_id` query parameter.
     */
    public function index(): void {
        $user      = Middleware::requireAuth();
        $accountId = (int)($_GET['account_id'] ?? 0);
        if (!$accountId) Response::error('account_id required');

        Middleware::requireAccountOwnership($accountId, $user['sub']);

        $ar = Database::fetchOne(
            'SELECT * FROM autoreplies WHERE account_id = ?',
            [$accountId]
        );

        Response::success($ar);
    }

    /**
     * Create or update the autoreply for an account (upsert).
     *
     * When enabling, `subject` and `html_body` are required. When disabling,
     * the `autoreply_sent` log is cleared so the counter resets for the next
     * activation period.
     *
     * @return void
     */
    public function upsert(): void {
        $user = Middleware::requireAuth();
        $body = $this->body();

        $accountId = (int)($body['account_id'] ?? 0);
        if (!$accountId) Response::error('account_id required');

        Middleware::requireAccountOwnership($accountId, $user['sub']);

        $subject    = trim($body['subject'] ?? '');
        $htmlBody   = $body['html_body'] ?? '';
        $isEnabled  = !empty($body['is_enabled']) ? 1 : 0;
        $startDate  = $body['start_date'] ?? null;
        $endDate    = $body['end_date']   ?? null;

        if ($isEnabled && (!$subject || !$htmlBody)) {
            Response::error('Subject and body are required when enabling autoreply');
        }

        Database::query(
            'INSERT INTO autoreplies (account_id, is_enabled, subject, html_body, start_date, end_date)
             VALUES (?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
             is_enabled = VALUES(is_enabled), subject = VALUES(subject),
             html_body = VALUES(html_body), start_date = VALUES(start_date), end_date = VALUES(end_date)',
            [$accountId, $isEnabled, $subject, $htmlBody, $startDate ?: null, $endDate ?: null]
        );

        // If disabling, clear sent tracking so it resets when re-enabled
        if (!$isEnabled) {
            Database::query('DELETE FROM autoreply_sent WHERE account_id = ?', [$accountId]);
        }

        $ar = Database::fetchOne('SELECT * FROM autoreplies WHERE account_id = ?', [$accountId]);
        Response::success($ar);
    }

    /**
     * Remove the autoreply configuration and its sent-tracking log for an account.
     *
     * @param  int $accountId Account primary key (route parameter).
     * @return void
     */
    public function destroy(int $accountId): void {
        $user = Middleware::requireAuth();
        Middleware::requireAccountOwnership($accountId, $user['sub']);
        Database::query('DELETE FROM autoreplies WHERE account_id = ?', [$accountId]);
        Database::query('DELETE FROM autoreply_sent WHERE account_id = ?', [$accountId]);
        Response::success(null, 'Autoreply removed');
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
