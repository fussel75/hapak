@echo off
setlocal

cd /d "%~dp0\.."

if not defined NODE_ENV set "NODE_ENV=development"
if not defined DATABASE_URL set "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fristd_bau"
if not defined SESSION_SECRET set "SESSION_SECRET=local-dev-session-secret"

set "WORKSPACE_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%WORKSPACE_NODE%" (
  "%WORKSPACE_NODE%" "node_modules\tsx\dist\cli.mjs" "server\index.ts"
) else (
  node "node_modules\tsx\dist\cli.mjs" "server\index.ts"
)
