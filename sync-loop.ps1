# CM-IMAP background sync loop
# Calls backend/cron/sync.php via the PHP CLI every 5 minutes.
# Output is written to both the console and sync.log in the same directory.
# Stop with Ctrl+C.

$PhpExe   = "C:\laragon\bin\php\php-8.3.30-Win32-vs16-x64\php.exe"
$SyncScript = "$PSScriptRoot\backend\cron\sync.php"
$LogFile    = "$PSScriptRoot\sync.log"
$IntervalSeconds = 300

if (-not (Test-Path $PhpExe)) {
    Write-Error "PHP not found at: $PhpExe"
    exit 1
}
if (-not (Test-Path $SyncScript)) {
    Write-Error "Sync script not found at: $SyncScript"
    exit 1
}

Write-Host "CM-IMAP sync loop started. Interval: $IntervalSeconds s. Log: $LogFile"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

while ($true) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] Running sync..."

    $output = & $PhpExe $SyncScript 2>&1
    $output | Tee-Object -FilePath $LogFile -Append

    $next = (Get-Date).AddSeconds($IntervalSeconds).ToString("HH:mm:ss")
    Write-Host "Next run at $next`n"
    Start-Sleep -Seconds $IntervalSeconds
}
