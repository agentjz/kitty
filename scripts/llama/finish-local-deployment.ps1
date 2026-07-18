param([Parameter(Mandatory = $true)][int]$DownloadPid)

$ErrorActionPreference = "Stop"
$Root = "D:\AI\llama.cpp"
$Log = Join-Path $Root "logs\finish-local-deployment.log"
New-Item -ItemType Directory -Force -Path (Split-Path $Log -Parent) | Out-Null

try {
  Wait-Process -Id $DownloadPid -ErrorAction SilentlyContinue
  & (Join-Path $PSScriptRoot "accept-models.ps1") *>&1 | Tee-Object -FilePath $Log
  if ($LASTEXITCODE -ne 0) { throw "Local model acceptance failed with exit code $LASTEXITCODE." }
} catch {
  $_ | Out-String | Add-Content -LiteralPath $Log
  throw
}
