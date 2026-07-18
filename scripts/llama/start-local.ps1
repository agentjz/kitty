param(
  [string]$Model = "gemma-3-12b-it-q4_0.gguf",
  [int]$Port = 8080,
  [int]$Context = 0,
  [switch]$Foreground
)

$ErrorActionPreference = "Stop"
$Root = "D:\AI\llama.cpp"
$Server = Join-Path $Root "bin\llama-server.exe"
$Models = Join-Path $Root "models"
$Logs = Join-Path $Root "logs"
$PidFile = Join-Path $Root "llama-server.pid"
$LogFile = Join-Path $Logs "llama-server.log"
$Manifest = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "models.json") | ConvertFrom-Json

if (-not (Test-Path -LiteralPath $Server)) { throw "llama-server is not installed at $Server" }
$modelSpec = $Manifest | Where-Object { $_.file -eq $Model } | Select-Object -First 1
if (-not $modelSpec) { throw "Model is not declared in scripts/llama/models.json: $Model" }
$Context = if ($Context -gt 0) { $Context } elseif ($modelSpec.context) { [int]$modelSpec.context } else { 32768 }
$modelPath = Join-Path $Models $Model
if (-not (Test-Path -LiteralPath $modelPath)) { throw "Model is not installed at $modelPath" }
if ((Get-Item -LiteralPath $modelPath).Length -ne [int64]$modelSpec.bytes) { throw "Model is incomplete: $modelPath" }
$marker = Join-Path $Models "$Model.sha256"
if (-not (Test-Path -LiteralPath $marker) -or (Get-Content -Raw -LiteralPath $marker).Trim().ToLowerInvariant() -ne $modelSpec.sha256) { throw "Model SHA-256 is not verified. Run powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llama/verify-models.ps1 first." }
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

if (Test-Path -LiteralPath $PidFile) {
  $oldPid = [int](Get-Content -Raw -LiteralPath $PidFile)
  if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) { throw "llama-server is already running with PID $oldPid" }
  Remove-Item -LiteralPath $PidFile -Force
}

$arguments = @(
  "--host", "127.0.0.1",
  "--port", "$Port",
  "--models-dir", $Models,
  "--models-max", "1",
  "--model", $modelPath,
  "--alias", $Model,
  "--ctx-size", "$Context",
  "--cache-type-k", "q8_0",
  "--cache-type-v", "q8_0",
  "--fit", "on",
  "--jinja",
  "--no-webui",
  "--sleep-idle-seconds", "300",
  "--log-file", $LogFile
)

if ($Foreground) {
  & $Server @arguments
  exit $LASTEXITCODE
}

$process = Start-Process -FilePath $Server -ArgumentList $arguments -WorkingDirectory $Root -WindowStyle Hidden -PassThru
Set-Content -LiteralPath $PidFile -Value $process.Id -NoNewline
Write-Output ("llama.cpp server started: pid={0} model={1} endpoint=http://127.0.0.1:{2}/v1" -f $process.Id, $Model, $Port)
