$ErrorActionPreference = "Stop"
$Root = "D:\AI\llama.cpp"
$Models = Join-Path $Root "models"
$ManifestPath = Join-Path $PSScriptRoot "models.json"
$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$results = @()
foreach ($item in $manifest) {
  $path = Join-Path $Models $item.file
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing model: $path" }
  $actualSize = (Get-Item -LiteralPath $path).Length
  if ($actualSize -ne [int64]$item.bytes) { throw "Incomplete model $($item.file): got $actualSize bytes, expected $($item.bytes)." }
  $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $item.sha256) { throw "SHA-256 mismatch for $($item.file): got $actualHash, expected $($item.sha256)." }
  Set-Content -LiteralPath (Join-Path $Models "$($item.file).sha256") -Value $actualHash -NoNewline
  $results += [pscustomobject]@{ File = $item.file; Bytes = $actualSize; Sha256 = $actualHash; Verified = $true }
}
$results | Format-Table -AutoSize
