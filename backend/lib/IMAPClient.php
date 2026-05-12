<?php

/**
 * IMAP client wrapper around PHP's imap_* extension.
 * Requires php-imap extension: sudo apt-get install php8.2-imap
 *
 * Handles connection, folder listing, full MIME message parsing
 * (body parts + attachments), flag operations, and message moves/deletes.
 *
 * @package CM-IMAP\Lib
 */
class IMAPClient {
    /** @var mixed IMAP stream resource, or null when disconnected */
    private mixed $conn = null;

    /** @var string IMAP server hostname */
    private string $host;

    /** @var int IMAP server port */
    private int    $port;

    /** @var string Encryption type: 'ssl', 'tls', 'starttls', or 'none' */
    private string $encryption;

    /** @var string IMAP login username */
    private string $username;

    /** @var string Decrypted IMAP password */
    private string $password;

    /** @var string Full path of the currently selected mailbox folder */
    private string $currentMailbox = '';

    /**
     * Decrypt and store IMAP credentials from an email_accounts row.
     *
     * @param array<string, mixed> $account email_accounts row.
     * @param Encryption           $enc     Encryption service for decrypting the stored password.
     */
    public function __construct(array $account, Encryption $enc) {
        $this->host       = $account['imap_host'];
        $this->port       = (int)$account['imap_port'];
        $this->encryption = $account['imap_encryption'];
        $this->username   = $account['imap_username'];
        $this->password   = $enc->decrypt($account['imap_password_enc'], $account['imap_password_iv']);
    }

    /**
     * Build the imap_open mailbox string for a given folder.
     *
     * @param  string $folder Folder name/path (default 'INBOX').
     * @return string e.g. `{mail.example.com:993/imap/ssl/novalidate-cert}INBOX`
     */
    private function buildMailboxStr(string $folder = 'INBOX'): string {
        $flags = match($this->encryption) {
            'ssl'      => '/imap/ssl/novalidate-cert',
            'tls'      => '/imap/tls/novalidate-cert',
            'starttls' => '/imap/starttls/novalidate-cert',
            default    => '/imap/notls',
        };
        return "{{$this->host}:{$this->port}{$flags}}{$folder}";
    }

    /**
     * Open the IMAP connection to the given folder.
     *
     * If already connected, reopens the stream on the requested folder instead
     * of opening a new connection.
     *
     * @param  string $folder Initial folder to select (default 'INBOX').
     * @return void
     * @throws RuntimeException If imap_open fails.
     */
    public function connect(string $folder = 'INBOX'): void {
        if ($this->conn) {
            $this->selectFolder($folder);
            return;
        }
        $mailbox = $this->buildMailboxStr($folder);
        $this->conn = @imap_open($mailbox, $this->username, $this->password, 0, 1);
        if (!$this->conn) {
            $err = imap_last_error();
            throw new RuntimeException("IMAP connect failed: $err");
        }
        $this->currentMailbox = $folder;
    }

    /**
     * Select (reopen) a different folder on the existing connection.
     *
     * A no-op if the requested folder is already selected.
     *
     * @param  string $folder Folder full path to select.
     * @return void
     * @throws RuntimeException If imap_reopen fails.
     */
    public function selectFolder(string $folder): void {
        if ($this->currentMailbox === $folder) return;
        $mailbox = $this->buildMailboxStr($folder);
        if (!imap_reopen($this->conn, $mailbox)) {
            throw new RuntimeException("Cannot select folder: $folder — " . imap_last_error());
        }
        $this->currentMailbox = $folder;
    }

    /**
     * Close the IMAP connection and expunge any pending deletions.
     *
     * @return void
     */
    public function disconnect(): void {
        if ($this->conn) {
            imap_close($this->conn, CL_EXPUNGE);
            $this->conn = null;
        }
    }

    /**
     * List all folder paths on the server.
     *
     * @return string[] Folder paths with the server prefix stripped.
     */
    public function listFolders(): array {
        $serverStr = $this->buildMailboxStr('');
        $list = imap_list($this->conn, $serverStr, '*');
        if ($list === false) return [];

        $folders = [];
        foreach ($list as $mbox) {
            // Strip server prefix
            $name = str_replace($serverStr, '', $mbox);
            $folders[] = $name;
        }
        return $folders;
    }

