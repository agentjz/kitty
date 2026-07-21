(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cycle = document.querySelector('[data-agent-cycle]');
  var cycleStepIntervalMs = 2000;
  var cycleSteps = [
    {
      updates: [
        { slot: 'user', label: '用户', text: '猫咪想去窗边晒太阳。' }
      ]
    },
    {
      updates: [
        { slot: 'reasoning', label: '思考', text: '我先看看太阳落在哪里，窗边有没有空地方。', mode: 'append' }
      ]
    },
    {
      updates: [
        { slot: 'tool', label: '工具', text: 'read("窗边.md")' },
        { slot: 'result', label: '结果', text: '下午的太阳落在窗边；书堆占着一半，靠垫在椅子上。' }
      ]
    },
    {
      updates: [
        { slot: 'reasoning', label: '思考', text: '太阳找到了。我再拿一份收拾窗边的做法。', mode: 'append' },
        { slot: 'tool', label: '工具', text: 'skill_load("窗边晒太阳")' },
        { slot: 'result', label: '结果', text: '先腾出太阳地，再放好靠垫，最后让猫咪自己过去。' }
      ]
    },
    {
      updates: [
        { slot: 'result', label: '记忆', text: '窗边有太阳，书堆要挪开，靠垫在椅子上。' }
      ]
    },
    {
      updates: [
        { slot: 'reasoning', label: '思考', text: '靠垫晒一晒就会暖起来，我先把窗边收拾好。', mode: 'append' },
        { slot: 'tool', label: '工具', text: 'background_run("晒靠垫 10 分钟")' },
        { slot: 'background', label: '后台', text: '靠垫正在晒太阳。' }
      ]
    },
    {
      updates: [
        { slot: 'steer', label: '追加要求', text: '猫咪喜欢靠窗左边。' },
        { slot: 'reasoning', label: '思考', text: '新要求已经进来。左边的太阳地留给猫咪。', mode: 'append' },
        { slot: 'plan', label: '计划', text: '[>] 挪开书堆\n[ ] 把暖靠垫放到左边\n[ ] 猫咪去晒太阳' }
      ]
    },
    {
      updates: [
        { slot: 'plan', label: '计划', text: '[x] 书堆已经挪开\n[x] 暖靠垫已经放到左边\n[x] 猫咪正在晒太阳' },
        { slot: 'assistant', label: 'Kitty', text: '这里很好。猫咪要晒太阳了。' }
      ]
    }
  ];
  var currentStep = reduceMotion ? cycleSteps.length - 1 : 0;
  var timer;
  var lineTimers = [];
  var streamVersion = 0;
  var streamComplete = true;
  var visible = false;
  var playing = false;

  function clearLineTimers() {
    streamVersion += 1;
    lineTimers.forEach(function (lineTimer) { window.clearTimeout(lineTimer); });
    lineTimers = [];
  }

  function createSnapshot(stepLimit) {
    var snapshot = {};
    for (var stepIndex = 0; stepIndex < stepLimit; stepIndex += 1) {
      cycleSteps[stepIndex].updates.forEach(function (update) {
        applySnapshotUpdate(snapshot, update);
      });
    }
    return snapshot;
  }

  function applySnapshotUpdate(snapshot, update) {
    var previous = snapshot[update.slot];
    var prefix = update.mode === 'append' && previous && previous.text ? previous.text + '\n' : '';
    snapshot[update.slot] = {
      label: update.label,
      text: prefix + update.text
    };
  }

  function renderSnapshot(snapshot) {
    var stream = document.getElementById('cycle-stream');
    stream.querySelectorAll('[data-cycle-slot]').forEach(function (slot) {
      var fact = snapshot[slot.getAttribute('data-cycle-slot')];
      var label = slot.querySelector('[data-cycle-label]');
      var content = slot.querySelector('[data-cycle-content]');
      slot.hidden = false;
      slot.classList.toggle('is-empty', !fact);
      slot.setAttribute('aria-hidden', fact ? 'false' : 'true');
      slot.classList.remove('is-streaming');
      if (!fact) {
        if (content) content.textContent = '';
        return;
      }
      if (label) label.textContent = fact.label;
      if (content) content.textContent = fact.text;
    });
    stream.scrollTop = stream.scrollHeight;
  }

  function applyUpdates(updates, snapshot) {
    updates.forEach(function (update) {
      applySnapshotUpdate(snapshot, update);
    });
    renderSnapshot(snapshot);
  }

  function animateUpdates(updates, snapshot, updateIndex, version, onComplete) {
    if (version !== streamVersion) return;
    if (updateIndex >= updates.length) {
      onComplete();
      return;
    }

    var stream = document.getElementById('cycle-stream');
    var update = updates[updateIndex];
    var slot = stream.querySelector('[data-cycle-slot="' + update.slot + '"]');
    var label = slot && slot.querySelector('[data-cycle-label]');
    var content = slot && slot.querySelector('[data-cycle-content]');
    var previous = snapshot[update.slot];
    var prefix = update.mode === 'append' && previous && previous.text ? previous.text + '\n' : '';
    var characters = Array.from(update.text);
    var offset = 0;

    if (!slot || !content) {
      applySnapshotUpdate(snapshot, update);
      animateUpdates(updates, snapshot, updateIndex + 1, version, onComplete);
      return;
    }

    slot.hidden = false;
    slot.classList.remove('is-empty');
    slot.setAttribute('aria-hidden', 'false');
    slot.classList.add('is-streaming');
    if (label) label.textContent = update.label;
    content.textContent = prefix;
    stream.scrollTop = stream.scrollHeight;

    var writeNextCharacter = function () {
      if (version !== streamVersion) return;
      offset += 1;
      content.textContent = prefix + characters.slice(0, offset).join('');
      stream.scrollTop = stream.scrollHeight;
      if (offset < characters.length) {
        lineTimers.push(window.setTimeout(writeNextCharacter, 24));
        return;
      }
      slot.classList.remove('is-streaming');
      applySnapshotUpdate(snapshot, update);
      lineTimers.push(window.setTimeout(function () {
        animateUpdates(updates, snapshot, updateIndex + 1, version, onComplete);
      }, 110));
    };

    if (characters.length === 0) {
      applySnapshotUpdate(snapshot, update);
      animateUpdates(updates, snapshot, updateIndex + 1, version, onComplete);
    } else {
      writeNextCharacter();
    }
  }

  function renderCycle(options) {
    if (!cycle) return;
    var stream = document.getElementById('cycle-stream');
    var animateCurrent = Boolean(options && options.animateCurrent);
    clearCycleTimer();
    clearLineTimers();
    streamComplete = false;
    stream.setAttribute('aria-busy', 'true');
    setCopyReady(false);
    cycle.setAttribute('data-step', String(currentStep));
    document.getElementById('cycle-count').textContent = String(currentStep + 1) + ' / ' + String(cycleSteps.length);
    var stepIndex = currentStep;
    var snapshot = createSnapshot(stepIndex);
    var version = streamVersion;
    renderSnapshot(snapshot);

    var finishCurrentStep = function () {
      if (version !== streamVersion) return;
      streamComplete = true;
      stream.setAttribute('aria-busy', 'false');
      setCopyReady(true);
      if (playing) scheduleCycle(cycleStepIntervalMs);
    };

    if (!animateCurrent || reduceMotion) {
      applyUpdates(cycleSteps[stepIndex].updates, snapshot);
      finishCurrentStep();
    } else {
      animateUpdates(cycleSteps[stepIndex].updates, snapshot, 0, version, finishCurrentStep);
    }

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
      var text = Array.from(stream.querySelectorAll('[data-cycle-slot]:not(.is-empty)')).map(function (slot) {
        var role = slot.querySelector('[data-cycle-label]');
        var content = slot.querySelector('[data-cycle-content]');
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

  document.querySelectorAll('[data-copy], [data-copy-target]').forEach(function (button) {
    var defaultLabel = button.getAttribute('aria-label') || '复制命令';
    var defaultTitle = button.getAttribute('title') || defaultLabel;
    button.addEventListener('click', function () {
      var value = button.getAttribute('data-copy');
      var targetSelector = button.getAttribute('data-copy-target');
      if (!value && targetSelector) {
        var target = document.querySelector(targetSelector);
        value = target ? target.textContent.trim() : '';
      }
      if (!value || !navigator.clipboard) return;

      navigator.clipboard.writeText(value).then(function () {
        var icon = button.querySelector('i');
        button.setAttribute('aria-label', '已复制');
        button.setAttribute('title', '已复制');
        if (icon) icon.className = 'bi bi-check2';

        window.setTimeout(function () {
          button.setAttribute('aria-label', defaultLabel);
          button.setAttribute('title', defaultTitle);
          if (icon) icon.className = 'bi bi-clipboard';
        }, 1600);
      }).catch(function () {});
    });
  });
})();
