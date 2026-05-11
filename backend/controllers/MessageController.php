<?php

class MessageController {
    public function index(): void {
        $user      = Middleware::requireAuth();
        $accountId = isset($_GET['account_id']) ? (int)$_GET['account_id'] : null;
        $folderId  = isset($_GET['folder_id'])  ? (int)$_GET['folder_id']  : null;
        $threadId  = isset($_GET['thread_id'])  ? (int)$_GET['thread_id']  : null;
        $unified   = !empty($_GET['unified']);
        $search    = trim($_GET['search'] ?? '');
        $page      = max(1, (int)($_GET['page'] ?? 1));
        $perPage   = min(100, max(10, (int)($_GET['per_page'] ?? 50)));
        $offset    = ($page - 1) * $perPage;
        $starred   = !empty($_GET['starred']);
        $unread    = !empty($_GET['unread']);

        // Build ownership subquery for this user's accounts
        $userSub = $user['sub'];

        $where  = ['m.is_deleted = 0'];
        $params = [];

        if ($unified) {
            $where[]  = 'a.user_id = ?';
            $params[] = $userSub;
        } elseif ($accountId) {
            Middleware::requireAccountOwnership($accountId, $userSub);
            $where[]  = 'm.account_id = ?';
            $params[] = $accountId;
        } else {
            $where[]  = 'a.user_id = ?';
            $params[] = $userSub;
        }

        if ($folderId) {
            $where[]  = 'm.folder_id = ?';
            $params[] = $folderId;
        }
        if ($threadId) {
            $where[]  = 'm.thread_id = ?';
            $params[] = $threadId;
        }
        if ($starred) {
            $where[] = 'm.is_starred = 1';
        }
        if ($unread) {
            $where[] = 'm.is_read = 0';
        }
        if ($search) {
            $where[]  = '(m.subject LIKE ? OR m.from_address LIKE ? OR m.from_name LIKE ? OR m.body_text LIKE ?)';
            $like     = '%' . str_replace(['%','_'], ['\\%','\\_'], $search) . '%';
            $params   = array_merge($params, [$like, $like, $like, $like]);
        }

        $whereStr = implode(' AND ', $where);
        $join     = 'JOIN email_accounts a ON m.account_id = a.id';

        $total = (int)Database::fetchScalar(
            "SELECT COUNT(*) FROM messages m $join WHERE $whereStr",
            $params
        );

        $messages = Database::fetchAll(
            "SELECT m.id, m.account_id, m.folder_id, m.thread_id, m.uid, m.message_id,
                    m.subject, m.from_address, m.from_name, m.to_addresses,
                    m.date, m.is_read, m.is_starred, m.is_flagged, m.has_attachments,
                    m.size, m.priority, m.created_at,
                    a.display_name as account_name, a.email_address as account_email
             FROM messages m $join
             WHERE $whereStr
             ORDER BY m.date DESC
             LIMIT ? OFFSET ?",
            array_merge($params, [$perPage, $offset])
        );

        // Attach labels to each message
        if ($messages) {
            $ids  = array_column($messages, 'id');
            $phs  = implode(',', array_fill(0, count($ids), '?'));
            $lbls = Database::fetchAll(
                "SELECT ml.message_id, l.id, l.name, l.color
                 FROM message_labels ml JOIN labels l ON ml.label_id = l.id
                 WHERE ml.message_id IN ($phs)",
                $ids
            );
            $labelMap = [];
            foreach ($lbls as $lbl) {
                $labelMap[$lbl['message_id']][] = $lbl;
            }
            foreach ($messages as &$msg) {
                $msg['labels'] = $labelMap[$msg['id']] ?? [];
                $msg['to_addresses'] = json_decode($msg['to_addresses'] ?? '[]', true);
            }
            unset($msg);
        }

        Response::success([
            'messages'   => $messages,
            'total'      => $total,
            'page'       => $page,
            'per_page'   => $perPage,
            'last_page'  => (int)ceil($total / $perPage),
        ]);
    }

    public function show(int $id): void {
        $user    = Middleware::requireAuth();
        $message = $this->getMessage($id, $user['sub']);

        // Decode JSON fields
        $message['to_addresses']  = json_decode($message['to_addresses'] ?? '[]', true);
        $message['cc_addresses']  = json_decode($message['cc_addresses'] ?? '[]', true);
        $message['bcc_addresses'] = json_decode($message['bcc_addresses'] ?? '[]', true);

        // Load attachments
        $message['attachments'] = Database::fetchAll(
            'SELECT id, filename, mime_type, size, content_id, is_inline FROM attachments WHERE message_id = ?',
            [$id]
        );

        // Load labels
        $message['labels'] = Database::fetchAll(
            'SELECT l.id, l.name, l.color FROM message_labels ml JOIN labels l ON ml.label_id = l.id WHERE ml.message_id = ?',
            [$id]
        );

        // Mark as read on open
        if (!$message['is_read']) {
            Database::query('UPDATE messages SET is_read = 1 WHERE id = ?', [$id]);
            $message['is_read'] = 1;
            // Update unread count on folder
            Database::query(
                'UPDATE folders SET unread_count = GREATEST(0, unread_count - 1) WHERE id = ?',
                [$message['folder_id']]
            );
        }

        Response::success($message);
    }