    /**
     * Get status counters and UIDVALIDITY for a folder without selecting it.
     *
     * @param  string $folder Folder full path.
     * @return array{messages: int, recent: int, unseen: int, uidvalidity: int, uidnext: int}|array{}
     *         Empty array if the status call fails.
     */
    public function getFolderStatus(string $folder): array {
        $serverStr = $this->buildMailboxStr('');
        $status = imap_status($this->conn, $serverStr . $folder, SA_ALL);
        if (!$status) return [];
        return [
            'messages'    => $status->messages ?? 0,
            'recent'      => $status->recent ?? 0,
            'unseen'      => $status->unseen ?? 0,
            'uidvalidity' => $status->uidvalidity ?? 0,
            'uidnext'     => $status->uidnext ?? 1,
        ];
    }

    /**
     * Return UIDs in the current folder that are greater than `$sinceUid`.
     *
     * When `$sinceUid` is less than 1, all UIDs are returned (initial sync).
     * The IMAP UID range search may return `$sinceUid` itself, which is filtered out.
     *
     * @param  int   $sinceUid Fetch only UIDs strictly greater than this value.
     * @return int[]
     */
    public function getNewUids(int $sinceUid): array {
        if ($sinceUid < 1) {
            // Fetch all
            $uids = imap_search($this->conn, 'ALL', SE_UID);
        } else {
            $uids = imap_search($this->conn, "UID {$sinceUid}:*", SE_UID);
        }
        if (!$uids) return [];
        // Filter — imap search with UID range sometimes returns sinceUid itself
        return array_values(array_filter($uids, fn($uid) => $uid > $sinceUid));
    }

    /**
     * Return all UIDs in the current folder (for full sync or validation).
     *
     * @return int[]
     */
    public function getAllUids(): array {
        $uids = imap_search($this->conn, 'ALL', SE_UID);
        return $uids ?: [];
    }

    /**
     * Fetch and parse a complete message by UID.
     *
     * Parses the full MIME structure, extracting text/HTML body parts,
     * attachment metadata, and all address headers. Returns an empty array
     * if the UID cannot be resolved to a message number.
     *
     * @param  int $uid IMAP UID of the message.
     * @return array<string, mixed> Parsed message data, or empty array on failure.
     */
    public function fetchMessage(int $uid): array {
        $msgno = imap_msgno($this->conn, $uid);
        if (!$msgno) return [];

        $header   = imap_headerinfo($this->conn, $msgno);
        $overview = imap_fetch_overview($this->conn, (string)$uid, FT_UID);
        $ov       = $overview[0] ?? null;

        $rawHeader = imap_fetchheader($this->conn, $uid, FT_UID);
        $structure = imap_fetchstructure($this->conn, $uid, FT_UID);

        $bodyText = '';
        $bodyHtml = '';
        $attachments = [];

        $this->parseStructure($structure, $uid, '', $bodyText, $bodyHtml, $attachments);

        // Parse recipients
        $toAddrs  = $this->parseAddresses($header->to ?? []);
        $ccAddrs  = $this->parseAddresses($header->cc ?? []);
        $bccAddrs = $this->parseAddresses($header->bcc ?? []);
        $from     = $this->parseAddresses($header->from ?? []);
        $replyTo  = $this->parseAddresses($header->reply_to ?? []);

        // Extract headers
        $msgId    = $this->extractHeader($rawHeader, 'Message-ID');
        $inReply  = $this->extractHeader($rawHeader, 'In-Reply-To');
        $refs     = $this->extractHeader($rawHeader, 'References');
        $priority = $this->parsePriority($this->extractHeader($rawHeader, 'X-Priority') ?: $this->extractHeader($rawHeader, 'Importance'));

        $date = null;
        if (!empty($ov->date)) {
            $ts = strtotime($ov->date);
            if ($ts) $date = date('Y-m-d H:i:s', $ts);
        }

        return [
            'uid'               => $uid,
            'message_id'        => $msgId ? trim($msgId, '<> ') : null,
            'in_reply_to'       => $inReply ? trim($inReply, '<> ') : null,
            'references_header' => $refs,
            'subject'           => $ov->subject ?? null,
            'from_address'      => $from[0]['email'] ?? null,
            'from_name'         => $from[0]['name'] ?? null,
            'to_addresses'      => $toAddrs,
            'cc_addresses'      => $ccAddrs,
            'bcc_addresses'     => $bccAddrs,
            'reply_to'          => $replyTo[0]['email'] ?? null,
            'date'              => $date,
            'body_text'         => $bodyText,
            'body_html'         => $bodyHtml,
            'is_read'           => (int)($ov->seen ?? 0),
            'is_starred'        => 0,
            'is_flagged'        => (int)($ov->flagged ?? 0),
            'has_attachments'   => !empty($attachments) ? 1 : 0,
            'size'              => (int)($ov->size ?? 0),
            'priority'          => $priority,
            'attachments'       => $attachments,
        ];
    }

