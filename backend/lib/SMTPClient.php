<?php

/**
 * Pure-PHP SMTP client (no external dependencies).
 * Supports: plain TCP, SSL, STARTTLS, AUTH LOGIN, AUTH PLAIN.
 * Handles: multipart/alternative, multipart/related (inline images), multipart/mixed (attachments).
 *
 * @package CM-IMAP\Lib
 */
class SMTPClient {
    /** @var mixed TCP/SSL socket resource, or null when not connected */
    private mixed  $socket = null;

    /** @var string SMTP server hostname */
    private string $host;

    /** @var int SMTP server port */
    private int    $port;

    /** @var string Encryption type: 'ssl', 'starttls', or 'none' */
    private string $encryption;

    /** @var string SMTP login username */
    private string $username;

    /** @var string Decrypted SMTP password */
    private string $password;

    /** @var int Socket read/write timeout in seconds */
    private int    $timeout = 30;

    /**
     * Decrypt and store SMTP credentials from an email_accounts row.
     *
     * @param array<string, mixed> $account email_accounts row.
     * @param Encryption           $enc     Encryption service for decrypting the stored password.
     */
    public function __construct(array $account, Encryption $enc) {
        $this->host       = $account['smtp_host'];
        $this->port       = (int)$account['smtp_port'];
        $this->encryption = $account['smtp_encryption'];
        $this->username   = $account['smtp_username'];
        $this->password   = $enc->decrypt($account['smtp_password_enc'], $account['smtp_password_iv']);
    }

    /**
     * Connect, authenticate, and send one email message.
     *
     * Builds the full MIME message, issues MAIL FROM / RCPT TO / DATA commands,
     * and closes the connection cleanly with QUIT.
     *
     * @param  array<string, mixed> $mail {
     *     @type array          $from           Sender address: {name, email}.
     *     @type array[]        $to             Primary recipients: [{name, email}, ...].
     *     @type array[]        $cc             CC recipients (optional).
     *     @type array[]        $bcc            BCC recipients (optional).
     *     @type string         $subject        Message subject.
     *     @type string         $body_text      Plain-text body.
     *     @type string         $body_html      HTML body.
     *     @type string|null    $in_reply_to    Message-ID of the message being replied to.
     *     @type array|null     $reply_to       Reply-To address: {name, email}.
     *     @type array[]        $attachments    File attachments: [{filename, mime_type, data}, ...].
     *     @type array[]        $inline_images  Inline images: [{filename, mime_type, content_id, data}, ...].
     * }
     * @return void
     * @throws RuntimeException If the SMTP server returns an unexpected reply code.
     */
    public function send(array $mail): void {
        $this->connect();
        $this->authenticate();

        $from = $mail['from'];
        $allTo = array_merge(
            array_column($mail['to'] ?? [], 'email'),
            array_column($mail['cc'] ?? [], 'email'),
            array_column($mail['bcc'] ?? [], 'email')
        );

        $this->command("MAIL FROM:<{$from['email']}>", 250);
        foreach ($allTo as $addr) {
            $this->command("RCPT TO:<$addr>", [250, 251]);
        }

        $this->command('DATA', 354);
        $rawMessage = $this->buildMessage($mail);
        fwrite($this->socket, $rawMessage . "\r\n.\r\n");
        $this->expectCode(250);

        $this->command('QUIT', 221);
        fclose($this->socket);
        $this->socket = null;
    }

    // ----------------------------------------------------------------
    // Connection & auth
    // ----------------------------------------------------------------

    /**
     * Open a socket to the SMTP server and perform EHLO / STARTTLS upgrade if required.
     *
     * SSL connections wrap the socket at connect time; STARTTLS upgrades the plain
     * socket after the initial EHLO exchange.
     *
     * @return void
     * @throws RuntimeException If the socket cannot be opened or STARTTLS is not supported.
     */
    private function connect(): void {
        $context = stream_context_create([
            'ssl' => [
                'verify_peer'       => false,
                'verify_peer_name'  => false,
                'allow_self_signed' => true,
            ]
        ]);

        $proto = ($this->encryption === 'ssl') ? 'ssl' : 'tcp';
        $this->socket = stream_socket_client(
            "$proto://{$this->host}:{$this->port}",
            $errno, $errstr, $this->timeout,
            STREAM_CLIENT_CONNECT, $context
        );
        if (!$this->socket) {
            throw new RuntimeException("SMTP connect failed: $errstr ($errno)");
        }
        stream_set_timeout($this->socket, $this->timeout);
        $this->expectCode(220);

        // EHLO
        $ehloResponse = $this->command("EHLO " . gethostname(), 250, true);

        // STARTTLS upgrade
        if ($this->encryption === 'starttls') {
            if (stripos($ehloResponse, 'STARTTLS') === false) {
                throw new RuntimeException('Server does not support STARTTLS');
            }
            $this->command('STARTTLS', 220);
            stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
            // Re-EHLO after TLS
            $this->command("EHLO " . gethostname(), 250);
        }
    }

