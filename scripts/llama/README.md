# 本机 llama.cpp

本机安装目录是 `D:\AI\llama.cpp`。CUDA 12.4 版 `llama-server` 监听 `127.0.0.1:8080`，Kitty 将它作为普通的无鉴权 OpenAI-compatible 语言 Provider 使用。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llama/verify-models.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llama/accept-models.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llama/start-local.ps1 -Model gemma-3-12b-it-q4_0.gguf
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llama/status-local.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/llama/stop-local.ps1
```

`models.json` 是当前已安装模型的校验清单。下载入口已移除；本机只保留已校验的 Gemma 文件。启动脚本只接受清单内且已通过 `verify-models.ps1` 的文件，最多加载一个模型。

当前本地模型：

- Google Gemma 3 12B QAT Q4_0

在 Kitty Web 的“语言模型设置”中选择对应“本机” preset；Base URL 保持 `http://127.0.0.1:8080/v1`，本地 Provider 不需要 API Key。
