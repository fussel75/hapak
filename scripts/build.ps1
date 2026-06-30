$ErrorActionPreference = "Stop"

$workspaceNode = "C:\Users\Ronny\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = if (Test-Path $workspaceNode) { $workspaceNode } else { "node" }

& $node "scripts/build.mjs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
