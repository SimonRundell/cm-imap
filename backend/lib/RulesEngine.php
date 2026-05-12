<?php

/**
 * Evaluates per-account filtering rules against incoming messages and executes
 * the configured actions (move, label, flag, delete, autoreply, etc.).
 *
 * Rules are fetched from the `rules` table in priority order. Each rule has a
 * set of conditions joined by AND or OR logic, and one or more actions to run
 * when the conditions match. A rule with `stop_processing = 1` halts further
 * rule evaluation once it fires.
 *
 * @package CM-IMAP\Lib
 */
class RulesEngine {
    /**
     * Apply all enabled rules for an account to a single message.
     *
     * Fetches rules ordered by priority, evaluates each rule's conditions against
     * the message, and executes matching actions. Updates `messages.rules_applied`
     * if any action was taken.
     *
     * @param  array<string, mixed> $message Message row from the `messages` table.
     * @param  array<string, mixed> $account email_accounts row for the owning account.
     * @return string[] List of action descriptors taken (e.g. `"moved_to:INBOX.Archive"`, `"label:Work"`).
     */
    public function apply(array $message, array $account): array {
        $rules = Database::fetchAll(
            'SELECT * FROM rules WHERE account_id = ? AND is_enabled = 1 ORDER BY priority ASC',
            [$account['id']]
        );

        $actionsTaken = [];

        foreach ($rules as $rule) {
            $conditions = Database::fetchAll(
                'SELECT * FROM rule_conditions WHERE rule_id = ?',
                [$rule['id']]
            );
            $actions = Database::fetchAll(
                'SELECT * FROM rule_actions WHERE rule_id = ?',
                [$rule['id']]
            );

            if (empty($conditions)) continue;

            if ($this->evaluateConditions($conditions, $rule['condition_logic'], $message)) {
                $taken = $this->executeActions($actions, $message, $account);
                $actionsTaken = array_merge($actionsTaken, $taken);

                if ($rule['stop_processing']) {
                    break;
                }
            }
        }

        // Mark rules as applied
        if (!empty($actionsTaken)) {
            Database::query(
                'UPDATE messages SET rules_applied = 1 WHERE id = ?',
                [$message['id']]
            );
        }

        return $actionsTaken;
    }

    // ----------------------------------------------------------------
    // Condition evaluation
    // ----------------------------------------------------------------

    /**
     * Evaluate a set of conditions using AND or OR logic.
     *
     * @param  array<int, array<string, mixed>> $conditions Rows from `rule_conditions`.
     * @param  string                           $logic      'AND' or 'OR'.
     * @param  array<string, mixed>             $message    Message row.
     * @return bool
     */
    private function evaluateConditions(array $conditions, string $logic, array $message): bool {
        $results = [];
        foreach ($conditions as $cond) {
            $results[] = $this->evaluateCondition($cond, $message);
        }

        if ($logic === 'AND') {
            return !in_array(false, $results, true);
        } else { // OR
            return in_array(true, $results, true);
        }
    }

    /**
     * Evaluate a single condition against a message.
     *
     * Supported operators: contains, not_contains, starts_with, ends_with, equals, not_equals.
     * All comparisons are case-insensitive.
     *
     * @param  array<string, mixed> $cond    Row from `rule_conditions` (field, operator, value).
     * @param  array<string, mixed> $message Message row.
     * @return bool
     */
    private function evaluateCondition(array $cond, array $message): bool {
        $field    = $cond['field'];
        $operator = $cond['operator'];
        $value    = strtolower($cond['value']);

        $fieldValue = $this->getFieldValue($field, $message);

        return match($operator) {
            'contains'     =>  str_contains(strtolower($fieldValue), $value),
            'not_contains' => !str_contains(strtolower($fieldValue), $value),
            'starts_with'  =>  str_starts_with(strtolower($fieldValue), $value),
            'ends_with'    =>  str_ends_with(strtolower($fieldValue), $value),
            'equals'       =>  strtolower($fieldValue) === $value,
            'not_equals'   =>  strtolower($fieldValue) !== $value,
            default        =>  false,
        };
    }

    /**
     * Resolve a condition field name to a string value from the message row.
     *
     * Address fields (to, cc) are flattened to a space-separated string of
     * names and email addresses. Body is taken from the first 10 000 characters
     * of the stripped HTML, falling back to plain text.
     *
     * @param  string               $field   Condition field identifier.
     * @param  array<string, mixed> $message Message row.
     * @return string
     */
    private function getFieldValue(string $field, array $message): string {
        return match($field) {
            'from_address'   => $message['from_address'] ?? '',
            'from_name'      => $message['from_name'] ?? '',
            'to'             => $this->flattenAddresses($message['to_addresses'] ?? []),
            'cc'             => $this->flattenAddresses($message['cc_addresses'] ?? []),
            'subject'        => $message['subject'] ?? '',
            'body'           => substr(strip_tags($message['body_html'] ?? '') ?: ($message['body_text'] ?? ''), 0, 10000),
            'has_attachment' => $message['has_attachments'] ? 'true' : 'false',
            default          => '',
        };
    }

    /**
     * Flatten an address list (JSON string or decoded array) into a single
     * searchable string of "name email" pairs.
     *
     * @param  array<int, array<string, string>>|string $addrs JSON-encoded or decoded address array.
     * @return string
     */
    private function flattenAddresses(array|string $addrs): string {
        if (is_string($addrs)) {
            $addrs = json_decode($addrs, true) ?? [];
        }
        $parts = [];
        foreach ($addrs as $addr) {
            $parts[] = ($addr['name'] ?? '') . ' ' . ($addr['email'] ?? '');
        }
        return implode(' ', $parts);
    }

