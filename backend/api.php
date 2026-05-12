<?php
/**
 * Single entry-point for the CM-IMAP REST API.
 *
 * Bootstraps the application (autoloader, CORS headers), then dispatches
 * incoming requests through a minimal pattern-matching router. All routes
 * are matched in declaration order; the first match wins and subsequent
 * calls to route() are no-ops. A 404 response is emitted if no route matches.
 *
 * Route patterns support named parameters via `:name` syntax (e.g. `/messages/:id`).
 * Numeric captures are automatically cast to int before being passed to the handler.
 *
 * @package CM-IMAP
 */
declare(strict_types=1);

// ── Bootstrap ───────────────────────────────────────────────────────────────
define('ROOT', __DIR__);
ini_set('display_errors', '0');
error_reporting(E_ALL);

/**
 * Auto-load library and controller classes from lib/ and controllers/.
 *
 * @param string $class Fully-qualified (but unnamespaced) class name.
 */
spl_autoload_register(function (string $class): void {
    $paths = [ROOT . '/lib/', ROOT . '/controllers/'];
    foreach ($paths as $path) {
        $file = $path . $class . '.php';
        if (file_exists($file)) { require_once $file; return; }
    }
});

// ── CORS ────────────────────────────────────────────────────────────────────
$cfg = require ROOT . '/config/app.php';
$origin = $cfg['cors_origin'] ?? '*';

header("Access-Control-Allow-Origin: $origin");
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Router ──────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$uri    = $_SERVER['REQUEST_URI'] ?? '/';

// Strip query string
if (false !== $pos = strpos($uri, '?')) {
    $uri = substr($uri, 0, $pos);
}

// Normalise: remove leading /api prefix if present
$uri = preg_replace('#^/api#', '', $uri);
$uri = '/' . ltrim($uri, '/');

// ── Route table ─────────────────────────────────────────────────────────────

/**
 * Register a route and dispatch to its handler if the method and URI match.
 *
 * Uses a static `$matched` flag so only the first matching route fires.
 * Named path parameters (`:name`) are converted to named regex captures and
 * passed as an array to the handler; numeric values are cast to int.
 *
 * @param  string   $routeMethod HTTP method (GET, POST, PUT, DELETE, …).
 * @param  string   $pattern     URI pattern with optional `:param` segments.
 * @param  callable $handler     Callback receiving `array $params` of named captures.
 * @return void
 */
function route(string $routeMethod, string $pattern, callable $handler): void {
    static $matched = false;
    if ($matched) return;

    // Build regex from pattern (named params :id)
    $regex = preg_replace('#:(\w+)#', '(?P<$1>[^/]+)', $pattern);
    $regex = '#^' . $regex . '$#';

    if ($GLOBALS['method'] === $routeMethod && preg_match($regex, $GLOBALS['uri'], $m)) {
        $matched = true;
        // Extract named captures (int-cast if numeric)
        $params = [];
        foreach ($m as $k => $v) {
            if (is_string($k)) {
                $params[$k] = is_numeric($v) ? (int)$v : $v;
            }
        }
        $handler($params);
    }
}

