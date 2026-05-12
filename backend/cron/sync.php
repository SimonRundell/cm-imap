<?php
/**
 * Cron job: sync all active email accounts.
 *
 * Iterates over every active email account and runs an incremental IMAP sync
 * via SyncService. Results are written to stdout so they can be captured in a
 * log file when run from crontab.
 *
 * A file-based mutex (`/tmp/cm-imap-sync.lock`) prevents overlapping runs;
 * if a sync is already in progress the script exits immediately with a warning.
 *
 * Run via crontab every 5 minutes, redirecting output to a log file.
 *
 * @package CM-IMAP\Cron
 */

define('ROOT', dirname(__DIR__));

/**
 * Auto-load library and controller classes from lib/ and controllers/.
 *
 * @param string $class Class name to resolve.
 */
spl_autoload_register(function (string $class): void {
    $paths = [ROOT . '/lib/', ROOT . '/controllers/'];
    foreach ($paths as $path) {
        $file = $path . $class . '.php';
        if (file_exists($file)) { require_once $file; return; }
    }
});

/** @var string $lock Path to the process lock file */
$lock = sys_get_temp_dir() . '/cm-imap-sync.lock';

/** @var resource $fp Lock file handle */
$fp   = fopen($lock, 'c');
if (!flock($fp, LOCK_EX | LOCK_NB)) {
    echo date('[Y-m-d H:i:s]') . " Sync already running, skipping.\n";
    exit(0);
}

echo date('[Y-m-d H:i:s]') . " Starting sync...\n";

try {
    $accounts = Database::fetchAll(
        'SELECT * FROM email_accounts WHERE is_active = 1'
    );

    $svc   = new SyncService();

    /** @var array{accounts: int, new_messages: int, errors: int} $total Aggregate stats across all accounts */
    $total = ['accounts' => 0, 'new_messages' => 0, 'errors' => 0];

    foreach ($accounts as $account) {
        echo date('[Y-m-d H:i:s]') . " Syncing: {$account['email_address']}\n";
        try {
            $stats = $svc->syncAccount($account);
            $total['accounts']++;
            $total['new_messages'] += $stats['new_messages'];
            if (!empty($stats['errors'])) {
                foreach ($stats['errors'] as $err) {
                    echo date('[Y-m-d H:i:s]') . "   WARNING: $err\n";
                }
                $total['errors'] += count($stats['errors']);
            }
            echo date('[Y-m-d H:i:s]') . "   Done. New messages: {$stats['new_messages']}\n";
        } catch (RuntimeException $e) {
            $total['errors']++;
            echo date('[Y-m-d H:i:s]') . "   ERROR: " . $e->getMessage() . "\n";
        }
    }

    echo date('[Y-m-d H:i:s]') . " Sync complete. Accounts: {$total['accounts']}, New: {$total['new_messages']}, Errors: {$total['errors']}\n";

} catch (Throwable $e) {
    echo date('[Y-m-d H:i:s]') . " FATAL: " . $e->getMessage() . "\n";
} finally {
    flock($fp, LOCK_UN);
    fclose($fp);
}
