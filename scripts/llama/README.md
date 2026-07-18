# 本机 llama.cpp

本机安装目录是 `D:\AI\llama.cpp`。CUDA 12.4 版 `llama-server` 监听 `127.0.0.1:8080`，Kitty 将它作为普通的无鉴权 OpenAI-compatible 语言 Provider 使用。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llama/download-models.ps1 -ConnectionsPerModel 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llama/verify-models.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llama/accept-models.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llama/start-local.ps1 -Model gemma-3-12b-it-q4_0.gguf
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llama/status-local.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llama/stop-local.ps1
```

`models.json` 是模型文件名、精确字节数、SHA-256、工具能力、上下文和下载源的唯一部署清单。下载器保留 HTTP Range 断点续传，并在下载期间每 10 秒打印每个模型的字节进度、百分比、速度和 ETA。启动脚本只接受清单内且已通过 `verify-models.ps1` 的文件，最多同时加载一个模型，并使用清单上下文上限、Q8 KV cache、Jinja 和自动显存适配。

当前本地模型：

- Google Gemma 3 12B QAT Q4_0
- Qwen3 8B Q4_K_M（工具调用）
- Qwen3 4B Q4_K_M（工具调用）

在 Kitty Web 的“语言模型设置”中选择对应“本机” preset；Base URL 保持 `http://127.0.0.1:8080/v1`，本地 Provider 不需要 API Key。
