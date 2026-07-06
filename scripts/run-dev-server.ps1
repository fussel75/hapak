$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$env:NODE_ENV = "development"
if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/fristd_bau"
}
if (-not $env:SESSION_SECRET) {
  $env:SESSION_SECRET = "local-dev-session-secret"
}
if (-not $env:HOST) {
  $env:HOST = "127.0.0.1"
}
if (-not $env:PORT) {
  $env:PORT = "5000"
}

$node = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $node)) {
  $node = "node"
}

$logPath = if ($env:FRISTD_DEV_LOG) { $env:FRISTD_DEV_LOG } else { Join-Path $env:TEMP "fristd-dev-server.log" }
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting FriStD dev server with $node on http://$($env:HOST):$($env:PORT)" | Set-Content -LiteralPath $logPath -Encoding utf8

& $node "node_modules/tsx/dist/cli.mjs" "server/index.ts" 2>&1 | ForEach-Object {
  $_ | Add-Content -LiteralPath $logPath -Encoding utf8
}
exit $LASTEXITCODE
