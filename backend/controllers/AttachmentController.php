<?php

/**
 * Handles downloading existing attachments and uploading new ones for compose.
 *
 * @package CM-IMAP\Controllers
 */
class AttachmentController {
    /**
     * Stream an attachment file to the browser.
     *
     * Verifies that the attachment belongs to an account owned by the
     * authenticated user before sending. Supports both inline display
     * (`?inline=1`) and forced download.
     *
     * @param  int $id Attachment primary key.
     * @return void — exits after streaming the file.
     */
    public function show(int $id): void {
        $user = Middleware::requireAuth();

        $att = Database::fetchOne(
            'SELECT a.*, m.account_id FROM attachments a
             JOIN messages m ON a.message_id = m.id
             WHERE a.id = ?',
            [$id]
        );
        if (!$att) Response::notFound('Attachment not found');

        // Verify ownership
        $account = Database::fetchOne(
            'SELECT user_id FROM email_accounts WHERE id = ?',
            [$att['account_id']]
        );
        if (!$account || $account['user_id'] != $user['sub']) {
            Response::forbidden();
        }

        if (!$att['file_path'] || !file_exists($att['file_path'])) {
            Response::notFound('Attachment file not found on disk');
        }

        $inline   = !empty($_GET['inline']);
        $filename = $att['filename'];
        $mime     = $att['mime_type'] ?? 'application/octet-stream';

        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($att['file_path']));
        header('Cache-Control: private, max-age=3600');

        $disposition = $inline ? 'inline' : 'attachment';
        $safeFilename = rawurlencode($filename);
        header("Content-Disposition: $disposition; filename=\"$filename\"; filename*=UTF-8''$safeFilename");

        readfile($att['file_path']);
        exit;
    }

    /**
     * Accept a multipart file upload and store it as a pending attachment.
     *
     * The file is saved to `<attachment_path>/uploads/<user_id>/` with a
     * unique prefix and a sanitised filename. The attachment row is inserted
     * with `message_id = 0` (pending), ready to be linked when a message is
     * sent. Returns the new attachment ID and metadata.
     *
     * @return void
     */
    public function upload(): void {
        $user = Middleware::requireAuth();

        if (empty($_FILES['file'])) {
            Response::error('No file uploaded');
        }

        $file    = $_FILES['file'];
        $maxMb   = (int)Database::getSetting('max_attachment_size_mb', 25);
        $maxSize = $maxMb * 1024 * 1024;

        if ($file['size'] > $maxSize) {
            Response::error("File too large. Maximum: {$maxMb}MB");
        }
        if ($file['error'] !== UPLOAD_ERR_OK) {
            Response::error('Upload error: ' . $file['error']);
        }

        $attachPath = Database::getSetting('attachment_path', '/var/www/cm-imap-attachments');
        $uploadDir  = rtrim($attachPath, '/') . '/uploads/' . $user['sub'];
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0750, true);

        $ext       = pathinfo($file['name'], PATHINFO_EXTENSION);
        $safeName  = preg_replace('/[^a-zA-Z0-9._\-]/', '_', $file['name']);
        $destPath  = $uploadDir . '/' . uniqid() . '_' . $safeName;

        if (!move_uploaded_file($file['tmp_name'], $destPath)) {
            Response::serverError('Could not save uploaded file');
        }

        $mime = mime_content_type($destPath) ?: ($file['type'] ?? 'application/octet-stream');

        // Store as temporary attachment (message_id = 0 = pending)
        Database::query(
            'INSERT INTO attachments (message_id, filename, mime_type, size, file_path, is_inline)
             VALUES (0, ?, ?, ?, ?, 0)',
            [$file['name'], $mime, $file['size'], $destPath]
        );
        $attId = (int)Database::lastInsertId();

        Response::success([
            'id'        => $attId,
            'filename'  => $file['name'],
            'mime_type' => $mime,
            'size'      => $file['size'],
        ], 'Uploaded', 201);
    }
}
