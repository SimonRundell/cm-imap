<?php

class SyncService {
    private Encryption  $enc;
    private RulesEngine $rules;
    private string      $attachmentPath;

    public function __construct() {
        $this->enc            = new Encryption();
        $this->rules          = new RulesEngine();
        $this->attachmentPath = Database::getSetting('attachment_path', '/var/www/cm-imap-attachments');
    }

    // ----------------------------------------------------------------
    // Public: sync a single account
    // ----------------------------------------------------------------

    public function syncAccount(array $account): array {
        $stats = ['folders' => 0, 'new_messages' => 0, 'errors' => []];

        $imap = new IMAPClient($account, $this->enc);
        try {
            $imap->connect('INBOX');
        } catch (RuntimeException $e) {
            Database::query(
                'UPDATE email_accounts SET sync_error = ? WHERE id = ?',
                [$e->getMessage(), $account['id']]
            );
            throw $e;
        }

        try {
            // Sync folder list
            $this->syncFolders($imap, $account);
            $stats['folders'] = 1;

            // Sync messages in each subscribed folder
            $folders = Database::fetchAll(
                'SELECT * FROM folders WHERE account_id = ? AND is_subscribed = 1 AND is_selectable = 1',
                [$account['id']]
            );

            foreach ($folders as $folder) {
                try {
                    $new = $this->syncFolder($imap, $account, $folder);
                    $stats['new_messages'] += $new;
                } catch (RuntimeException $e) {
                    $stats['errors'][] = "Folder {$folder['full_path']}: " . $e->getMessage();
                    error_log("Sync error account {$account['id']} folder {$folder['full_path']}: " . $e->getMessage());
                }
            }

            // Update last sync time
            Database::query(
                'UPDATE email_accounts SET last_sync = NOW(), sync_error = NULL WHERE id = ?',
                [$account['id']]
            );

            // Process autoreplies for this account
            $this->processAutoreplies($account);

        } finally {
            $imap->disconnect();
        }

        return $stats;
    }

    // ----------------------------------------------------------------
    // Folder sync
    // ----------------------------------------------------------------

    private function syncFolders(IMAPClient $imap, array $account): void {
        $remoteFolders = $imap->listFolders();
        $existing = Database::fetchAll(
            'SELECT full_path FROM folders WHERE account_id = ?',
            [$account['id']]
        );
        $existingPaths = array_column($existing, 'full_path');

        foreach ($remoteFolders as $path) {
            $name      = $this->folderBasename($path);
            $specialUse = $this->detectSpecialUse($path);

            if (!in_array($path, $existingPaths)) {
                Database::query(
                    'INSERT IGNORE INTO folders (account_id, name, full_path, special_use) VALUES (?, ?, ?, ?)',
                    [$account['id'], $name, $path, $specialUse]
                );
            } elseif ($specialUse) {
                Database::query(
                    'UPDATE folders SET special_use = ? WHERE account_id = ? AND full_path = ? AND special_use = \'\'',
                    [$specialUse, $account['id'], $path]
                );
            }
        }
    }

    // ----------------------------------------------------------------
    // Message sync for a single folder
    // ----------------------------------------------------------------

    private function syncFolder(IMAPClient $imap, array $account, array $folder): int {
        $imap->selectFolder($folder['full_path']);

        $status = $imap->getFolderStatus($folder['full_path']);
        if (empty($status)) return 0;

        $remoteUidvalidity = $status['uidvalidity'];
        $newCount = 0;

        // If UIDVALIDITY changed, we must re-sync the whole folder
        if ($folder['uidvalidity'] && $folder['uidvalidity'] != $remoteUidvalidity) {
            Database::query(
                'DELETE FROM messages WHERE folder_id = ?',
                [$folder['id']]
            );
            Database::query(
                'UPDATE folders SET uidvalidity = ?, uidnext = 1 WHERE id = ?',
                [$remoteUidvalidity, $folder['id']]
            );
            $folder['uidnext'] = 1;
        }

        // Fetch UIDs newer than our last known UID
        $sinceUid = max(0, (int)($folder['uidnext'] ?? 1) - 1);
        $newUids  = $imap->getNewUids($sinceUid);

        foreach ($newUids as $uid) {
            try {
                $exists = Database::fetchScalar(
                    'SELECT id FROM messages WHERE account_id = ? AND folder_id = ? AND uid = ?',
                    [$account['id'], $folder['id'], $uid]
                );
                if ($exists) continue;

                $msgData = $imap->fetchMessage($uid);
                if (empty($msgData)) continue;

                $messageId = $this->storeMessage($msgData, $account, $folder, $imap);
                if ($messageId) {
                    $newCount++;
                }
            } catch (Throwable $e) {
                error_log("Sync message uid=$uid: " . $e->getMessage());
            }
        }

        // Update folder stats
        Database::query(
            'UPDATE folders SET uidvalidity = ?, uidnext = ?,
             message_count = ?, unread_count = ?, updated_at = NOW()
             WHERE id = ?',
            [
                $remoteUidvalidity,
                $status['uidnext'],
                $status['messages'],
                $status['unseen'],
                $folder['id'],
            ]
        );

        return $newCount;
    }

