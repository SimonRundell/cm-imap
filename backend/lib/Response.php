<?php

/**
 * Static helpers for sending JSON HTTP responses.
 *
 * Every method sets the appropriate HTTP status code, writes the
 * Content-Type header, encodes the payload as JSON, and exits.
 * Return type `never` reflects that all methods terminate execution.
 *
 * @package CM-IMAP\Lib
 */
class Response {
    /**
     * Send a raw JSON response with the given status code.
     *
     * @param  mixed $data   Value to JSON-encode as the response body.
     * @param  int   $status HTTP status code.
     * @return never
     */
    public static function json(mixed $data, int $status = 200): never {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * Send a successful JSON response envelope.
     *
     * Wraps `$data` in `{"success": true, "message": "...", "data": ...}`.
     *
     * @param  mixed  $data    Response payload.
     * @param  string $message Human-readable success message.
     * @param  int    $status  HTTP status code (default 200).
     * @return never
     */
    public static function success(mixed $data = null, string $message = 'OK', int $status = 200): never {
        self::json(['success' => true, 'message' => $message, 'data' => $data], $status);
    }

    /**
     * Send an error JSON response envelope.
     *
     * Wraps the message in `{"success": false, "message": "...", "details": ...}`.
     *
     * @param  string $message Human-readable error description.
     * @param  int    $status  HTTP status code (default 400).
     * @param  mixed  $details Optional extra detail (e.g. validation errors).
     * @return never
     */
    public static function error(string $message, int $status = 400, mixed $details = null): never {
        self::json(['success' => false, 'message' => $message, 'details' => $details], $status);
    }

    /**
     * Send a 404 Not Found error response.
     *
     * @param  string $message
     * @return never
     */
    public static function notFound(string $message = 'Not found'): never {
        self::error($message, 404);
    }

    /**
     * Send a 401 Unauthorized error response.
     *
     * @param  string $message
     * @return never
     */
    public static function unauthorized(string $message = 'Unauthorized'): never {
        self::error($message, 401);
    }

    /**
     * Send a 403 Forbidden error response.
     *
     * @param  string $message
     * @return never
     */
    public static function forbidden(string $message = 'Forbidden'): never {
        self::error($message, 403);
    }

    /**
     * Send a 500 Internal Server Error response.
     *
     * @param  string $message
     * @return never
     */
    public static function serverError(string $message = 'Internal server error'): never {
        self::error($message, 500);
    }
}
