<?php

class RuleController {
    public function index(): void {
        $user      = Middleware::requireAuth();
        $accountId = (int)($_GET['account_id'] ?? 0);
        if (!$accountId) Response::error('account_id required');

        Middleware::requireAccountOwnership($accountId, $user['sub']);

        $rules = Database::fetchAll(
            'SELECT * FROM rules WHERE account_id = ? ORDER BY priority, id',
            [$accountId]
        );

        foreach ($rules as &$rule) {
            $rule['conditions'] = Database::fetchAll(
                'SELECT * FROM rule_conditions WHERE rule_id = ?', [$rule['id']]
            );
            $rule['actions'] = Database::fetchAll(
                'SELECT * FROM rule_actions WHERE rule_id = ?', [$rule['id']]
            );
        }
        unset($rule);

        Response::success($rules);
    }

    public function store(): void {
        $user = Middleware::requireAuth();
        $body = $this->body();

        $accountId = (int)($body['account_id'] ?? 0);
        if (!$accountId) Response::error('account_id required');

        Middleware::requireAccountOwnership($accountId, $user['sub']);

        $name      = trim($body['name'] ?? '');
        $logic     = in_array($body['condition_logic'] ?? 'AND', ['AND','OR']) ? $body['condition_logic'] : 'AND';
        $priority  = (int)($body['priority'] ?? 10);
        $stop      = !empty($body['stop_processing']) ? 1 : 0;
        $enabled   = isset($body['is_enabled']) ? (int)(bool)$body['is_enabled'] : 1;

        if (!$name) Response::error('Rule name required');
        if (empty($body['conditions'])) Response::error('At least one condition required');
        if (empty($body['actions']))    Response::error('At least one action required');

        Database::beginTransaction();
        try {
            Database::query(
                'INSERT INTO rules (account_id, name, is_enabled, condition_logic, stop_processing, priority)
                 VALUES (?,?,?,?,?,?)',
                [$accountId, $name, $enabled, $logic, $stop, $priority]
            );
            $ruleId = (int)Database::lastInsertId();

            $this->saveConditions($ruleId, $body['conditions']);
            $this->saveActions($ruleId, $body['actions']);

            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Could not save rule: ' . $e->getMessage());
        }

        $rule = $this->loadRule($ruleId);
        Response::success($rule, 'Rule created', 201);
    }

    public function update(int $id): void {
        $user = Middleware::requireAuth();
        $rule = $this->ownerRule($id, $user['sub']);
        $body = $this->body();

        $fields = [];
        $params = [];
        if (isset($body['name']))             { $fields[] = 'name = ?';             $params[] = $body['name']; }
        if (isset($body['condition_logic']))  { $fields[] = 'condition_logic = ?';  $params[] = in_array($body['condition_logic'],['AND','OR']) ? $body['condition_logic'] : 'AND'; }
        if (isset($body['is_enabled']))       { $fields[] = 'is_enabled = ?';       $params[] = $body['is_enabled'] ? 1 : 0; }
        if (isset($body['stop_processing'])) { $fields[] = 'stop_processing = ?';  $params[] = $body['stop_processing'] ? 1 : 0; }
        if (isset($body['priority']))        { $fields[] = 'priority = ?';          $params[] = (int)$body['priority']; }

        Database::beginTransaction();
        try {
            if ($fields) {
                $params[] = $id;
                Database::query('UPDATE rules SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
            }
            if (isset($body['conditions'])) {
                Database::query('DELETE FROM rule_conditions WHERE rule_id = ?', [$id]);
                $this->saveConditions($id, $body['conditions']);
            }
            if (isset($body['actions'])) {
                Database::query('DELETE FROM rule_actions WHERE rule_id = ?', [$id]);
                $this->saveActions($id, $body['actions']);
            }
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            Response::serverError('Could not update rule');
        }

        Response::success($this->loadRule($id), 'Rule updated');
    }

    public function destroy(int $id): void {
        $user = Middleware::requireAuth();
        $this->ownerRule($id, $user['sub']);
        Database::query('DELETE FROM rules WHERE id = ?', [$id]);
        Response::success(null, 'Rule deleted');
    }

    // ----------------------------------------------------------------

    private function saveConditions(int $ruleId, array $conditions): void {
        $validFields = ['from_address','from_name','to','cc','subject','body','has_attachment'];
        $validOps    = ['contains','not_contains','starts_with','ends_with','equals','not_equals'];
        foreach ($conditions as $cond) {
            $field = $cond['field'] ?? '';
            $op    = $cond['operator'] ?? '';
            $val   = $cond['value'] ?? '';
            if (!in_array($field, $validFields) || !in_array($op, $validOps)) continue;
            Database::query(
                'INSERT INTO rule_conditions (rule_id, field, operator, value) VALUES (?,?,?,?)',
                [$ruleId, $field, $op, $val]
            );
        }
    }

    private function saveActions(int $ruleId, array $actions): void {
        $validTypes = ['move_to_folder','add_label','mark_read','mark_starred','set_priority',
                       'delete','move_to_spam','autoreply'];
        foreach ($actions as $action) {
            $type = $action['action_type'] ?? '';
            $val  = $action['action_value'] ?? null;
            if (!in_array($type, $validTypes)) continue;
            Database::query(
                'INSERT INTO rule_actions (rule_id, action_type, action_value) VALUES (?,?,?)',
                [$ruleId, $type, $val]
            );
        }
    }

    private function loadRule(int $id): array {
        $rule = Database::fetchOne('SELECT * FROM rules WHERE id = ?', [$id]);
        $rule['conditions'] = Database::fetchAll('SELECT * FROM rule_conditions WHERE rule_id = ?', [$id]);
        $rule['actions']    = Database::fetchAll('SELECT * FROM rule_actions WHERE rule_id = ?', [$id]);
        return $rule;
    }

    private function ownerRule(int $id, int $userId): array {
        $rule = Database::fetchOne(
            'SELECT r.* FROM rules r JOIN email_accounts a ON r.account_id = a.id
             WHERE r.id = ? AND a.user_id = ?',
            [$id, $userId]
        );
        if (!$rule) Response::notFound('Rule not found');
        return $rule;
    }

    private function body(): array {
        return json_decode(file_get_contents('php://input'), true) ?? [];
    }
}