    // ----------------------------------------------------------------
    // Store a single message
    // ----------------------------------------------------------------

    private function storeMessage(array $msg, array $account, array $folder, IMAPClient $imap): ?int {
        $threadId = $this->resolveThread($msg, $account);

        $toJson  = json_encode($msg['to_addresses'] ?? []);
        $ccJson  = json_encode($msg['cc_addresses'] ?? []);
        $bccJson = json_encode($msg['bcc_addresses'] ?? []);

        Database::query(
            'INSERT INTO messages
             (account_id, folder_id, thread_id, uid, message_id, in_reply_to, references_header,
              subject, from_address, from_name, to_addresses, cc_addresses, bcc_addresses, reply_to,
              date, body_text, body_html, is_read, is_flagged, has_attachments, size, priority)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                $account['id'], $folder['id'], $threadId, $msg['uid'],
                $msg['message_id'], $msg['in_reply_to'], $msg['references_header'],
                $msg['subject'] ? mb_substr($msg['subject'], 0, 998) : null,
                $msg['from_address'], $msg['from_name'],
                $toJson, $ccJson, $bccJson, $msg['reply_to'],
                $msg['date'],
                $msg['body_text'] ?? null,
                $msg['body_html'] ?? null,
                $msg['is_read'], $msg['is_flagged'],
                $msg['has_attachments'], $msg['size'], $msg['priority'],
            ]
        );

        $messageId = (int)Database::lastInsertId();

        // Store attachments
        if (!empty($msg['attachments'])) {
            $this->storeAttachments($msg['attachments'], $messageId, $msg['uid'], $imap);
        }

        // Update thread
        if ($threadId) {
            Database::query(
                'UPDATE threads SET message_count = message_count + 1,
                 last_message_at = ?, has_unread = IF(? = 0, 1, has_unread)
                 WHERE id = ?',
                [$msg['date'], $msg['is_read'], $threadId]
            );
        }

        // Apply rules (fetch full message row for rules engine)
        $fullMessage = Database::fetchOne('SELECT * FROM messages WHERE id = ?', [$messageId]);
        if ($fullMessage) {
            $this->rules->apply($fullMessage, $account);
        }

