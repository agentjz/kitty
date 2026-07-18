$ErrorActionPreference = "Stop"
$PidFile = "D:\AI\llama.cpp\llama-server.pid"
if (-not (Test-Path -LiteralPath $PidFile)) { Write-Output "llama.cpp server is not running"; exit 0 }
$serverPid = [int](Get-Content -Raw -LiteralPath $PidFile)
$process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($process) { Stop-Process -Id $serverPid -Force }
Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
Write-Output ("llama.cpp server stopped: pid={0}" -f $serverPid)
