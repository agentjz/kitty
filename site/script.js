(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cycle = document.querySelector('[data-agent-cycle]');
  var cycleStepIntervalMs = 2000;
  var cycleSteps = [
    {
      entries: [
        { role: '用户', text: '做一盘西红柿炒鸡蛋。', kind: 'user' }
      ]
    },
    {
      entries: [
        { role: '思考', text: '我先读取食材清单，确认现在有哪些材料。', kind: 'thought' }
      ]
    },
    {
      entries: [
        { role: '工具', text: 'read("食材清单.md")', kind: 'tool' },
        { role: '结果', text: '3 个西红柿、4 个鸡蛋；用户喜欢嫩一点的鸡蛋。', kind: 'result' }
      ]
    },
    {
      entries: [
        { role: '思考', text: '材料已经确认。现在需要一份稳定的做法，我来查看匹配的 skill。', kind: 'thought' },
        { role: '工具', text: 'skill_load("西红柿炒鸡蛋")', kind: 'tool' },
        { role: '结果', text: '鸡蛋先炒嫩，番茄炒出汁后，再把鸡蛋倒回锅里。', kind: 'result' }
      ]
    },
    {
      entries: [
        { role: '短期记忆', text: '食材够用；用户喜欢嫩一点的鸡蛋。', kind: 'memory' },
        { role: '长期记忆', text: '先看事实，再做判断，再行动；使用已经加载的熟练做法。', kind: 'memory' }
      ]
    },
    {
      entries: [
        { role: '思考', text: '客人忌口需要读取另一批资料，我派一个独立上下文去确认。', kind: 'thought' },
        { role: '子代理', text: 'subagent.run("确认客人忌口")', kind: 'tool' },
        { role: '返回', text: '独立上下文完成：没有额外忌口。', kind: 'result' }
      ]
    },
    {
      entries: [
        { role: '用户', text: '鸡蛋再嫩一点，少放糖。', kind: 'user' },
        { role: '思考', text: '新偏好已经明确。我先制定计划：炒嫩鸡蛋，炒出番茄汁，再合锅收味。', kind: 'thought' }
      ]
    },
    {
      entries: [
        { role: '执行', text: '现在炒嫩鸡蛋，刚凝固就盛出。第一步已完成 ✓', kind: 'result' },
        { role: '执行', text: '现在把西红柿炒出汁。第二步已完成 ✓', kind: 'result' },
        { role: '执行', text: '现在倒回鸡蛋一起收味。第三步已完成 ✓', kind: 'result' },
        { role: '回答', text: '西红柿炒鸡蛋已经做好了。', kind: 'answer' }
      ]
    }
  ];
  var currentStep = reduceMotion ? cycleSteps.length - 1 : 0;
  var timer;
  var lineTimers = [];
  var streamVersion = 0;
  var streamComplete = true;
  var completedStep = -1;
  var visible = false;
  var playing = false;

  function createStreamLine(entry, content) {
    var line = document.createElement('div');
    var role = document.createElement('span');
    var text = document.createElement('p');
    line.className = 'cycle-stream-line is-' + entry.kind;
    role.textContent = entry.role;
    text.textContent = content === undefined ? entry.text : content;
    line.appendChild(role);
    line.appendChild(text);
    return line;
  }

  function clearLineTimers() {
    streamVersion += 1;
    lineTimers.forEach(function (lineTimer) { window.clearTimeout(lineTimer); });
    lineTimers = [];
  }

  function appendEntries(entries, immediate, stepIndex, onComplete) {
    var stream = document.getElementById('cycle-stream');
    var version = streamVersion;
    if (immediate || reduceMotion) {
      entries.forEach(function (entry) {
        var line = createStreamLine(entry);
        line.setAttribute('data-cycle-stream-step', String(stepIndex));
        stream.appendChild(line);
        stream.scrollTop = stream.scrollHeight;
      });
      if (onComplete) onComplete();
      return;
    }

    var appendEntry = function (entryIndex) {
      if (version !== streamVersion) return;
      if (entryIndex >= entries.length) {
        if (onComplete) onComplete();
        return;
      }

      var entry = entries[entryIndex];
      var characters = Array.from(entry.text);
      var offset = 0;
      var line = createStreamLine(entry, '');
      line.setAttribute('data-cycle-stream-step', String(stepIndex));
      var paragraph = line.querySelector('p');
      stream.appendChild(line);
      stream.scrollTop = stream.scrollHeight;

      var writeNextCharacter = function () {
        if (version !== streamVersion) return;
        offset += 1;
        paragraph.textContent = characters.slice(0, offset).join('');
        stream.scrollTop = stream.scrollHeight;
        if (offset < characters.length) {
          lineTimers.push(window.setTimeout(writeNextCharacter, 24));
          return;
        }
        lineTimers.push(window.setTimeout(function () {
          appendEntry(entryIndex + 1);
        }, 110));
      };

      if (characters.length === 0) appendEntry(entryIndex + 1);
      else writeNextCharacter();
    };

    appendEntry(0);
  }

  function prepareIncrementalStream(stepIndex) {
    var stream = document.getElementById('cycle-stream');
    if (completedStep === -1) {
      stream.replaceChildren();
    } else {
      stream.querySelectorAll('[data-cycle-stream-step]').forEach(function (line) {
        var lineStep = Number(line.getAttribute('data-cycle-stream-step'));
        var isIncompleteLine = lineStep > completedStep;
        var isAfterRewindTarget = stepIndex <= completedStep && lineStep >= stepIndex;
        if (isIncompleteLine || isAfterRewindTarget) {
          line.remove();
        }
      });
      if (stepIndex <= completedStep) completedStep = stepIndex - 1;
    }

    for (var index = completedStep + 1; index < stepIndex; index += 1) {
      appendEntries(cycleSteps[index].entries, true, index);
      completedStep = index;
    }
  }

  function renderCycle(options) {
    if (!cycle) return;
    var stream = document.getElementById('cycle-stream');
    var animateCurrent = Boolean(options && options.animateCurrent);
    clearCycleTimer();
    clearLineTimers();
    streamComplete = false;
    stream.classList.toggle('is-streaming', animateCurrent && !reduceMotion);
    stream.setAttribute('aria-busy', 'true');
    setCopyReady(false);
    cycle.setAttribute('data-step', String(currentStep));
    cycle.classList.remove('is-finished');
    document.getElementById('cycle-count').textContent = String(currentStep + 1) + ' / ' + String(cycleSteps.length);
    var stepIndex = currentStep;
    prepareIncrementalStream(stepIndex);
    appendEntries(cycleSteps[stepIndex].entries, !animateCurrent, stepIndex, function () {
      completedStep = stepIndex;
      streamComplete = true;
      stream.classList.remove('is-streaming');
      stream.setAttribute('aria-busy', 'false');
      setCopyReady(true);
      if (stepIndex === cycleSteps.length - 1) cycle.classList.add('is-finished');
      if (playing) scheduleCycle(cycleStepIntervalMs);
    });

    cycle.querySelectorAll('[data-cycle-step]').forEach(function (node, index) {
      var active = index === currentStep;
      node.classList.toggle('is-active', active);
      node.classList.toggle('is-complete', index < currentStep);
      node.setAttribute('aria-current', active ? 'step' : 'false');
    });
  }

  function clearCycleTimer() {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = undefined;
  }

  function scheduleCycle(delay) {
    clearCycleTimer();
    if (reduceMotion || !visible || !playing || !streamComplete) return;
    timer = window.setTimeout(function () {
      currentStep = (currentStep + 1) % cycleSteps.length;
      renderCycle({ animateCurrent: true });
    }, delay || cycleStepIntervalMs);
  }

  function setCopyReady(ready) {
    var button = cycle && cycle.querySelector('[data-cycle-copy]');
    if (!button) return;
    var icon = button.querySelector('i');
    button.disabled = !ready;
    button.setAttribute('aria-label', ready ? '复制当前输出' : '等待当前输出完成');
    button.setAttribute('title', ready ? '复制当前输出' : '等待输出完成');
    if (icon) icon.className = 'bi bi-clipboard';
  }

  function renderPlayControl() {
    var button = cycle && cycle.querySelector('[data-cycle-play]');
    if (!button) return;
    var label = playing ? '暂停 Agent 循环' : '播放 Agent 循环';
    var icon = button.querySelector('i');
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', playing ? 'true' : 'false');
    button.setAttribute('title', playing ? '暂停' : '播放');
    if (icon) icon.className = playing ? 'bi bi-pause-fill' : 'bi bi-play-fill';
  }

  if (cycle) {
    cycle.querySelectorAll('[data-cycle-step]').forEach(function (node) {
      node.addEventListener('click', function () {
        currentStep = Number(node.getAttribute('data-cycle-step'));
        renderCycle({ animateCurrent: true });
      });
    });

    var playControl = cycle.querySelector('[data-cycle-play]');
    playControl.addEventListener('click', function () {
      playing = !playing;
      renderPlayControl();
      if (playing) scheduleCycle(cycleStepIntervalMs);
      else clearCycleTimer();
    });

    var copyControl = cycle.querySelector('[data-cycle-copy]');
    copyControl.addEventListener('click', function () {
      if (!streamComplete || !navigator.clipboard) return;
      var stream = document.getElementById('cycle-stream');
      var text = Array.from(stream.querySelectorAll('.cycle-stream-line')).map(function (line) {
        var role = line.querySelector('span');
        var content = line.querySelector('p');
        return (role ? role.textContent : '') + '  ' + (content ? content.textContent : '');
      }).join('\n');
      navigator.clipboard.writeText(text).then(function () {
        var icon = copyControl.querySelector('i');
        copyControl.setAttribute('aria-label', '已复制当前输出');
        copyControl.setAttribute('title', '已复制');
        if (icon) icon.className = 'bi bi-check2';
        window.setTimeout(function () {
          if (streamComplete) setCopyReady(true);
        }, 1400);
      }).catch(function () {});
    });

    if (reduceMotion || !('IntersectionObserver' in window)) {
      visible = true;
    } else {
      var cycleObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting;
          if (visible) scheduleCycle(cycleStepIntervalMs);
          else clearCycleTimer();
        });
      }, { threshold: 0.28 });
      cycleObserver.observe(cycle);
    }

    renderCycle({ animateCurrent: false });
    renderPlayControl();
  }

  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var value = button.getAttribute('data-copy');
      if (!value || !navigator.clipboard) return;

      navigator.clipboard.writeText(value).then(function () {
        var icon = button.querySelector('i');
        button.setAttribute('aria-label', '已复制安装命令');
        button.setAttribute('title', '已复制');
        if (icon) icon.className = 'bi bi-check2';

        window.setTimeout(function () {
          button.setAttribute('aria-label', '复制安装命令');
          button.setAttribute('title', '复制安装命令');
          if (icon) icon.className = 'bi bi-clipboard';
        }, 1600);
      }).catch(function () {});
    });
  });
})();
