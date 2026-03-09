Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$scriptPath = "C:\Users\hotre\OneDrive\Desktop\Coding Projects\swarm-town\orchestrator.py"
Start-Process python -ArgumentList "`"$scriptPath`"","--server-only" -WindowStyle Hidden
Start-Sleep -Seconds 3

# Open browser
Start-Process "http://localhost:6969"
Write-Output "Server started on http://localhost:6969 and browser opened"