    public function update(int $id): void {
        $user    = Middleware::requireAuth();
        $message = $this->getMessage($id, $user['sub']);
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];

        $fields = [];
        $params = [];

        $boolFields = ['is_read', 'is_starred', 'is_flagged'];
        foreach ($boolFields as $f) {
            if (array_key_exists($f, $body)) {
                $fields[] = "$f = ?";
                $params[] = $body[$f] ? 1 : 0;
            }
        }
        if (isset($body['priority'])) {
            $p = max(1, min(5, (int)$body['priority']));
            $fields[] = 'priority = ?';
            $params[] = $p;
        }

        if ($fields) {
            $params[] = $id;
            Database::query('UPDATE messages SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);

            // Sync unread count on folder
            if (array_key_exists('is_read', $body)) {
                $delta = $body['is_read'] ? -1 : 1;
                Database::query(
                    'UPDATE folders SET unread_count = GREATEST(0, unread_count + ?) WHERE id = ?',
                    [$delta, $message['folder_id']]
                );
            }
        }

        Response::success(null, 'Message updated');
    }

    public function destroy(int $id): void {
        $user    = Middleware::requireAuth();
        $message = $this->getMessage($id, $user['sub']);

        // Try to move to trash first; if already in trash, hard-delete
        $trash = Database::fetchOne(
            "SELECT * FROM folders WHERE account_id = ? AND special_use = 'trash'",
            [$message['account_id']]
        );

        if ($trash && $message['folder_id'] != $trash['id']) {
            Database::query(
                'UPDATE messages SET folder_id = ?, is_deleted = 0 WHERE id = ?',
                [$trash['id'], $id]
            );
        } else {
            Database::query('UPDATE messages SET is_deleted = 1 WHERE id = ?', [$id]);
        }

        Response::success(null, 'Message deleted');
    }

    public function move(int $id): void {
        $user    = Middleware::requireAuth();
        $message = $this->getMessage($id, $user['sub']);
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];

        $folderId = (int)($body['folder_id'] ?? 0);
        if (!$folderId) Response::error('folder_id required');

        $folder = Database::fetchOne(
            'SELECT * FROM folders WHERE id = ? AND account_id = ?',
            [$folderId, $message['account_id']]
        );
        if (!$folder) Response::notFound('Folder not found or wrong account');

        Database::query('UPDATE messages SET folder_id = ? WHERE id = ?', [$folderId, $id]);

        // Update folder unread counts
        if (!$message['is_read']) {
            Database::query(
                'UPDATE folders SET unread_count = GREATEST(0, unread_count - 1) WHERE id = ?',
                [$message['folder_id']]
            );
            Database::query(
                'UPDATE folders SET unread_count = unread_count + 1 WHERE id = ?',
                [$folderId]
            );
        }

