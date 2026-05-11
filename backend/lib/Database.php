<?php

class Database {
    private static ?PDO $instance = null;

    public static function getInstance(): PDO {
        if (self::$instance === null) {
            $cfg = require __DIR__ . '/../config/database.php';
            $dsn = "mysql:host={$cfg['host']};port={$cfg['port']};dbname={$cfg['name']};charset={$cfg['charset']}";
            self::$instance = new PDO($dsn, $cfg['user'], $cfg['password'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        }
        return self::$instance;
    }

    /** Convenience: prepare + execute, return statement */
    public static function query(string $sql, array $params = []): PDOStatement {
        $stmt = self::getInstance()->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    /** Return all rows */
    public static function fetchAll(string $sql, array $params = []): array {
        return self::query($sql, $params)->fetchAll();
    }

    /** Return single row or null */
    public static function fetchOne(string $sql, array $params = []): ?array {
        $row = self::query($sql, $params)->fetch();
        return $row ?: null;
    }

    /** Return single column value or null */
    public static function fetchScalar(string $sql, array $params = []): mixed {
        $row = self::query($sql, $params)->fetch(PDO::FETCH_NUM);
        return $row ? $row[0] : null;
    }

    /** Return last insert ID */
    public static function lastInsertId(): string {
        return self::getInstance()->lastInsertId();
    }

    /** Begin transaction */
    public static function beginTransaction(): void {
        self::getInstance()->beginTransaction();
    }

    /** Commit transaction */
    public static function commit(): void {
        self::getInstance()->commit();
    }

    /** Rollback transaction */
    public static function rollback(): void {
        self::getInstance()->rollBack();
    }

    /** Fetch a system setting */
    public static function getSetting(string $key, mixed $default = null): mixed {
        $val = self::fetchScalar('SELECT `value` FROM settings WHERE `key` = ?', [$key]);
        return $val !== null ? $val : $default;
    }
}