    /**
     * Return UIDs of messages flagged as deleted in the current folder.
     *
     * @return int[]
     */
    public function getDeletedUids(): array {
        $uids = imap_search($this->conn, 'DELETED', SE_UID);
        return $uids ?: [];
    }

    /**
     * Set the \Seen flag on a message.
     *
     * @param  int $uid IMAP UID.
     * @return void
     */
    public function markRead(int $uid): void {
        imap_setflag_full($this->conn, (string)$uid, '\\Seen', ST_UID);
    }

    /**
     * Clear the \Seen flag on a message.
     *
     * @param  int $uid IMAP UID.
     * @return void
     */
    public function markUnread(int $uid): void {
        imap_clearflag_full($this->conn, (string)$uid, '\\Seen', ST_UID);
    }

    /**
     * Set the \Flagged flag on a message.
     *
     * @param  int $uid IMAP UID.
     * @return void
     */
    public function markFlagged(int $uid): void {
        imap_setflag_full($this->conn, (string)$uid, '\\Flagged', ST_UID);
    }

    /**
     * Clear the \Flagged flag on a message.
     *
     * @param  int $uid IMAP UID.
     * @return void
     */
    public function markUnflagged(int $uid): void {
        imap_clearflag_full($this->conn, (string)$uid, '\\Flagged', ST_UID);
    }

    /**
     * Move a message to another IMAP folder.
     *
     * @param  int    $uid        IMAP UID of the message to move.
     * @param  string $destFolder Destination folder full path.
     * @return bool True on success.
     */
    public function moveMessage(int $uid, string $destFolder): bool {
        return imap_mail_move($this->conn, (string)$uid, $destFolder, CP_UID) !== false;
    }

    /**
     * Mark a message for deletion and immediately expunge it.
     *
     * @param  int $uid IMAP UID.
     * @return void
     */
    public function deleteMessage(int $uid): void {
        imap_delete($this->conn, (string)$uid, FT_UID);
        imap_expunge($this->conn);
    }

    /**
     * Create a new IMAP folder (mailbox) on the server.
     *
     * @param  string $name New folder name/path.
     * @return bool True on success.
     */
    public function createFolder(string $name): bool {
        return imap_createmailbox($this->conn, $this->buildMailboxStr($name));
    }

    // ----------------------------------------------------------------
    // Private helpers
    // ----------------------------------------------------------------

