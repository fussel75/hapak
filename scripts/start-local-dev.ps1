$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not $env:NODE_ENV) {
  $env:NODE_ENV = "development"
}

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/fristd_bau"
}

if (-not $env:SESSION_SECRET) {
  $env:SESSION_SECRET = "local-dev-session-secret"
}

$bundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (Test-Path $bundledNode) {
  $node = $bundledNode
} else {
  $node = "node"
}

& $node "node_modules/tsx/dist/cli.mjs" "server/index.ts"
