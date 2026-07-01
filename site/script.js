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
})();