    // ----------------------------------------------------------------
    // Action execution
    // ----------------------------------------------------------------

    /**
     * Execute a list of rule actions against a message.
     *
     * Each action is attempted independently; errors are logged but do not
     * halt remaining actions.
     *
     * @param  array<int, array<string, mixed>> $actions  Rows from `rule_actions`.
     * @param  array<string, mixed>             $message  Message row.
     * @param  array<string, mixed>             $account  email_accounts row.
     * @return string[] Descriptors of actions successfully taken.
     */
    private function executeActions(array $actions, array $message, array $account): array {
        $taken = [];

        foreach ($actions as $action) {
            $type = $action['action_type'];
            $val  = $action['action_value'];

            try {
                switch ($type) {
                    case 'move_to_folder':
                        $folder = Database::fetchOne(
                            'SELECT * FROM folders WHERE account_id = ? AND (full_path = ? OR name = ?)',
                            [$account['id'], $val, $val]
                        );
                        if ($folder) {
                            Database::query(
                                'UPDATE messages SET folder_id = ? WHERE id = ?',
                                [$folder['id'], $message['id']]
                            );
                            $taken[] = "moved_to:{$folder['full_path']}";
                        }
                        break;

                    case 'add_label':
                        $label = Database::fetchOne(
                            'SELECT * FROM labels WHERE account_id = ? AND name = ?',
                            [$account['id'], $val]
                        );
                        if ($label) {
                            Database::query(
                                'INSERT IGNORE INTO message_labels (message_id, label_id) VALUES (?, ?)',
                                [$message['id'], $label['id']]
                            );
                            $taken[] = "label:{$label['name']}";
                        }
                        break;

                    case 'mark_read':
                        Database::query('UPDATE messages SET is_read = 1 WHERE id = ?', [$message['id']]);
                        $taken[] = 'mark_read';
                        break;

                    case 'mark_starred':
                        Database::query('UPDATE messages SET is_starred = 1 WHERE id = ?', [$message['id']]);
                        $taken[] = 'mark_starred';
                        break;

                    case 'set_priority':
                        $p = (int)$val;
                        if ($p >= 1 && $p <= 5) {
                            Database::query('UPDATE messages SET priority = ? WHERE id = ?', [$p, $message['id']]);
                            $taken[] = "priority:$p";
                        }
                        break;

                    case 'delete':
                        Database::query('UPDATE messages SET is_deleted = 1 WHERE id = ?', [$message['id']]);
                        $taken[] = 'deleted';
                        break;

                    case 'move_to_spam':
                        $spam = Database::fetchOne(
                            "SELECT * FROM folders WHERE account_id = ? AND special_use = 'spam'",
                            [$account['id']]
                        );
                        if ($spam) {
                            Database::query(
                                'UPDATE messages SET folder_id = ? WHERE id = ?',
                                [$spam['id'], $message['id']]
                            );
                            $taken[] = 'move_to_spam';
                        }
                        break;

                    case 'autoreply':
                        $this->sendAutoreply($message, $account, $val);
                        $taken[] = 'autoreply';
                        break;
                }
            } catch (Throwable $e) {
                error_log("RulesEngine action '$type' failed: " . $e->getMessage());
            }
        }

        return $taken;
    }

    /**
     * Send a rule-triggered autoreply to the original sender.
     *
     * Guards against replying to no-reply/mailer-daemon addresses and
     * enforces a one-reply-per-sender-per-account-per-day deduplication
     * using the `autoreply_sent` table.
     *
     * @param  array<string, mixed> $message    Message that triggered the rule.
     * @param  array<string, mixed> $account    email_accounts row.
     * @param  string|null          $customBody Optional HTML body override; falls back to a generic message.
     * @return void
     */
    private function sendAutoreply(array $message, array $account, ?string $customBody): void {
        $senderEmail = $message['from_address'] ?? '';
        if (!$senderEmail || $senderEmail === $account['email_address']) return;

        // Don't reply to no-reply addresses
        if (preg_match('/no.?reply|noreply|mailer-daemon/i', $senderEmail)) return;

        // Dedup — one rule autoreply per sender per account per day
        $existing = Database::fetchOne(
            'SELECT id FROM autoreply_sent WHERE account_id = ? AND sender_email = ? AND sent_at > DATE_SUB(NOW(), INTERVAL 1 DAY)',
            [$account['id'], $senderEmail]
        );
        if ($existing) return;

        $enc    = new Encryption();
        $smtp   = new SMTPClient($account, $enc);
        $subject = 'Re: ' . ($message['subject'] ?? '');
        $body    = $customBody ?: 'This is an automated response.';

        $smtp->send([
            'from'      => ['name' => $account['display_name'], 'email' => $account['email_address']],
            'to'        => [['name' => $message['from_name'] ?? '', 'email' => $senderEmail]],
            'subject'   => $subject,
            'body_text' => strip_tags($body),
            'body_html' => $body,
            'in_reply_to' => $message['message_id'] ?? null,
        ]);

        Database::query(
            'INSERT INTO autoreply_sent (account_id, sender_email) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE sent_at = NOW()',
            [$account['id'], $senderEmail]
        );
    }
}
