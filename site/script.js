(function () {
  'use strict';

  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      var target = document.querySelector(link.getAttribute('href'));

      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var value = button.getAttribute('data-copy');

      if (!value || !navigator.clipboard) return;

      navigator.clipboard.writeText(value).then(function () {
        button.setAttribute('aria-label', '已复制安装命令');
        window.setTimeout(function () {
          button.setAttribute('aria-label', '复制安装命令');
        }, 1600);
      }).catch(function () {});
    });
  });

  var historyToggle = document.getElementById('historyToggle');
  var historyPreview = document.getElementById('historyPreview');
  var historyContent = document.getElementById('historyContent');

  if (historyToggle && historyPreview && historyContent) {
    loadHistory(historyPreview, historyContent);

    historyToggle.addEventListener('click', function () {
      var expanded = historyToggle.getAttribute('aria-expanded') === 'true';

      if (expanded) {
        historyContent.hidden = true;
        historyPreview.hidden = false;
        historyToggle.textContent = '展开全部';
        historyToggle.setAttribute('aria-expanded', 'false');
        historyPreview.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      historyContent.hidden = false;
      historyPreview.hidden = true;
      historyToggle.textContent = '收起';
      historyToggle.setAttribute('aria-expanded', 'true');
    });
  }

  function loadHistory(previewNode, contentNode) {
    fetchHistoryText().then(function (markdown) {
      previewNode.textContent = makePreview(markdown, 300);
      contentNode.innerHTML = renderMarkdown(markdown);
    }).catch(function () {
      previewNode.textContent = '开发历史暂不可用。';
      contentNode.innerHTML = '<p>开发历史暂不可用。</p>';
    });
  }

  function fetchHistoryText() {
    var candidates = ['history.md', '../history.md'];

    return candidates.reduce(function (promise, url) {
      return promise.catch(function () {
        return fetch(url, { cache: 'no-store' }).then(function (response) {
          if (!response.ok) throw new Error('history not found');
          return response.text();
        });
      });
    }, Promise.reject(new Error('start')));
  }

  function makePreview(markdown, maxLength) {
    var text = markdown
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/\|/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '……';
  }

  function renderMarkdown(markdown) {
    var lines = markdown.replace(/\r\n/g, '\n').split('\n');
    var html = [];
    var paragraph = [];
    var listItems = [];
    var orderedListItems = [];
    var tableLines = [];
    var codeLines = [];
    var inCodeBlock = false;

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push('<p>' + renderInline(paragraph.join(' ')) + '</p>');
      paragraph = [];
    }

    function flushList() {
      if (!listItems.length) return;
      html.push('<ul>' + listItems.map(function (item) {
        return '<li>' + renderInline(item) + '</li>';
      }).join('') + '</ul>');
      listItems = [];
    }

    function flushOrderedList() {
      if (!orderedListItems.length) return;
      html.push('<ol>' + orderedListItems.map(function (item) {
        return '<li>' + renderInline(item) + '</li>';
      }).join('') + '</ol>');
      orderedListItems = [];
    }

    function flushTable() {
      if (!tableLines.length) return;

      if (tableLines.length < 2 || !isMarkdownTableSeparator(tableLines[1])) {
        paragraph = paragraph.concat(tableLines);
        tableLines = [];
        return;
      }

      var headers = splitMarkdownTableRow(tableLines[0]);
      var rows = tableLines.slice(2).map(splitMarkdownTableRow);
      html.push(
        '<div class="history-table-wrap"><table><thead><tr>'
        + headers.map(function (cell) { return '<th>' + renderInline(cell) + '</th>'; }).join('')
        + '</tr></thead><tbody>'
        + rows.map(function (row) {
          return '<tr>' + row.map(function (cell) { return '<td>' + renderInline(cell) + '</td>'; }).join('') + '</tr>';
        }).join('')
        + '</tbody></table></div>'
      );
      tableLines = [];
    }

    function flushBlocks() {
      flushParagraph();
      flushList();
      flushOrderedList();
      flushTable();
    }

    lines.forEach(function (line) {
      if (line.trim().indexOf('```') === 0) {
        if (inCodeBlock) {
          html.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
          codeLines = [];
          inCodeBlock = false;
          return;
        }

        flushBlocks();
        inCodeBlock = true;
        return;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        return;
      }

      if (!line.trim()) {
        flushBlocks();
        return;
      }

      var heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushBlocks();
        var level = Math.min(heading[1].length + 1, 6);
        html.push('<h' + level + '>' + renderInline(heading[2]) + '</h' + level + '>');
        return;
      }

      var listItem = line.match(/^\s*[-*]\s+(.+)$/);
      if (listItem) {
        flushParagraph();
        flushOrderedList();
        flushTable();
        listItems.push(listItem[1]);
        return;
      }

      var orderedListItem = line.match(/^\s*\d+\.\s+(.+)$/);
      if (orderedListItem) {
        flushParagraph();
        flushList();
        flushTable();
        orderedListItems.push(orderedListItem[1]);
        return;
      }

      if (isPotentialMarkdownTableLine(line)) {
        flushParagraph();
        flushList();
        flushOrderedList();
        tableLines.push(line);
        return;
      }

      flushList();
      flushOrderedList();
      flushTable();
      paragraph.push(line.trim());
    });

    if (inCodeBlock) {
      html.push('<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
    }
    flushBlocks();

    return html.join('');
  }

  function isPotentialMarkdownTableLine(line) {
    var trimmed = line.trim();
    return trimmed.indexOf('|') === 0 && trimmed.lastIndexOf('|') === trimmed.length - 1;
  }

  function isMarkdownTableSeparator(line) {
    return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
  }

  function splitMarkdownTableRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (cell) {
      return cell.trim();
    });
  }

  function renderInline(value) {
    return escapeHtml(value)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_match, label, href) {
        var safeHref = href.indexOf('http') === 0 || href.indexOf('./') === 0 || href.indexOf('../') === 0 ? href : '#';
        return '<a href="' + safeHref + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
      });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
