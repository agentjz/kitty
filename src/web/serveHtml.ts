export function serveHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>小猫智能体</title>
<link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.8/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-icons/1.13.1/font/bootstrap-icons.min.css" rel="stylesheet">
<style>
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; background: #dbe7ef; color: #17212b; }
  #top-bar { min-height: 3.5rem; background: #ffffff; border-bottom: 1px solid #c7d5df; padding: 0.65rem 1rem; }
  .shell-title { font-weight: 700; line-height: 1.1; }
  #chat-area { flex: 1; overflow-y: auto; padding: 1rem; padding-bottom: 0; background: #dbe7ef; }
  #messages { max-width: 980px; margin: 0 auto; }
  #input-bar { position: sticky; bottom: 0; background: #ffffff; border-top: 1px solid #c7d5df; padding: 0.7rem 1rem; }
  #input-area { display: flex; gap: 0.6rem; align-items: flex-end; max-width: 980px; margin: 0 auto; }
  .msg-user, .msg-agent { display: flex; margin-bottom: 0.55rem; }
  .msg-user { justify-content: flex-end; }
  .msg-agent { justify-content: flex-start; }
  .bubble { display: inline-block; padding: 0.55rem 0.78rem; max-width: min(90%, 820px); text-align: left; overflow-wrap: break-word; word-break: break-word; overflow: hidden; box-shadow: 0 1px 1px rgba(23,33,43,0.08); }
  .msg-user .bubble { background: #d9fdd3; color: #17212b; border-radius: 1rem 1rem 0.25rem 1rem; }
  .msg-agent .bubble { width: min(90%, 820px); background: #ffffff; color: #17212b; border-radius: 1rem 1rem 1rem 0.25rem; }
  .msg-agent .bubble pre { white-space: pre-wrap; overflow-x: auto; max-width: 100%; }
  .msg-agent .bubble code { word-break: break-word; }
  .msg-agent .bubble img { max-width: 100%; height: auto; }
  .msg-agent .bubble table { display: block; overflow-x: auto; max-width: 100%; }
  .msg-agent .bubble p:last-child { margin-bottom: 0; }
  .status-text { min-height: 1.5rem; max-width: 980px; margin: 0 auto; color: #5f7280; font-size: 0.85rem; padding: 0.25rem 0.15rem; }
  details.reasoning-block { width: min(90%, 820px); max-width: 100%; margin: 0 0 0.55rem; overflow: hidden; background: rgba(255,255,255,0.86); border-radius: 1rem 1rem 1rem 0.25rem; box-shadow: 0 1px 1px rgba(23,33,43,0.08); }
  details.reasoning-block summary { color: #456174; font-size: 0.82rem; cursor: pointer; user-select: none; padding: 0.48rem 0.78rem; background: #eef6fb; display: block; }
  details.reasoning-block summary:hover { background: #e5f1f8; }
  details.reasoning-block .reasoning-content { color: #536b7a; font-size: 0.86rem; padding: 0.55rem 0.78rem; line-height: 1.5; overflow-wrap: break-word; word-break: break-word; }
  #input-area textarea { flex: 1; resize: none; background: #f7f9fb; color: #17212b; border: 1px solid #c7d5df; border-radius: 1.1rem; padding: 0.78rem 1rem; min-height: 3.5rem; max-height: 12rem; }
  #input-area textarea:focus { outline: none; border-color: #2aabee; box-shadow: 0 0 0 3px rgba(42,171,238,0.18); }
  #input-area textarea::placeholder { color: #7e909b; }
  .btn-icon { width: 2.75rem; height: 2.75rem; display: flex; align-items: center; justify-content: center; border-radius: 50%; flex: 0 0 auto; }
  #send-btn { background: #2aabee; border-color: #2aabee; color: #fff; }
  #send-btn:hover { background: #229ed9; border-color: #229ed9; }
  #pause-btn { background: #ffffff; border-color: #e25b5b; color: #e25b5b; }
  #pause-btn:hover { background: #fff1f1; border-color: #d94b4b; color: #d94b4b; }
  .btn:disabled { opacity: 0.48; }
  .scroll-anchor { height: 1px; }
</style>
</head>
<body>
<div id="top-bar" class="d-flex align-items-center gap-2">
  <div class="shell-title"><span aria-hidden="true">🐱</span> 小猫智能体</div>
</div>
<div id="chat-area" class="pb-2">
  <div id="messages"></div>
  <div id="status-bar" class="status-text"></div>
  <div class="scroll-anchor"></div>
</div>
<div id="input-bar">
  <div id="input-area">
    <textarea id="msg-input" class="form-control" rows="1" placeholder="正在连接"></textarea>
    <button id="send-btn" class="btn btn-icon rounded-circle" title="发送" disabled><i class="bi bi-send-fill"></i></button>
    <button id="pause-btn" class="btn btn-icon rounded-circle" title="停止" disabled><i class="bi bi-stop-fill"></i></button>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.8/js/bootstrap.bundle.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.7/marked.min.js"></script>
<script>
(function() {
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host);
  const chatArea = document.getElementById('chat-area');
  const messagesDiv = document.getElementById('messages');
  const statusBar = document.getElementById('status-bar');
  const msgInput = document.getElementById('msg-input');
  const sendBtn = document.getElementById('send-btn');
  const pauseBtn = document.getElementById('pause-btn');
  let currentAgentBubble = null;
  let currentAgentText = '';
  let currentReasoningElem = null;
  let currentReasoningText = '';

  function scrollToBottom() {
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function stripUserPrefix(text) {
    return text.replace(/^>\s*/gm, '');
  }

  function finalizeReasoning() {
    currentReasoningElem = null;
    currentReasoningText = '';
  }

  function updateReasoningDelta(delta) {
    if (!currentReasoningElem) {
      const details = document.createElement('details');
      details.className = 'reasoning-block';
      details.open = true;
      const summary = document.createElement('summary');
      summary.textContent = '🐶 思考';
      details.appendChild(summary);
      const content = document.createElement('div');
      content.className = 'reasoning-content';
      details.appendChild(content);
      messagesDiv.appendChild(details);
      currentReasoningElem = content;
      currentReasoningText = '';
    }
    currentReasoningText += delta;
    currentReasoningElem.textContent = currentReasoningText;
    scrollToBottom();
  }

  function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'msg-user';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = stripUserPrefix(text);
    div.appendChild(bubble);
    messagesDiv.appendChild(div);
    currentAgentBubble = null;
    currentAgentText = '';
    currentReasoningElem = null;
    currentReasoningText = '';
    scrollToBottom();
  }

  function addAgentMessage(text) {
    const div = document.createElement('div');
    div.className = 'msg-agent';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = marked.parse(text);
    div.appendChild(bubble);
    messagesDiv.appendChild(div);
    currentAgentBubble = null;
    currentAgentText = '';
    finalizeReasoning();
    scrollToBottom();
  }

  function updateAgentDelta(delta) {
    if (!currentAgentBubble) {
      const div = document.createElement('div');
      div.className = 'msg-agent';
      currentAgentBubble = document.createElement('div');
      currentAgentBubble.className = 'bubble';
      div.appendChild(currentAgentBubble);
      messagesDiv.appendChild(div);
      currentAgentText = '';
    }
    currentAgentText += delta;
    currentAgentBubble.innerHTML = marked.parse(currentAgentText);
    scrollToBottom();
  }

  function finalizeAgentMessage() {
    currentAgentBubble = null;
    currentAgentText = '';
    finalizeReasoning();
  }

  function setStatus(text) {
    statusBar.textContent = text;
  }

  ws.onopen = function() {
    msgInput.placeholder = '已连接，输入消息';
    sendBtn.disabled = false;
    pauseBtn.disabled = false;
    setStatus('');
  };

  ws.onmessage = function(event) {
    var msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }
    switch (msg.type) {
      case 'user':
        addUserMessage(msg.text);
        break;
      case 'reasoning_delta':
        updateReasoningDelta(msg.text);
        break;
      case 'reasoning':
        if (msg.text) {
          currentReasoningElem = null;
          currentReasoningText = '';
          updateReasoningDelta(msg.text);
        }
        break;
      case 'delta':
        updateAgentDelta(msg.text);
        break;
      case 'message':
        addAgentMessage(msg.text);
        break;
      case 'done':
        finalizeAgentMessage();
        setStatus('');
        break;
      case 'status':
        setStatus(msg.text || '');
        break;
      case 'interrupt':
        finalizeAgentMessage();
        setStatus('已中断');
        break;
    }
  };

  ws.onclose = function() {
    msgInput.placeholder = '断开连接';
    sendBtn.disabled = true;
    pauseBtn.disabled = true;
    setStatus('');
  };

  function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;
    msgInput.value = '';
    msgInput.style.height = 'auto';
    if (ws.readyState !== WebSocket.OPEN) {
      msgInput.placeholder = '连接未就绪';
      setStatus('连接未就绪');
      return;
    }
    ws.send(JSON.stringify({ type: 'input', text: text }));
  }

  function sendInterrupt() {
    if (ws.readyState !== WebSocket.OPEN) {
      msgInput.placeholder = '连接未就绪';
      setStatus('连接未就绪');
      return;
    }
    ws.send(JSON.stringify({ type: 'interrupt' }));
  }

  sendBtn.addEventListener('click', sendMessage);
  pauseBtn.addEventListener('click', sendInterrupt);

  msgInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  msgInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 192) + 'px';
  });
})();
</script>
</body>
</html>`;
}