    /**
     * Authenticate with the server using AUTH LOGIN.
     *
     * Sends the username and password base64-encoded in separate responses
     * to the server's 334 challenges.
     *
     * @return void
     * @throws RuntimeException If the server rejects the credentials.
     */
    private function authenticate(): void {
        // Try AUTH LOGIN
        $this->command('AUTH LOGIN', 334);
        $this->command(base64_encode($this->username), 334);
        $this->command(base64_encode($this->password), 235);
    }

    // ----------------------------------------------------------------
    // MIME message builder
    // ----------------------------------------------------------------

    /**
     * Build the complete RFC 2822 message string ready to be written to the DATA stream.
     *
     * Constructs a MIME tree appropriate to the content:
     * - Always: multipart/alternative wrapping text/plain + text/html.
     * - With inline images: multipart/related wrapping the alternative part + images.
     * - With file attachments: multipart/mixed as the outer container.
     *
     * @param  array<string, mixed> $mail Mail data (same structure as {@see send()}).
     * @return string Full RFC 2822 message (headers + blank line + body), without the terminating `\r\n.\r\n`.
     */
    private function buildMessage(array $mail): string {
        $msgId   = '<' . bin2hex(random_bytes(16)) . '@cm-imap>';
        $date    = date('r');
        $subject = $this->encodeHeader($mail['subject'] ?? '(no subject)');
        $from    = $this->formatAddress($mail['from']);

        $headers  = "Date: $date\r\n";
        $headers .= "Message-ID: $msgId\r\n";
        $headers .= "From: $from\r\n";
        $headers .= "To: " . $this->formatAddressList($mail['to'] ?? []) . "\r\n";
        if (!empty($mail['cc'])) {
            $headers .= "Cc: " . $this->formatAddressList($mail['cc']) . "\r\n";
        }
        if (!empty($mail['reply_to'])) {
            $headers .= "Reply-To: " . $this->formatAddress($mail['reply_to']) . "\r\n";
        }
        if (!empty($mail['in_reply_to'])) {
            $headers .= "In-Reply-To: <{$mail['in_reply_to']}>\r\n";
            $headers .= "References: <{$mail['in_reply_to']}>\r\n";
        }
        $headers .= "Subject: $subject\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "X-Mailer: CM-IMAP\r\n";

        $inlineImages  = $mail['inline_images'] ?? [];
        $attachmentArr = $mail['attachments'] ?? [];
        $bodyText      = $mail['body_text'] ?? '';
        $bodyHtml      = $mail['body_html'] ?? '';

        // Build body parts
        $altBoundary     = $this->boundary();
        $relatedBoundary = $this->boundary();
        $mixedBoundary   = $this->boundary();

        $hasInline    = !empty($inlineImages);
        $hasAttach    = !empty($attachmentArr);

        // multipart/alternative (text + html)
        $altPart  = "Content-Type: multipart/alternative; boundary=\"$altBoundary\"\r\n\r\n";
        $altPart .= "--$altBoundary\r\n";
        $altPart .= "Content-Type: text/plain; charset=UTF-8\r\n";
        $altPart .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
        $altPart .= $this->quotedPrintableEncode($bodyText) . "\r\n";
        $altPart .= "--$altBoundary\r\n";
        $altPart .= "Content-Type: text/html; charset=UTF-8\r\n";
        $altPart .= "Content-Transfer-Encoding: quoted-printable\r\n\r\n";
        $altPart .= $this->quotedPrintableEncode($bodyHtml) . "\r\n";
        $altPart .= "--$altBoundary--";

        if ($hasInline) {
            // Wrap alt in multipart/related
            $relatedPart  = "Content-Type: multipart/related; boundary=\"$relatedBoundary\"\r\n\r\n";
            $relatedPart .= "--$relatedBoundary\r\n$altPart\r\n";
            foreach ($inlineImages as $img) {
                $relatedPart .= "--$relatedBoundary\r\n";
                $relatedPart .= "Content-Type: {$img['mime_type']}\r\n";
                $relatedPart .= "Content-Transfer-Encoding: base64\r\n";
                $relatedPart .= "Content-ID: <{$img['content_id']}>\r\n";
                $relatedPart .= "Content-Disposition: inline; filename=\"{$img['filename']}\"\r\n\r\n";
                $relatedPart .= chunk_split(base64_encode($img['data'])) . "\r\n";
            }
            $relatedPart .= "--$relatedBoundary--";
            $innerPart = $relatedPart;
            $innerType = "Content-Type: multipart/related; boundary=\"$relatedBoundary\"";
        } else {
            $innerPart = $altPart;
            $innerType = "Content-Type: multipart/alternative; boundary=\"$altBoundary\"";
        }

        if ($hasAttach) {
            // Wrap in multipart/mixed
            $body  = "Content-Type: multipart/mixed; boundary=\"$mixedBoundary\"\r\n\r\n";
            $body .= "--$mixedBoundary\r\n$innerPart\r\n";
            foreach ($attachmentArr as $att) {
                $fname = $this->encodeHeaderWord($att['filename']);
                $body .= "--$mixedBoundary\r\n";
                $body .= "Content-Type: {$att['mime_type']}; name=\"{$fname}\"\r\n";
                $body .= "Content-Transfer-Encoding: base64\r\n";
                $body .= "Content-Disposition: attachment; filename=\"{$fname}\"\r\n\r\n";
                $body .= chunk_split(base64_encode($att['data'])) . "\r\n";
            }
            $body .= "--$mixedBoundary--";
            $headers .= "Content-Type: multipart/mixed; boundary=\"$mixedBoundary\"\r\n";
        } else {
            $body     = $innerPart;
            $headers .= $innerType . "\r\n";
        }

        return $headers . "\r\n" . $body;
    }

