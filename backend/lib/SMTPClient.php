<?php

/**
 * Pure-PHP SMTP client (no external dependencies).
 * Supports: plain TCP, SSL, STARTTLS, AUTH LOGIN, AUTH PLAIN.
 * Handles: multipart/alternative, multipart/related (inline images), multipart/mixed (attachments).
 */
class SMTPClient {
    private mixed  $socket = null;
    private string $host;
    private int    $port;
    private string $encryption;
    private string $username;
    private string $password;
    private int    $timeout = 30;

    public function __construct(array $account, Encryption $enc) {
        $this->host       = $account['smtp_host'];
        $this->port       = (int)$account['smtp_port'];
        $this->encryption = $account['smtp_encryption'];
        $this->username   = $account['smtp_username'];
        $this->password   = $enc->decrypt($account['smtp_password_enc'], $account['smtp_password_iv']);
    }

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

    private function authenticate(): void {
        // Try AUTH LOGIN
        $this->command('AUTH LOGIN', 334);
        $this->command(base64_encode($this->username), 334);
        $this->command(base64_encode($this->password), 235);
    }

    // ----------------------------------------------------------------
    // MIME message builder
    // ----------------------------------------------------------------

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

    private function command(string $cmd, int|array $expectCode, bool $returnResponse = false): string {
        fwrite($this->socket, $cmd . "\r\n");
        return $this->expectCode($expectCode, $returnResponse);
    }

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

    private function encodeHeader(string $text): string {
        if (preg_match('/[^\x20-\x7E]/', $text)) {
            return '=?UTF-8?B?' . base64_encode($text) . '?=';
        }
        return $text;
    }

    private function encodeHeaderWord(string $text): string {
        return $this->encodeHeader($text);
    }

    private function formatAddress(array $addr): string {
        $email = $addr['email'];
        $name  = $addr['name'] ?? '';
        if ($name) {
            return $this->encodeHeader($name) . " <$email>";
        }
        return $email;
    }

    private function formatAddressList(array $addrs): string {
        return implode(', ', array_map([$this, 'formatAddress'], $addrs));
    }

    private function quotedPrintableEncode(string $text): string {
        return quoted_printable_encode($text);
    }

    private function boundary(): string {
        return '----=_Part_' . bin2hex(random_bytes(8));
    }
}
