$ErrorActionPreference = "Stop"
$Root = "D:\AI\llama.cpp"
$PidFile = Join-Path $Root "llama-server.pid"
$Server = Join-Path $Root "bin\llama-server.exe"
$manifest = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "models.json") | ConvertFrom-Json
$models = @($manifest | ForEach-Object {
  $spec = $_
  $path = Join-Path (Join-Path $Root "models") $spec.file
  $prefixBytes = if(Test-Path -LiteralPath $path){(Get-Item -LiteralPath $path).Length}else{0}
  $partialMeasure = Get-ChildItem -LiteralPath (Join-Path $Root "models") -Filter "$($spec.file).part-*" -File -ErrorAction SilentlyContinue |
    ForEach-Object { $_.Refresh(); $_.Length } | Measure-Object -Sum
  $partialBytes = if($partialMeasure.Sum){[int64]$partialMeasure.Sum}else{0}
  $ready = (Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -eq [int64]$spec.bytes -and
    (Test-Path -LiteralPath "$path.sha256") -and (Get-Content -Raw -LiteralPath "$path.sha256").Trim().ToLowerInvariant() -eq $spec.sha256
  [pscustomobject]@{ File = $spec.file; Ready = $ready; DownloadedBytes = $prefixBytes + $partialBytes; ExpectedBytes = [int64]$spec.bytes }
})
$running = $false
$serverPid = $null
if (Test-Path -LiteralPath $PidFile) {
  $serverPid = [int](Get-Content -Raw -LiteralPath $PidFile)
  $running = [bool](Get-Process -Id $serverPid -ErrorAction SilentlyContinue)
}
$health = $null
if ($running) { try { $health = (Invoke-RestMethod -Uri "http://127.0.0.1:8080/health" -TimeoutSec 3).status } catch { $health = "unreachable" } }
[pscustomobject]@{ Installed = (Test-Path -LiteralPath $Server); Running = $running; Pid = $serverPid; Health = $health } | Format-List
$models | Format-Table -AutoSize