        Response::success(null, 'Message moved');
    }

    public function send(): void {
        $user = Middleware::requireAuth();
        $body = json_decode(file_get_contents('php://input'), true) ?? [];

        $accountId = (int)($body['account_id'] ?? 0);
        if (!$accountId) Response::error('account_id required');

        $account = Middleware::requireAccountOwnership($accountId, $user['sub']);

        if (empty($body['to']) || !is_array($body['to'])) {
            Response::error('At least one recipient required');
        }

        $enc  = new Encryption();
        $smtp = new SMTPClient($account, $enc);

        // Resolve signature
        $htmlBody = $body['body_html'] ?? '';
        $textBody = $body['body_text'] ?? strip_tags($htmlBody);

        // Resolve attachments
        $attachments   = [];
        $inlineImages  = [];
        if (!empty($body['attachment_ids'])) {
            foreach ($body['attachment_ids'] as $attId) {
                $att = Database::fetchOne('SELECT * FROM attachments WHERE id = ?', [(int)$attId]);
                if ($att && file_exists($att['file_path'])) {
                    $data = file_get_contents($att['file_path']);
                    if ($att['is_inline']) {
                        $inlineImages[] = ['filename' => $att['filename'], 'mime_type' => $att['mime_type'],
                                           'content_id' => $att['content_id'], 'data' => $data];
                    } else {
                        $attachments[] = ['filename' => $att['filename'], 'mime_type' => $att['mime_type'], 'data' => $data];
                    }
                }
            }
        }
        // Handle base64 inline uploads
        if (!empty($body['inline_images'])) {
            foreach ($body['inline_images'] as $img) {
                $inlineImages[] = [
                    'filename'   => $img['filename'],
                    'mime_type'  => $img['mime_type'],
                    'content_id' => $img['content_id'],
                    'data'       => base64_decode($img['data']),
                ];
            }
        }
        if (!empty($body['new_attachments'])) {
            foreach ($body['new_attachments'] as $att) {
                $attachments[] = [
                    'filename'  => $att['filename'],
                    'mime_type' => $att['mime_type'] ?? 'application/octet-stream',
                    'data'      => base64_decode($att['data']),
                ];
            }
        }

        try {
            $smtp->send([
                'from'          => ['name' => $account['display_name'], 'email' => $account['email_address']],
                'to'            => $body['to'],
                'cc'            => $body['cc'] ?? [],
                'bcc'           => $body['bcc'] ?? [],
                'subject'       => $body['subject'] ?? '',
                'body_text'     => $textBody,
                'body_html'     => $htmlBody,
                'in_reply_to'   => $body['in_reply_to'] ?? null,
                'reply_to'      => $body['reply_to'] ?? null,
                'attachments'   => $attachments,
                'inline_images' => $inlineImages,
            ]);
        } catch (RuntimeException $e) {
            Response::error('Send failed: ' . $e->getMessage(), 500);
        }

        // Save to Sent folder in DB
        $sentFolder = Database::fetchOne(
            "SELECT * FROM folders WHERE account_id = ? AND special_use = 'sent'",
            [$accountId]
        );
        if ($sentFolder) {
            $toJson  = json_encode($body['to']);
            $ccJson  = json_encode($body['cc'] ?? []);
            Database::query(
                'INSERT INTO messages
                 (account_id, folder_id, uid, subject, from_address, from_name, to_addresses, cc_addresses,
                  date, body_text, body_html, is_read, has_attachments)
                 VALUES (?,?,?,?,?,?,?,?,NOW(),?,?,1,?)',
                [
                    $accountId, $sentFolder['id'], 0,
                    $body['subject'] ?? '',
                    $account['email_address'], $account['display_name'],
                    $toJson, $ccJson,
                    $textBody, $htmlBody,
                    empty($attachments) ? 0 : 1,
                ]
            );
        }

        Response::success(null, 'Message sent');
    }

    public function updateLabels(int $id): void {
        $user    = Middleware::requireAuth();
        $message = $this->getMessage($id, $user['sub']);
        $body    = json_decode(file_get_contents('php://input'), true) ?? [];

        $labelIds = array_map('intval', $body['label_ids'] ?? []);

        // Verify all labels belong to same account
        if ($labelIds) {
            $phs  = implode(',', array_fill(0, count($labelIds), '?'));
            $valid = Database::fetchAll(
                "SELECT id FROM labels WHERE id IN ($phs) AND account_id = ?",
                array_merge($labelIds, [$message['account_id']])
            );
            $validIds = array_column($valid, 'id');
        } else {
            $validIds = [];
        }

        // Replace labels
        Database::query('DELETE FROM message_labels WHERE message_id = ?', [$id]);
        foreach ($validIds as $lid) {
            Database::query('INSERT IGNORE INTO message_labels (message_id, label_id) VALUES (?, ?)', [$id, $lid]);
        }

        Response::success(null, 'Labels updated');
    }

    public function pollNew(): void {
        $user  = Middleware::requireAuth();
        $since = $_GET['since'] ?? date('Y-m-d H:i:s', strtotime('-5 minutes'));

        $messages = Database::fetchAll(
            "SELECT m.id, m.account_id, m.subject, m.from_name, m.from_address, m.date,
                    a.display_name as account_name
             FROM messages m
             JOIN email_accounts a ON m.account_id = a.id
             WHERE a.user_id = ? AND m.is_read = 0 AND m.is_deleted = 0
               AND m.created_at > ?
             ORDER BY m.date DESC LIMIT 20",
            [$user['sub'], $since]
        );

        Response::success(['new_messages' => $messages, 'count' => count($messages)]);
    }

    // ----------------------------------------------------------------

    private function getMessage(int $id, int $userId): array {
        $msg = Database::fetchOne(
            'SELECT m.*, a.user_id FROM messages m
             JOIN email_accounts a ON m.account_id = a.id
             WHERE m.id = ?',
            [$id]
        );
        if (!$msg) Response::notFound('Message not found');
        if ($msg['user_id'] != $userId) Response::forbidden();
        return $msg;
    }
}
