$ErrorActionPreference = "Stop"

if (-not $env:PORT) {
  $env:PORT = "3000"
}

Write-Host "Iniciando chatbot em http://localhost:$env:PORT"
node backend\server.js
