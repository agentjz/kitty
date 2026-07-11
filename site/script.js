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
  var renderedStep = -1;
  var timer;
  var lineTimers = [];
  var visible = false;
  var paused = false;

  function createStreamLine(entry) {
    var line = document.createElement('div');
    var role = document.createElement('span');
    var text = document.createElement('p');
    line.className = 'cycle-stream-line is-' + entry.kind;
    role.textContent = entry.role;
    text.textContent = entry.text;
    line.appendChild(role);
    line.appendChild(text);
    return line;
  }

  function clearLineTimers() {
    lineTimers.forEach(function (lineTimer) { window.clearTimeout(lineTimer); });
    lineTimers = [];
  }

  function appendEntries(entries, immediate, onComplete) {
    var stream = document.getElementById('cycle-stream');
    entries.forEach(function (entry, index) {
      var append = function () {
        stream.appendChild(createStreamLine(entry));
        stream.scrollTop = stream.scrollHeight;
        if (index === entries.length - 1 && onComplete) onComplete();
      };
      if (immediate || reduceMotion) append();
      else lineTimers.push(window.setTimeout(append, index * 230));
    });
  }

  function rebuildStreamThrough(stepIndex) {
    var stream = document.getElementById('cycle-stream');
    clearLineTimers();
    stream.replaceChildren();
    for (var index = 0; index <= stepIndex; index += 1) {
      appendEntries(cycleSteps[index].entries, true);
    }
  }

  function renderCycle() {
    if (!cycle) return;
    cycle.setAttribute('data-step', String(currentStep));
    cycle.classList.remove('is-finished');
    document.getElementById('cycle-count').textContent = String(currentStep + 1) + ' / ' + String(cycleSteps.length);

    if (renderedStep >= 0 && currentStep === renderedStep + 1) {
      appendEntries(cycleSteps[currentStep].entries, false, function () {
        if (currentStep === cycleSteps.length - 1) cycle.classList.add('is-finished');
      });
    } else {
      rebuildStreamThrough(currentStep);
      if (currentStep === cycleSteps.length - 1) {
        lineTimers.push(window.setTimeout(function () {
          cycle.classList.add('is-finished');
        }, reduceMotion ? 0 : 180));
      }
    }
    renderedStep = currentStep;

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
    if (reduceMotion || !visible || paused) return;
    timer = window.setTimeout(function () {
      currentStep = (currentStep + 1) % cycleSteps.length;
      renderCycle();
      scheduleCycle(cycleStepIntervalMs);
    }, delay || cycleStepIntervalMs);
  }

  if (cycle) {
    cycle.querySelectorAll('[data-cycle-step]').forEach(function (node) {
      node.addEventListener('click', function () {
        currentStep = Number(node.getAttribute('data-cycle-step'));
        renderedStep = -1;
        renderCycle();
        scheduleCycle(cycleStepIntervalMs);
      });
    });

    cycle.addEventListener('mouseenter', function () {
      paused = true;
      clearCycleTimer();
    });
    cycle.addEventListener('mouseleave', function () {
      paused = false;
      scheduleCycle(cycleStepIntervalMs);
    });
    cycle.addEventListener('focusin', function () {
      paused = true;
      clearCycleTimer();
    });
    cycle.addEventListener('focusout', function (event) {
      if (cycle.contains(event.relatedTarget)) return;
      paused = false;
      scheduleCycle(cycleStepIntervalMs);
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

    renderCycle();
    scheduleCycle(cycleStepIntervalMs);
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
