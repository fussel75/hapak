$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$env:NODE_ENV = "development"
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/fristd_bau"
$env:SESSION_SECRET = "local-dev-session-secret"

$node = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $node)) {
  $node = "node"
}

$logPath = Join-Path $env:TEMP "fristd-dev-server.log"
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting FriStD dev server with $node" | Set-Content -LiteralPath $logPath

& $node "node_modules/tsx/dist/cli.mjs" "server/index.ts" *>> $logPath
