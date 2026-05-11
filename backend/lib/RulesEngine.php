<?php

class RulesEngine {
    /**
     * Apply all enabled rules for an account to a message.
     * Returns list of actions taken.
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