    /**
     * Recursively walk an IMAP body structure, extracting body text, HTML, and attachment metadata.
     *
     * For multipart structures the method descends into each part. For text parts it
     * decodes the body and populates `$bodyText` or `$bodyHtml` (first occurrence wins).
     * For attachment/inline parts it appends metadata to `$attachments` without fetching
     * the raw bytes — those are fetched on demand via {@see fetchAttachmentBody()}.
     *
     * @param  object   $structure    IMAP structure object from imap_fetchstructure.
     * @param  int      $uid          IMAP UID of the parent message.
     * @param  string   $partNum      Dot-notation part number (empty string for top-level).
     * @param  string   &$bodyText    Accumulator for plain-text body.
     * @param  string   &$bodyHtml    Accumulator for HTML body.
     * @param  array    &$attachments Accumulator for attachment metadata arrays.
     * @param  bool     $isAlternative Whether the current parent is multipart/alternative.
     * @return void
     */
    private function parseStructure(
        object $structure,
        int $uid,
        string $partNum,
        string &$bodyText,
        string &$bodyHtml,
        array &$attachments,
        bool $isAlternative = false
    ): void {
        $type = $structure->type ?? 0;

        if ($type === TYPEMULTIPART) {
            $subtype = strtolower($structure->subtype ?? '');
            $isAlt = ($subtype === 'alternative');
            foreach ($structure->parts as $i => $part) {
                $num = $partNum ? "$partNum." . ($i + 1) : (string)($i + 1);
                $this->parseStructure($part, $uid, $num, $bodyText, $bodyHtml, $attachments, $isAlt);
            }
            return;
        }

        $section  = $partNum ?: '1';
        $subtype  = strtolower($structure->subtype ?? '');
        $encoding = $structure->encoding ?? ENC7BIT;

        $disposition = '';
        $filename    = null;
        $contentId   = null;

        if (!empty($structure->disposition)) {
            $disposition = strtolower($structure->disposition);
        }
        if (!empty($structure->id)) {
            $contentId = trim($structure->id, '<>');
        }
        $filename = $this->extractFilename($structure);

        // Determine if this is an attachment
        $isAttachment = ($disposition === 'attachment') || ($filename && $type !== TYPETEXT);
        $isInline     = ($disposition === 'inline') && $filename;

        if ($isAttachment || $isInline) {
            $attachments[] = [
                'section'    => $section,
                'filename'   => $filename ?? 'attachment',
                'mime_type'  => $this->mimeType($type, $subtype),
                'content_id' => $contentId,
                'is_inline'  => $isInline ? 1 : 0,
                'encoding'   => $encoding,
                'size'       => $structure->bytes ?? 0,
            ];
            return;
        }

        if ($type === TYPETEXT) {
            $body = imap_fetchbody($this->conn, $uid, $section, FT_UID | FT_PEEK);
            $body = $this->decodeBody($body, $encoding, $structure->parameters ?? []);

            if ($subtype === 'html') {
                if (empty($bodyHtml)) $bodyHtml = $body;
            } else {
                if (empty($bodyText)) $bodyText = $body;
            }
        }
    }

    /**
     * Decode an encoded body part and convert it to UTF-8.
     *
     * Handles base64, quoted-printable, and unencoded (7bit/8bit) content.
     * Falls back to the original bytes if iconv conversion fails.
     *
     * @param  string   $body     Raw body bytes as returned by imap_fetchbody.
     * @param  int      $encoding IMAP encoding constant (ENCBASE64, ENCQUOTEDPRINTABLE, etc.).
     * @param  object[] $params   Content-Type parameter objects with `attribute` and `value` properties.
     * @return string UTF-8 decoded body.
     */
    private function decodeBody(string $body, int $encoding, array $params): string {
        $body = match($encoding) {
            ENCBASE64        => base64_decode($body),
            ENCQUOTEDPRINTABLE => quoted_printable_decode($body),
            default          => $body,
        };

        // Convert charset
        $charset = 'UTF-8';
        foreach ($params as $p) {
            if (strtolower($p->attribute ?? '') === 'charset') {
                $charset = strtoupper($p->value);
                break;
            }
        }
        if ($charset !== 'UTF-8') {
            $converted = @iconv($charset, 'UTF-8//TRANSLIT//IGNORE', $body);
            if ($converted !== false) $body = $converted;
        }

        return $body;
    }

    /**
     * Fetch and decode the raw bytes of an attachment part.
     *
     * Used by {@see SyncService} to write attachment files to disk.
     *
     * @param  int    $uid      IMAP UID of the parent message.
     * @param  string $section  Dot-notation body section number.
     * @param  int    $encoding IMAP encoding constant.
     * @return string Decoded binary content.
     */
    public function fetchAttachmentBody(int $uid, string $section, int $encoding): string {
        $body = imap_fetchbody($this->conn, $uid, $section, FT_UID);
        return match($encoding) {
            ENCBASE64         => base64_decode($body),
            ENCQUOTEDPRINTABLE => quoted_printable_decode($body),
            default            => $body,
        };
    }

