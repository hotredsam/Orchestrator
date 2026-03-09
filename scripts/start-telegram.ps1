$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$orchestratorPath = Join-Path $scriptDir "orchestrator.py"
$env:TELEGRAM_ENABLED = "1"
Start-Process python -ArgumentList "`"$orchestratorPath`"","--server-only","--telegram" -WindowStyle Hidden
Write-Output "Server started with Telegram bot and repos stopped by default"
