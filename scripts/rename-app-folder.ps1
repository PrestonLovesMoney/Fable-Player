# Rename the desktop app folder to fableplayer.
# Close Electron / terminals using that folder first, then run from repo root:
#   .\scripts\rename-app-folder.ps1

$ErrorActionPreference = 'Stop'
$electronDir = Join-Path $PSScriptRoot '..\src\apps\desktop\electron' | Resolve-Path
$to = Join-Path $electronDir 'fableplayer'

if (Test-Path $to) {
  Write-Host 'App folder is already named fableplayer.'
  exit 0
}

$candidates = Get-ChildItem -LiteralPath $electronDir -Directory |
  Where-Object { $_.Name -ne 'fableplayer' -and (Test-Path (Join-Path $_.FullName 'electron-builder.yml')) }

if ($candidates.Count -ne 1) {
  Write-Error 'Could not uniquely locate the Electron app folder to rename.'
}

Rename-Item -LiteralPath $candidates[0].FullName -NewName 'fableplayer'
Write-Host "Renamed $($candidates[0].Name) -> fableplayer"
