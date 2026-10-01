# Starts the E-Ref backend and exposes it on a public HTTPS URL through a Cloudflare quick tunnel.
# Usage (from the EREF folder):  .\start-public.ps1
# Keep this window open while people use the app. Closing it stops both the server and the tunnel.

$root = $PSScriptRoot
$python = Join-Path $root ".venv\Scripts\python.exe"
$cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cloudflared) { $cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe" }

if (-not (Test-Path $python)) { Write-Error "Missing $python. Create the virtual environment first (see backend/README.md)."; exit 1 }
if (-not (Test-Path $cloudflared)) { Write-Error "cloudflared not found. Install it with: winget install Cloudflare.cloudflared"; exit 1 }

Remove-Item Env:EREF_DEV_RETURN_CODE -ErrorAction SilentlyContinue

$server = Start-Process -FilePath $python -WorkingDirectory $root -PassThru -WindowStyle Minimized `
    -ArgumentList "-m", "uvicorn", "backend.server:app", "--host", "127.0.0.1", "--port", "8000"

try {
    Write-Host "Waiting for the server to load its models..."
    $ready = $false
    for ($i = 0; $i -lt 90; $i++) {
        try {
            Invoke-RestMethod "http://127.0.0.1:8000/health" -TimeoutSec 2 | Out-Null
            $ready = $true; break
        } catch { Start-Sleep -Seconds 1 }
    }
    if (-not $ready) { Write-Error "The server did not start within 90 seconds."; exit 1 }

    Write-Host ""
    Write-Host "Server is up. Starting the tunnel. Look for the line with https://<random-words>.trycloudflare.com"
    Write-Host "Enter that address in the app: Profile -> Model Server."
    Write-Host ""
    & $cloudflared tunnel --url http://127.0.0.1:8000
} finally {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force }
}
