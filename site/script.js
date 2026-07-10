(function () {
  'use strict';

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

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var nodes = document.querySelectorAll('.reveal');
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  nodes.forEach(function (node) {
    observer.observe(node);
  });
})();