try {
    // Auth
    route('POST', '/auth/login',    fn() => (new AuthController)->login());
    route('POST', '/auth/register', fn() => (new AuthController)->register());
    route('POST', '/auth/refresh',  fn() => (new AuthController)->refresh());
    route('POST', '/auth/logout',   fn() => (new AuthController)->logout());
    route('GET',  '/auth/me',       fn() => (new AuthController)->me());

    // Accounts
    route('GET',    '/accounts',                fn()    => (new AccountController)->index());
    route('POST',   '/accounts',                fn()    => (new AccountController)->store());
    route('PUT',    '/accounts/:id',            fn($p)  => (new AccountController)->update($p['id']));
    route('DELETE', '/accounts/:id',            fn($p)  => (new AccountController)->destroy($p['id']));
    route('POST',   '/accounts/:id/sync',       fn($p)  => (new AccountController)->sync($p['id']));
    route('POST',   '/accounts/:id/test',       fn($p)  => (new AccountController)->testConnection($p['id']));

    // Folders
    route('GET',  '/folders',          fn()   => (new FolderController)->index());
    route('POST', '/folders/sync',     fn()   => (new FolderController)->sync());
    route('POST', '/folders',          fn()   => (new FolderController)->createFolder());
    route('PUT',  '/folders/:id',      fn($p) => (new FolderController)->update($p['id']));

    // Messages
    route('GET',    '/messages',              fn()   => (new MessageController)->index());
    route('GET',    '/messages/poll',         fn()   => (new MessageController)->pollNew());
    route('GET',    '/messages/:id',          fn($p) => (new MessageController)->show($p['id']));
    route('PUT',    '/messages/:id',          fn($p) => (new MessageController)->update($p['id']));
    route('DELETE', '/messages/:id',          fn($p) => (new MessageController)->destroy($p['id']));
    route('POST',   '/messages/:id/move',     fn($p) => (new MessageController)->move($p['id']));
    route('POST',   '/messages/:id/labels',   fn($p) => (new MessageController)->updateLabels($p['id']));
    route('POST',   '/messages/send',         fn()   => (new MessageController)->send());

    // Attachments
    route('GET',  '/attachments/:id', fn($p) => (new AttachmentController)->show($p['id']));
    route('POST', '/attachments',     fn()   => (new AttachmentController)->upload());

    // Signatures
    route('GET',    '/signatures',     fn()   => (new SignatureController)->index());
    route('POST',   '/signatures',     fn()   => (new SignatureController)->store());
    route('PUT',    '/signatures/:id', fn($p) => (new SignatureController)->update($p['id']));
    route('DELETE', '/signatures/:id', fn($p) => (new SignatureController)->destroy($p['id']));

    // Autoreplies
    route('GET',    '/autoreplies',             fn()   => (new AutoreplyController)->index());
    route('POST',   '/autoreplies',             fn()   => (new AutoreplyController)->upsert());
    route('DELETE', '/autoreplies/:accountId',  fn($p) => (new AutoreplyController)->destroy($p['accountId']));

    // Rules
    route('GET',    '/rules',     fn()   => (new RuleController)->index());
    route('POST',   '/rules',     fn()   => (new RuleController)->store());
    route('PUT',    '/rules/:id', fn($p) => (new RuleController)->update($p['id']));
    route('DELETE', '/rules/:id', fn($p) => (new RuleController)->destroy($p['id']));

    // Labels
    route('GET',    '/labels',     fn()   => (new LabelController)->index());
    route('POST',   '/labels',     fn()   => (new LabelController)->store());
    route('PUT',    '/labels/:id', fn($p) => (new LabelController)->update($p['id']));
    route('DELETE', '/labels/:id', fn($p) => (new LabelController)->destroy($p['id']));

    // Admin
    route('GET',    '/admin/users',          fn()   => (new AdminController)->listUsers());
    route('POST',   '/admin/users',          fn()   => (new AdminController)->createUser());
    route('PUT',    '/admin/users/:id',      fn($p) => (new AdminController)->updateUser($p['id']));
    route('DELETE', '/admin/users/:id',      fn($p) => (new AdminController)->deleteUser($p['id']));
    route('GET',    '/admin/settings',       fn()   => (new AdminController)->getSettings());
    route('PUT',    '/admin/settings',       fn()   => (new AdminController)->updateSettings());
    route('GET',    '/admin/sync-status',    fn()   => (new AdminController)->syncStatus());

    // 404 fallback
    Response::notFound("No route: $method $uri");

} catch (Throwable $e) {
    error_log('API error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    Response::serverError(
        defined('APP_DEBUG') && APP_DEBUG ? $e->getMessage() : 'Internal server error'
    );
}