    /**
     * Extract the filename from a MIME part's Content-Disposition or Content-Type parameters.
     *
     * Checks `dparameters` (Content-Disposition) before `parameters` (Content-Type),
     * and handles both `filename` and `filename*` / `name` and `name*` variants.
     *
     * @param  object $structure IMAP structure object.
     * @return string|null Decoded filename, or null if not present.
     */
    private function extractFilename(object $structure): ?string {
        // Check dparameters (Content-Disposition params)
        foreach ($structure->dparameters ?? [] as $p) {
            if (in_array(strtolower($p->attribute ?? ''), ['filename', 'filename*'])) {
                return $this->decodeHeaderValue($p->value);
            }
        }
        // Check parameters (Content-Type params)
        foreach ($structure->parameters ?? [] as $p) {
            if (in_array(strtolower($p->attribute ?? ''), ['name', 'name*'])) {
                return $this->decodeHeaderValue($p->value);
            }
        }
        return null;
    }

    /**
     * Decode an encoded MIME header word (RFC 2047) to a UTF-8 string.
     *
     * @param  string $value Possibly encoded header value (e.g. `=?UTF-8?B?...?=`).
     * @return string Decoded UTF-8 string.
     */
    private function decodeHeaderValue(string $value): string {
        $decoded = imap_mime_header_decode($value);
        $result  = '';
        foreach ($decoded as $part) {
            $charset = $part->charset ?? 'UTF-8';
            $text    = $part->text ?? '';
            if ($charset !== 'UTF-8' && $charset !== 'default') {
                $text = @iconv($charset, 'UTF-8//TRANSLIT//IGNORE', $text) ?: $text;
            }
            $result .= $text;
        }
        return $result;
    }

    /**
     * Convert an array of IMAP address objects to a normalised array of name/email pairs.
     *
     * @param  object[] $addrs Address objects from imap_headerinfo (e.g. `$header->from`).
     * @return array<int, array{name: string, email: string}>
     */
    private function parseAddresses(array $addrs): array {
        $result = [];
        foreach ($addrs as $addr) {
            $email = isset($addr->mailbox, $addr->host) ? "{$addr->mailbox}@{$addr->host}" : '';
            $name  = isset($addr->personal) ? $this->decodeHeaderValue($addr->personal) : '';
            if ($email) {
                $result[] = ['name' => $name, 'email' => $email];
            }
        }
        return $result;
    }

    /**
     * Extract a named header value from a raw RFC 2822 header block.
     *
     * Handles folded (multi-line) header values by collapsing continuation lines.
     *
     * @param  string $rawHeader Full raw header string.
     * @param  string $name      Header field name (case-insensitive).
     * @return string|null The unfolded header value, or null if not present.
     */
    private function extractHeader(string $rawHeader, string $name): ?string {
        if (preg_match('/^' . preg_quote($name, '/') . ':\s*(.+?)(?=\r?\n[^\s]|\r?\n\r?\n)/ims', $rawHeader, $m)) {
            return preg_replace('/\r?\n\s+/', ' ', trim($m[1]));
        }
        return null;
    }

    /**
     * Map an X-Priority or Importance header value to a 1–5 priority integer.
     *
     * High priority maps to 1, low priority maps to 5, and anything unrecognised
     * defaults to 3 (normal).
     *
     * @param  string|null $val Raw header value.
     * @return int 1 (high) – 5 (low).
     */
    private function parsePriority(?string $val): int {
        if (!$val) return 3;
        $val = strtolower(trim($val));
        if (in_array($val, ['1', '2', 'high', 'urgent'])) return 1;
        if (in_array($val, ['4', '5', 'low'])) return 5;
        return 3;
    }

    /**
     * Build a MIME type string from an IMAP type constant and subtype string.
     *
     * @param  int    $type    IMAP TYPETEXT, TYPEIMAGE, etc.
     * @param  string $subtype Lower-case subtype (e.g. 'plain', 'html', 'jpeg').
     * @return string e.g. 'text/plain', 'image/jpeg'.
     */
    private function mimeType(int $type, string $subtype): string {
        $types = [TYPETEXT=>'text', TYPEMULTIPART=>'multipart', TYPEMESSAGE=>'message',
                  TYPEAPPLICATION=>'application', TYPEAUDIO=>'audio', TYPEIMAGE=>'image',
                  TYPEVIDEO=>'video', TYPEOTHER=>'other'];
        return ($types[$type] ?? 'application') . '/' . $subtype;
    }
}