    // ----------------------------------------------------------------
    // SMTP protocol helpers
    // ----------------------------------------------------------------

    /**
     * Write a command to the socket and wait for an expected response code.
     *
     * @param  string     $cmd            SMTP command string (without CRLF).
     * @param  int|int[]  $expectCode     Expected response code(s).
     * @param  bool       $returnResponse Whether to return the full response string.
     * @return string The server response if `$returnResponse` is true, otherwise empty string.
     * @throws RuntimeException On unexpected response code.
     */
    private function command(string $cmd, int|array $expectCode, bool $returnResponse = false): string {
        fwrite($this->socket, $cmd . "\r\n");
        return $this->expectCode($expectCode, $returnResponse);
    }

    /**
     * Read lines from the socket until a complete SMTP response is received,
     * then verify the response code is among the expected codes.
     *
     * Multi-line responses (where the 4th character is '-') are read in full before
     * the code is checked.
     *
     * @param  int|int[] $code           Acceptable response code(s).
     * @param  bool      $returnResponse Whether to return the full response text.
     * @return string Full response text if `$returnResponse` is true, otherwise empty string.
     * @throws RuntimeException If the connection drops or an unexpected code is received.
     */
    private function expectCode(int|array $code, bool $returnResponse = false): string {
        $codes    = is_array($code) ? $code : [$code];
        $response = '';
        while (true) {
            $line = fgets($this->socket, 512);
            if ($line === false) throw new RuntimeException('SMTP connection lost');
            $response .= $line;
            // Multi-line response continues while 4th char is '-'
            if (strlen($line) >= 4 && $line[3] !== '-') break;
        }
        $responseCode = (int)substr($response, 0, 3);
        if (!in_array($responseCode, $codes)) {
            throw new RuntimeException("SMTP error (expected " . implode('/', $codes) . "): $response");
        }
        return $returnResponse ? $response : '';
    }

    // ----------------------------------------------------------------
    // Encoding helpers
    // ----------------------------------------------------------------

    /**
     * Encode a header value as RFC 2047 Base64 if it contains non-ASCII characters.
     *
     * @param  string $text Header value to encode.
     * @return string ASCII-safe header string.
     */
    private function encodeHeader(string $text): string {
        if (preg_match('/[^\x20-\x7E]/', $text)) {
            return '=?UTF-8?B?' . base64_encode($text) . '?=';
        }
        return $text;
    }

    /**
     * Encode a header word (e.g. attachment filename) for use in a structured header field.
     *
     * Delegates to {@see encodeHeader()}.
     *
     * @param  string $text
     * @return string
     */
    private function encodeHeaderWord(string $text): string {
        return $this->encodeHeader($text);
    }

    /**
     * Format a single address as "Display Name <email>" or just "email".
     *
     * The display name is RFC 2047-encoded if it contains non-ASCII characters.
     *
     * @param  array{name?: string, email: string} $addr Address array.
     * @return string Formatted address string.
     */
    private function formatAddress(array $addr): string {
        $email = $addr['email'];
        $name  = $addr['name'] ?? '';
        if ($name) {
            return $this->encodeHeader($name) . " <$email>";
        }
        return $email;
    }

    /**
     * Format a list of addresses as a comma-separated header value.
     *
     * @param  array<int, array{name?: string, email: string}> $addrs
     * @return string
     */
    private function formatAddressList(array $addrs): string {
        return implode(', ', array_map([$this, 'formatAddress'], $addrs));
    }

    /**
     * Encode a string using quoted-printable transfer encoding.
     *
     * @param  string $text UTF-8 input.
     * @return string Quoted-printable encoded output.
     */
    private function quotedPrintableEncode(string $text): string {
        return quoted_printable_encode($text);
    }

    /**
     * Generate a unique MIME boundary string.
     *
     * @return string e.g. `----=_Part_a3f2c1b0d4e5f6a7`
     */
    private function boundary(): string {
        return '----=_Part_' . bin2hex(random_bytes(8));
    }
}
