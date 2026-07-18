$ErrorActionPreference = "Stop"
$Root = "D:\AI\llama.cpp"
$Manifest = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "models.json") | ConvertFrom-Json
$ReportPath = Join-Path $Root "logs\local-model-acceptance.json"

& (Join-Path $PSScriptRoot "verify-models.ps1") | Out-Host
$results = @()

foreach ($model in $Manifest) {
  $context = 32768
  & (Join-Path $PSScriptRoot "stop-local.ps1") | Out-Null
  $startedAt = Get-Date
  & (Join-Path $PSScriptRoot "start-local.ps1") -Model $model.file -Context $context | Out-Host
  try {
    $health = $null
    for ($attempt = 0; $attempt -lt 180; $attempt += 1) {
      Start-Sleep -Seconds 5
      try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8080/health" -TimeoutSec 3
        if ($health.status -eq "ok") { break }
      } catch {
        $health = $null
      }
    }
    if (-not $health -or $health.status -ne "ok") { throw "llama.cpp did not become healthy for $($model.file)." }
    $loadSeconds = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 2)

    $models = Invoke-RestMethod -Uri "http://127.0.0.1:8080/v1/models" -TimeoutSec 30
    $ids = @($models.data | ForEach-Object { $_.id })
    if ($ids -notcontains $model.file) { throw "Router model id mismatch for $($model.file): $($ids -join ', ')." }

    $chatBody = @{
      model = $model.file
      messages = @(@{ role = "user"; content = "Reply with one short sentence in Simplified Chinese confirming that the local model connection works." })
      max_tokens = 96
      temperature = 0
      stream = $false
    } | ConvertTo-Json -Depth 8
    $chatWatch = [System.Diagnostics.Stopwatch]::StartNew()
    $chat = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8080/v1/chat/completions" -ContentType "application/json" -Body $chatBody -TimeoutSec 900
    $chatWatch.Stop()
    $content = [string]$chat.choices[0].message.content
    if ([string]::IsNullOrWhiteSpace($content)) { throw "Non-streaming response was empty for $($model.file)." }

    $streamBody = @{
      model = $model.file
      messages = @(@{ role = "user"; content = "Reply in Simplified Chinese confirming that streaming works." })
      max_tokens = 64
      temperature = 0
      stream = $true
      stream_options = @{ include_usage = $true }
    } | ConvertTo-Json -Depth 8
    $stream = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "http://127.0.0.1:8080/v1/chat/completions" -ContentType "application/json" -Body $streamBody -TimeoutSec 900
    if ($stream.Content -notmatch "data:" -or $stream.Content -notmatch "\[DONE\]") { throw "Streaming SSE response was incomplete for $($model.file)." }

    $toolBody = @{
      model = $model.file
      messages = @(@{ role = "user"; content = "Call sum_numbers exactly once with a=17 and b=25. Do not calculate it yourself." })
      tools = @(@{ type = "function"; function = @{ name = "sum_numbers"; description = "Add two integers."; parameters = @{ type = "object"; properties = @{ a = @{ type = "integer" }; b = @{ type = "integer" } }; required = @("a", "b"); additionalProperties = $false } } })
      tool_choice = @{ type = "function"; function = @{ name = "sum_numbers" } }
      max_tokens = 128
      temperature = 0
      stream = $false
    } | ConvertTo-Json -Depth 12
    $tool = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8080/v1/chat/completions" -ContentType "application/json" -Body $toolBody -TimeoutSec 900
    $toolCalls = @($tool.choices[0].message.tool_calls)
    if ($toolCalls.Count -ne 1 -or $toolCalls[0].function.name -ne "sum_numbers") { throw "Tool-call response was invalid for $($model.file)." }
    $toolArguments = $toolCalls[0].function.arguments | ConvertFrom-Json
    if ($toolArguments.a -ne 17 -or $toolArguments.b -ne 25) { throw "Tool-call arguments were invalid for $($model.file)." }

    $gpu = & nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>$null
    $results += [pscustomobject]@{
      model = $model.file
      context = $context
      loadSeconds = $loadSeconds
      chatSeconds = [math]::Round($chatWatch.Elapsed.TotalSeconds, 2)
      promptTokens = $chat.usage.prompt_tokens
      completionTokens = $chat.usage.completion_tokens
      predictedTokensPerSecond = $chat.timings.predicted_per_second
      modelIds = $ids
      chineseResponse = $content
      streaming = $true
      toolCall = $toolCalls[0].function.name
      gpuMemory = [string]$gpu
    }
  } finally {
    & (Join-Path $PSScriptRoot "stop-local.ps1") | Out-Host
  }
}

$report = [pscustomobject]@{
  acceptedAt = (Get-Date).ToUniversalTime().ToString("o")
  llamaVersion = (& (Join-Path $Root "bin\llama-server.exe") --version 2>&1 | Select-Object -First 1)
  models = $results
}
New-Item -ItemType Directory -Force -Path (Split-Path $ReportPath -Parent) | Out-Null
$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $ReportPath -Encoding utf8
$results | Format-Table model,context,loadSeconds,chatSeconds,predictedTokensPerSecond,toolCall -AutoSize
Write-Output "Acceptance report: $ReportPath"