        return $messageId;
    }

    // ----------------------------------------------------------------
    // Thread resolution
    // ----------------------------------------------------------------

    private function resolveThread(array $msg, array $account): ?int {
        // 1. Match by In-Reply-To → find parent message → use its thread
        if (!empty($msg['in_reply_to'])) {
            $parent = Database::fetchOne(
                'SELECT thread_id FROM messages WHERE account_id = ? AND message_id = ?',
                [$account['id'], $msg['in_reply_to']]
            );
            if ($parent && $parent['thread_id']) {
                return $parent['thread_id'];
            }
        }

        // 2. Match by References header
        if (!empty($msg['references_header'])) {
            preg_match_all('/<([^>]+)>/', $msg['references_header'], $m);
            foreach (array_reverse($m[1]) as $ref) {
                $parent = Database::fetchOne(
                    'SELECT thread_id FROM messages WHERE account_id = ? AND message_id = ?',
                    [$account['id'], $ref]
                );
                if ($parent && $parent['thread_id']) {
                    return $parent['thread_id'];
                }
            }
        }

        // 3. Match by normalized subject
        $normalized = $this->normalizeSubject($msg['subject'] ?? '');
        if ($normalized) {
            $thread = Database::fetchOne(
                'SELECT id FROM threads WHERE account_id = ? AND subject_normalized = ?
                 AND last_message_at > DATE_SUB(NOW(), INTERVAL 7 DAY)',
                [$account['id'], $normalized]
            );
            if ($thread) return $thread['id'];
        }

        // 4. Create new thread
        Database::query(
            'INSERT INTO threads (account_id, subject_normalized, last_message_at) VALUES (?, ?, ?)',
            [$account['id'], $normalized ?: null, $msg['date']]
        );
        return (int)Database::lastInsertId();
    }

    private function normalizeSubject(string $subject): string {
        // Remove Re:, Fwd:, Fw:, Aw:, etc. and normalize whitespace
        $s = preg_replace('/^(re|fwd?|aw|rv|sv):\s*/i', '', trim($subject));
        $s = preg_replace('/\s+/', ' ', $s);
        return strtolower(trim($s));
    }

    // ----------------------------------------------------------------
    // Attachment storage
    // ----------------------------------------------------------------

    private function storeAttachments(array $attachments, int $messageId, int $uid, IMAPClient $imap): void {
        $dir = rtrim($this->attachmentPath, '/') . '/' . floor($messageId / 1000);
        if (!is_dir($dir)) {
            mkdir($dir, 0750, true);
        }

        foreach ($attachments as $att) {
            try {
                $body = $imap->fetchAttachmentBody($uid, $att['section'], $att['encoding']);
                $safeName = preg_replace('/[^a-zA-Z0-9._\-]/', '_', $att['filename']);
                $filepath = "$dir/{$messageId}_{$safeName}";

                file_put_contents($filepath, $body);

                Database::query(
                    'INSERT INTO attachments (message_id, filename, mime_type, size, file_path, content_id, is_inline)
                     VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [
                        $messageId,
                        $att['filename'],
                        $att['mime_type'],
                        strlen($body),
                        $filepath,
                        $att['content_id'],
                        $att['is_inline'],
                    ]
                );
            } catch (Throwable $e) {
                error_log("Attachment store error msg=$messageId: " . $e->getMessage());
            }
        }
    }

    // ----------------------------------------------------------------
    // Autoreply processing
    // ----------------------------------------------------------------

    private function processAutoreplies(array $account): void {
        $ar = Database::fetchOne(
            'SELECT * FROM autoreplies WHERE account_id = ? AND is_enabled = 1',
            [$account['id']]
        );
        if (!$ar) return;

        $today = date('Y-m-d');
        if ($ar['start_date'] && $today < $ar['start_date']) return;
        if ($ar['end_date']   && $today > $ar['end_date'])   return;

        // Find unread, non-autoreply messages received since last sync that need autoreply
        $messages = Database::fetchAll(
            "SELECT m.* FROM messages m
             JOIN folders f ON m.folder_id = f.id
             WHERE m.account_id = ? AND f.special_use = 'inbox'
               AND m.is_read = 0 AND m.is_deleted = 0
               AND m.created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
               AND m.from_address != ?
               AND m.from_address NOT LIKE '%noreply%'
               AND m.from_address NOT LIKE '%no-reply%'",
            [$account['id'], $account['email_address']]
        );

        foreach ($messages as $msg) {
            $senderEmail = $msg['from_address'];
            if (!$senderEmail) continue;

            // One autoreply per sender
            $sent = Database::fetchOne(
                'SELECT id FROM autoreply_sent WHERE account_id = ? AND sender_email = ?',
                [$account['id'], $senderEmail]
            );
            if ($sent) continue;

            try {
                $smtp = new SMTPClient($account, $this->enc);
                $smtp->send([
                    'from'      => ['name' => $account['display_name'], 'email' => $account['email_address']],
                    'to'        => [['name' => $msg['from_name'] ?? '', 'email' => $senderEmail]],
                    'subject'   => $ar['subject'],
                    'body_text' => strip_tags($ar['html_body']),
                    'body_html' => $ar['html_body'],
                    'in_reply_to' => $msg['message_id'],
                ]);

                Database::query(
                    'INSERT INTO autoreply_sent (account_id, sender_email) VALUES (?, ?)
                     ON DUPLICATE KEY UPDATE sent_at = NOW()',
                    [$account['id'], $senderEmail]
                );
            } catch (Throwable $e) {
                error_log("Autoreply send failed: " . $e->getMessage());
            }
        }
    }

    // ----------------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------------

    private function folderBasename(string $path): string {
        $parts = explode('/', str_replace(['\\', '.'], '/', $path));
        return end($parts) ?: $path;
    }

    private function detectSpecialUse(string $path): string {
        $lower = strtolower($path);
        if (preg_match('/\b(inbox)\b/i', $lower))            return 'inbox';
        if (preg_match('/\b(sent|sent.mail|sent.items)\b/i', $lower)) return 'sent';
        if (preg_match('/\b(drafts?|draft)\b/i', $lower))   return 'drafts';
        if (preg_match('/\b(trash|deleted|bin)\b/i', $lower)) return 'trash';
        if (preg_match('/\b(spam|junk)\b/i', $lower))       return 'spam';
        if (preg_match('/\b(archive)\b/i', $lower))         return 'archive';
        return '';
    }
}
