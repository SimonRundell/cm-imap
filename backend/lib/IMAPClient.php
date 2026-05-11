<?php

/**
 * IMAP client wrapper around PHP's imap_* extension.
 * Requires php-imap extension: sudo apt-get install php8.2-imap
 */
class IMAPClient {
    private mixed $conn = null;
    private string $host;
    private int    $port;
    private string $encryption;
    private string $username;
    private string $password;
    private string $currentMailbox = '';

    public function __construct(array $account, Encryption $enc) {
        $this->host       = $account['imap_host'];
        $this->port       = (int)$account['imap_port'];
        $this->encryption = $account['imap_encryption'];
        $this->username   = $account['imap_username'];
        $this->password   = $enc->decrypt($account['imap_password_enc'], $account['imap_password_iv']);
    }

    private function buildMailboxStr(string $folder = 'INBOX'): string {
        $flags = match($this->encryption) {
            'ssl'      => '/imap/ssl/novalidate-cert',
            'tls'      => '/imap/tls/novalidate-cert',
            'starttls' => '/imap/starttls/novalidate-cert',
            default    => '/imap/notls',
        };
        return "{{$this->host}:{$this->port}{$flags}}{$folder}";
    }

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

    public function selectFolder(string $folder): void {
        if ($this->currentMailbox === $folder) return;
        $mailbox = $this->buildMailboxStr($folder);
        if (!imap_reopen($this->conn, $mailbox)) {
            throw new RuntimeException("Cannot select folder: $folder — " . imap_last_error());
        }
        $this->currentMailbox = $folder;
    }

    public function disconnect(): void {
        if ($this->conn) {
            imap_close($this->conn, CL_EXPUNGE);
            $this->conn = null;
        }
    }

    /** List all folders */
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

    /** Get folder details (uidvalidity, uidnext, message count) */
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

    /** Get UIDs > $sinceUid from current folder */
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

    /** Fetch all UIDs (for full sync) */
    public function getAllUids(): array {
        $uids = imap_search($this->conn, 'ALL', SE_UID);
        return $uids ?: [];
    }

    /** Fetch full message by UID */
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

    /** Get UIDs that are flagged as deleted in IMAP */
    public function getDeletedUids(): array {
        $uids = imap_search($this->conn, 'DELETED', SE_UID);
        return $uids ?: [];
    }

    /** Set \Seen flag */
    public function markRead(int $uid): void {
        imap_setflag_full($this->conn, (string)$uid, '\\Seen', ST_UID);
    }

    /** Clear \Seen flag */
    public function markUnread(int $uid): void {
        imap_clearflag_full($this->conn, (string)$uid, '\\Seen', ST_UID);
    }

    /** Set \Flagged flag */
    public function markFlagged(int $uid): void {
        imap_setflag_full($this->conn, (string)$uid, '\\Flagged', ST_UID);
    }

    /** Clear \Flagged flag */
    public function markUnflagged(int $uid): void {
        imap_clearflag_full($this->conn, (string)$uid, '\\Flagged', ST_UID);
    }

    /** Move message to another IMAP folder */
    public function moveMessage(int $uid, string $destFolder): bool {
        return imap_mail_move($this->conn, (string)$uid, $destFolder, CP_UID) !== false;
    }

    /** Mark message for deletion and expunge */
    public function deleteMessage(int $uid): void {
        imap_delete($this->conn, (string)$uid, FT_UID);
        imap_expunge($this->conn);
    }

    /** Create a folder */
    public function createFolder(string $name): bool {
        return imap_createmailbox($this->conn, $this->buildMailboxStr($name));
    }

    // ----------------------------------------------------------------
    // Private helpers
    // ----------------------------------------------------------------

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

    /** Fetch attachment body by section number */
    public function fetchAttachmentBody(int $uid, string $section, int $encoding): string {
        $body = imap_fetchbody($this->conn, $uid, $section, FT_UID);
        return match($encoding) {
            ENCBASE64         => base64_decode($body),
            ENCQUOTEDPRINTABLE => quoted_printable_decode($body),
            default            => $body,
        };
    }

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

    private function extractHeader(string $rawHeader, string $name): ?string {
        if (preg_match('/^' . preg_quote($name, '/') . ':\s*(.+?)(?=\r?\n[^\s]|\r?\n\r?\n)/ims', $rawHeader, $m)) {
            return preg_replace('/\r?\n\s+/', ' ', trim($m[1]));
        }
        return null;
    }

    private function parsePriority(?string $val): int {
        if (!$val) return 3;
        $val = strtolower(trim($val));
        if (in_array($val, ['1', '2', 'high', 'urgent'])) return 1;
        if (in_array($val, ['4', '5', 'low'])) return 5;
        return 3;
    }

    private function mimeType(int $type, string $subtype): string {
        $types = [TYPETEXT=>'text', TYPEMULTIPART=>'multipart', TYPEMESSAGE=>'message',
                  TYPEAPPLICATION=>'application', TYPEAUDIO=>'audio', TYPEIMAGE=>'image',
                  TYPEVIDEO=>'video', TYPEOTHER=>'other'];
        return ($types[$type] ?? 'application') . '/' . $subtype;
    }
}
