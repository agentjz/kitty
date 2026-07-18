param(
  [ValidateRange(1, 4)][int]$ConnectionsPerModel = 2,
  [string]$OnlyModel
)

$ErrorActionPreference = "Stop"
$Root = "D:\AI\llama.cpp"
$Models = Join-Path $Root "models"
$LogDir = Join-Path $Root "logs"
$Manifest = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "models.json") | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $Models,$LogDir | Out-Null

if ($OnlyModel) {
  $Manifest = @($Manifest | Where-Object { $_.file -eq $OnlyModel })
  if ($Manifest.Count -ne 1) { throw "Unknown model: $OnlyModel" }
}

function Get-ExpectedPart([int64]$start, [int64]$end) {
  return $end - $start + 1
}

$progressStartedAt = @{}
$lastProgressAt = Get-Date

function Get-ModelDownloadedBytes($model) {
  $target = Join-Path $Models $model.file
  $total = if (Test-Path -LiteralPath $target) { [int64](Get-Item -LiteralPath $target).Length } else { 0L }
  $parts = Get-ChildItem -LiteralPath $Models -Filter "$($model.file).part-*" -File -ErrorAction SilentlyContinue
  foreach ($part in $parts) { $total += [int64]$part.Length }
  return [Math]::Min($total, [int64]$model.bytes)
}

function Write-ProgressSnapshot([object[]]$models) {
  $now = Get-Date
  foreach ($model in $models) {
    if (-not $progressStartedAt.ContainsKey($model.file)) { $progressStartedAt[$model.file] = $now }
    $downloaded = Get-ModelDownloadedBytes $model
    $expected = [int64]$model.bytes
    $elapsed = [Math]::Max(0.001, ($now - $progressStartedAt[$model.file]).TotalSeconds)
    $rate = $downloaded / $elapsed
    $remaining = [Math]::Max(0L, $expected - $downloaded)
    $eta = if ($rate -gt 0 -and $remaining -gt 0) { [TimeSpan]::FromSeconds($remaining / $rate).ToString('hh\:mm\:ss') } elseif ($remaining -eq 0) { '00:00:00' } else { '--:--:--' }
    $percent = if ($expected -gt 0) { [Math]::Round(($downloaded / $expected) * 100, 2) } else { 0 }
    Write-Output ("Progress {0}: {1}/{2} bytes ({3}%), {4:N2} MB/s, ETA {5}" -f $model.file,$downloaded,$expected,$percent,($rate / 1MB),$eta)
  }
}

function Wait-DownloadJobs([object[]]$jobs, [object[]]$models) {
  while ($true) {
    $running = @($jobs | Where-Object { $_.Process.Refresh(); -not $_.Process.HasExited })
    if ($running.Count -eq 0) { break }
    $now = Get-Date
    if (($now - $script:lastProgressAt).TotalSeconds -ge 10) {
      Write-ProgressSnapshot $models
      $script:lastProgressAt = $now
    }
    Start-Sleep -Seconds 1
  }
}

foreach ($model in $Manifest) {
  if (-not $progressStartedAt.ContainsKey($model.file)) { $progressStartedAt[$model.file] = Get-Date }
  $target = Join-Path $Models $model.file
  $prefix = if (Test-Path -LiteralPath $target) { (Get-Item -LiteralPath $target).Length } else { 0 }
  if ($prefix -gt [int64]$model.bytes) { throw "Model is larger than its manifest size: $target" }
  if ($prefix -eq [int64]$model.bytes) {
    Write-Output "Already complete: $($model.file)"
    continue
  }

  $remaining = [int64]$model.bytes - $prefix
  $chunkSize = [int64][Math]::Ceiling($remaining / 16)
  $parts = @()
  for ($index = 0; $index -lt 16; $index += 1) {
    $start = $prefix + $chunkSize * $index
    if ($start -ge [int64]$model.bytes) { break }
    $end = [Math]::Min([int64]$model.bytes - 1, $start + $chunkSize - 1)
    $part = "$target.part-$($index.ToString('00'))"
    $expected = Get-ExpectedPart $start $end
    $valid = (Test-Path -LiteralPath $part) -and ((Get-Item -LiteralPath $part).Length -eq $expected)
    if ($valid) {
      Write-Output ("Reuse {0} segment {1}: {2} bytes" -f $model.file,$index,$expected)
      continue
    }
    if (Test-Path -LiteralPath $part) { Remove-Item -LiteralPath $part -Force }
    $parts += [pscustomobject]@{ Model = $model.file; Index = $index; Start = $start; End = $end; Part = $part; Expected = $expected }
  }

  while ($parts.Count -gt 0) {
    $batch = @($parts | Select-Object -First $ConnectionsPerModel)
    $jobs = @()
    foreach ($part in $batch) {
      $arguments = @(
        "-L", "--fail", "--retry", "20", "--retry-all-errors", "--retry-delay", "5",
        "--connect-timeout", "30", "--max-time", "3600", "--range", "$($part.Start)-$($part.End)",
        "--output", $part.Part, $model.source
      )
      $stdout = Join-Path $LogDir ("download-{0}-{1}.stdout.log" -f $model.file,$part.Index)
      $stderr = Join-Path $LogDir ("download-{0}-{1}.stderr.log" -f $model.file,$part.Index)
      $process = Start-Process -FilePath "curl.exe" -ArgumentList $arguments -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
      $jobs += [pscustomobject]@{ Part = $part; Process = $process; Stderr = $stderr }
      Write-Output ("Started {0} segment {1} ({2}-{3})" -f $model.file,$part.Index,$part.Start,$part.End)
    }
    Wait-DownloadJobs $jobs @($model)
    foreach ($job in $jobs) {
      $job.Process.Refresh()
      $actual = if (Test-Path -LiteralPath $job.Part.Part) { (Get-Item -LiteralPath $job.Part.Part).Length } else { 0 }
      if ($job.Process.ExitCode -ne 0 -or $actual -ne $job.Part.Expected) {
        $errorText = if (Test-Path -LiteralPath $job.Stderr) { (Get-Content -Raw -LiteralPath $job.Stderr).Trim() } else { "no curl stderr" }
        throw "Range failed for $($model.file) segment $($job.Part.Index): exit=$($job.Process.ExitCode), bytes=$actual/$($job.Part.Expected). $errorText"
      }
      Write-Output ("Completed {0} segment {1}: {2} bytes" -f $model.file,$job.Part.Index,$actual)
    }
    $parts = @($parts | Where-Object { $batch.Index -notcontains $_.Index })
  }

  $segmentFiles = @()
  for ($index = 0; $index -lt 16; $index += 1) {
    $part = "$target.part-$($index.ToString('00'))"
    if (Test-Path -LiteralPath $part) { $segmentFiles += $part }
  }
  $output = [System.IO.File]::Open($target, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  try {
    foreach ($part in $segmentFiles) {
      $input = [System.IO.File]::OpenRead($part)
      try { $input.CopyTo($output, 8MB) } finally { $input.Dispose() }
    }
  } finally { $output.Dispose() }
  foreach ($part in $segmentFiles) { Remove-Item -LiteralPath $part -Force }
  $actual = (Get-Item -LiteralPath $target).Length
  if ($actual -ne [int64]$model.bytes) { throw "Combined model size mismatch for $($model.file): got $actual, expected $($model.bytes)." }
  Write-Output ("Completed {0}: {1} bytes" -f $model.file,$actual)
}

Write-Output "All requested model files have their manifest size."
