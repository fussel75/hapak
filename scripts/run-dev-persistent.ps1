$ErrorActionPreference = "Stop"

Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

if (-not $env:NODE_ENV) {
  $env:NODE_ENV = "development"
}
if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/fristd_bau"
}
if (-not $env:SESSION_SECRET) {
  $env:SESSION_SECRET = "local-dev-session-secret"
}

$workspaceNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (Test-Path $workspaceNode) {
  & $workspaceNode "node_modules\tsx\dist\cli.mjs" "server\index.ts"
} else {
  & node "node_modules\tsx\dist\cli.mjs" "server\index.ts"
}
