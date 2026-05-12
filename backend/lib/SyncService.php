<?php

/**
 * Orchestrates incremental IMAP synchronisation for email accounts.
 *
 * For each active account, SyncService:
 * 1. Connects via IMAPClient and refreshes the folder list.
 * 2. For each subscribed, selectable folder, fetches UIDs newer than the last
 *    known `uidnext`, handling UIDVALIDITY resets by wiping and re-syncing.
 * 3. Persists new messages and their attachments to the database/disk.
 * 4. Resolves thread membership via In-Reply-To, References, and subject matching.
 * 5. Passes each stored message through RulesEngine.
 * 6. Sends account-level autoreplies for new inbox messages when enabled.
 *
 * @package CM-IMAP\Lib
 */
class SyncService {
    /** @var Encryption Encryption service used to decrypt IMAP/SMTP credentials */
    private Encryption  $enc;

    /** @var RulesEngine Rules engine instance applied to every newly stored message */
    private RulesEngine $rules;

    /** @var string Filesystem path where attachment files are stored */
    private string      $attachmentPath;

    /**
     * Initialise the service with its dependencies and load the attachment path from settings.
     */
    public function __construct() {
        $this->enc            = new Encryption();
        $this->rules          = new RulesEngine();
        $this->attachmentPath = Database::getSetting('attachment_path', '/var/www/cm-imap-attachments');
    }

    // ----------------------------------------------------------------
    // Public: sync a single account
    // ----------------------------------------------------------------

    /**
     * Perform a full incremental sync for one email account.
     *
     * Connects to the IMAP server, refreshes folders, syncs new messages in
     * every subscribed folder, updates the account's `last_sync` timestamp,
     * and triggers autoreply processing. On connection failure, the error is
     * persisted to `email_accounts.sync_error` before re-throwing.
     *
     * @param  array<string, mixed> $account email_accounts row.
     * @return array{folders: int, new_messages: int, errors: string[]} Sync statistics.
     * @throws RuntimeException If the initial IMAP connection fails.
     */
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

    /**
     * Refresh the local folder list from the IMAP server.
     *
     * New folders are inserted; existing folders have their `special_use`
     * updated only when the detected value is non-empty and the current
     * stored value is empty (to avoid overwriting user customisation).
     *
     * @param  IMAPClient           $imap    Connected IMAP client.
     * @param  array<string, mixed> $account email_accounts row.
     * @return void
     */
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

    /**
     * Sync new messages for a single folder.
     *
     * Checks UIDVALIDITY; if it has changed since the last sync, all locally
     * stored messages for the folder are deleted and a full re-sync is performed.
     * Otherwise only UIDs greater than the stored `uidnext` are fetched.
     *
     * @param  IMAPClient           $imap    Connected IMAP client.
     * @param  array<string, mixed> $account email_accounts row.
     * @param  array<string, mixed> $folder  folders row.
     * @return int Number of new messages stored.
     */
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

    /**
     * Persist a fetched message to the database and trigger post-storage processing.
     *
     * Resolves the thread, inserts the message row, stores attachment files,
     * updates thread counters, and runs the rules engine. Returns the new
     * message primary key, or null if the insert fails.
     *
     * @param  array<string, mixed> $msg     Parsed message data from {@see IMAPClient::fetchMessage()}.
     * @param  array<string, mixed> $account email_accounts row.
     * @param  array<string, mixed> $folder  folders row.
     * @param  IMAPClient           $imap    Connected client (used to fetch attachment bytes).
     * @return int|null New message ID, or null on failure.
     */
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

    /**
     * Find or create the thread that a message belongs to.
     *
     * Resolution order:
     * 1. In-Reply-To header → find the parent message's thread.
     * 2. References header → search each referenced message ID (most recent first).
     * 3. Normalised subject match within the last 7 days.
     * 4. Create a new thread.
     *
     * @param  array<string, mixed> $msg     Parsed message data.
     * @param  array<string, mixed> $account email_accounts row.
     * @return int|null Thread ID, or null if a new thread could not be created.
     */
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

    /**
     * Strip reply/forward prefixes and normalise whitespace for subject-based thread matching.
     *
     * Removes leading Re:, Fwd:, Fw:, Aw:, Rv:, Sv: (and variants), then lower-cases.
     *
     * @param  string $subject Raw message subject.
     * @return string Normalised subject string.
     */
    private function normalizeSubject(string $subject): string {
        // Remove Re:, Fwd:, Fw:, Aw:, etc. and normalize whitespace
        $s = preg_replace('/^(re|fwd?|aw|rv|sv):\s*/i', '', trim($subject));
        $s = preg_replace('/\s+/', ' ', $s);
        return strtolower(trim($s));
    }

    // ----------------------------------------------------------------
    // Attachment storage
    // ----------------------------------------------------------------

    /**
     * Fetch attachment bytes from IMAP and write them to the filesystem and database.
     *
     * Files are stored under `$attachmentPath/<bucket>/`, where the bucket is
     * `floor($messageId / 1000)` to avoid large directories. Filenames are
     * sanitised before writing. Each attachment is recorded in the `attachments` table.
     *
     * Individual attachment failures are logged but do not abort the loop.
     *
     * @param  array<int, array<string, mixed>> $attachments Attachment metadata from {@see IMAPClient::fetchMessage()}.
     * @param  int                              $messageId   Primary key of the parent message.
     * @param  int                              $uid         IMAP UID of the parent message.
     * @param  IMAPClient                       $imap        Connected client for fetching bytes.
     * @return void
     */
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

    /**
     * Send account-level autoreplies for recent unread inbox messages.
     *
     * Only runs when the account has an enabled autoreply within its active date
     * range. Queries for unread inbox messages created in the last 10 minutes,
     * skipping messages sent by the account itself or no-reply addresses. Deduplicates
     * using the `autoreply_sent` table (one reply per sender per account lifetime).
     *
     * @param  array<string, mixed> $account email_accounts row.
     * @return void
     */
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

    /**
     * Extract the leaf (final) segment of a folder path.
     *
     * Handles both `/` and `.` as separators, as well as backslashes.
     *
     * @param  string $path Full folder path.
     * @return string Folder display name.
     */
    private function folderBasename(string $path): string {
        $parts = explode('/', str_replace(['\\', '.'], '/', $path));
        return end($parts) ?: $path;
    }

    /**
     * Infer a folder's special use (inbox, sent, drafts, trash, spam, archive)
     * from its path using common naming patterns.
     *
     * @param  string $path Folder full path.
     * @return string Special use key, or empty string if unrecognised.
     */
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
