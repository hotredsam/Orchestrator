# Run this once to create a Desktop shortcut on Windows
# Right-click > Run with PowerShell

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "Swarm Orchestrator.lnk"
$TargetPath = Join-Path $ScriptDir "launch-swarm.bat"

$IconPath = Join-Path $ScriptDir "cactus.ico"

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $TargetPath
$Shortcut.WorkingDirectory = $ScriptDir
$Shortcut.Description = "Start Swarm Orchestrator + Dashboard"
if (Test-Path $IconPath) {
    $Shortcut.IconLocation = "$IconPath,0"
}
$Shortcut.Save()

Write-Host "Desktop shortcut created at: $ShortcutPath"
Write-Host "Double-click it to start the orchestrator and open http://localhost:6969"
