@echo off
setlocal

cd /d "%~dp0\.."

set "NODE_ENV=development"
set "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fristd_bau"
set "SESSION_SECRET=local-dev-session-secret"

set "WORKSPACE_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%WORKSPACE_NODE%" (
  "%WORKSPACE_NODE%" "node_modules\tsx\dist\cli.mjs" "server\index.ts"
) else (
  node "node_modules\tsx\dist\cli.mjs" "server\index.ts"
)
