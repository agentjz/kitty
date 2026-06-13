export function serveHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Kitty Web Shell</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css" rel="stylesheet">
<style>
  html, body { height: 100%; margin: 0; }
  body { display: flex; flex-direction: column; background: #fffaf5; }
  #chat-area { flex: 1; overflow-y: auto; padding: 1rem; padding-bottom: 0; }
  #input-bar { position: sticky; bottom: 0; background: #fffaf5; border-top: 1px solid #f0e0d8; padding: 0.75rem 1rem; }
  .msg-user { text-align: right; margin-bottom: 0.5rem; }
  .msg-user .bubble { display: inline-block; background: #f8a5c2; color: #4a3036; padding: 0.5rem 1rem; border-radius: 1rem 1rem 0.25rem 1rem; max-width: 80%; text-align: left; overflow-wrap: break-word; word-break: break-word; overflow: hidden; }
  .msg-agent { margin-bottom: 0.5rem; }
  .msg-agent .bubble { display: inline-block; background: #fff0f5; color: #4a4045; padding: 0.5rem 1rem; border-radius: 1rem 1rem 1rem 0.25rem; max-width: 90%; text-align: left; border: 1px solid #fde2e8; overflow-wrap: break-word; word-break: break-word; overflow: hidden; }
  .msg-agent .bubble pre { white-space: pre-wrap; overflow-x: auto; max-width: 100%; }
  .msg-agent .bubble code { word-break: break-word; }
  .msg-agent .bubble img { max-width: 100%; height: auto; }
  .msg-agent .bubble table { display: block; overflow-x: auto; max-width: 100%; }
  .msg-agent .bubble p:last-child { margin-bottom: 0; }
  .status-text { color: #c4a0a8; font-style: italic; font-size: 0.85rem; padding: 0.25rem 0; }
  details.reasoning-block { margin-bottom: 0.5rem; max-width: 90%; }
  details.reasoning-block summary { color: #a08088; font-size: 0.8rem; cursor: pointer; user-select: none; padding: 0.25rem 0.5rem; border-radius: 0.5rem; background: #f5ece8; display: inline-block; }
  details.reasoning-block summary:hover { background: #f0e4e0; }
  details.reasoning-block .reasoning-content { color: #8a7078; font-size: 0.85rem; font-style: italic; padding: 0.5rem 0.75rem; border-left: 3px solid #f0d6d0; margin-top: 0.25rem; line-height: 1.5; overflow-wrap: break-word; word-break: break-word; }
  #input-area { display: flex; gap: 0.5rem; align-items: center; }
  #input-area textarea { flex: 1; resize: none; background: #fffaf5; color: #4a4045; border: 1px solid #f0d6d0; border-radius: 0.75rem; padding: 0.75rem 1rem; min-height: 3.5rem; max-height: 12rem; }
  #input-area textarea:focus { outline: none; border-color: #f8a5c2; box-shadow: 0 0 0 3px rgba(248,165,194,0.25); }
  #input-area textarea::placeholder { color: #d4b0b8; }
  .btn-icon { width: 2.6rem; height: 2.6rem; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  #pause-btn { background: #f0d0d0; border-color: #f0d0d0; color: #7a6068; }
  #pause-btn:hover { background: #e8c0c0; border-color: #e8c0c0; }
  #send-btn { background: #f8a5c2; border-color: #f8a5c2; color: #fff; }
  #send-btn:hover { background: #f08fb0; border-color: #f08fb0; }
  #status-bar { min-height: 1.5rem; }
  .scroll-anchor { height: 1px; }
</style>
</head>
<body>
<div id="chat-area" class="pb-2">
  <div id="messages"></div>
  <div id="status-bar" class="status-text"></div>
  <div class="scroll-anchor"></div>
</div>
<div id="input-bar">
  <div id="input-area">
    <textarea id="msg-input" class="form-control" rows="1" placeholder="输入消息..."></textarea>
    <button id="send-btn" class="btn btn-icon rounded-circle" title="发送"><i class="bi bi-send-fill"></i></button>
    <button id="pause-btn" class="btn btn-icon rounded-circle" title="暂停"><i class="bi bi-pause-fill"></i></button>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js"></script>
<script>
(function() {
  const WS_PORT = location.port || '80';
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.hostname + ':' + WS_PORT);
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
    setStatus('已连接');
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
    setStatus('连接断开');
  };

  function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;
    msgInput.value = '';
    msgInput.style.height = 'auto';
    ws.send(JSON.stringify({ type: 'input', text: text }));
  }

  function sendInterrupt() {
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
