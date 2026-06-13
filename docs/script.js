/**
 * Kitty — Project Landing Page
 * Loads and renders README.md from GitHub
 */

(function () {
  'use strict';

  const README_RAW_URL =
    'https://raw.githubusercontent.com/jun133/kitty/master/README.md';

  const readmeBody = document.getElementById('readme-body');

  if (!readmeBody) return;

  /**
   * Render raw Markdown string into the content body.
   * Uses the global `marked` library loaded via CDN.
   */
  function renderMarkdown(markdown) {
    if (typeof marked === 'undefined') {
      readmeBody.innerHTML =
        '<p style="color:#be6464;">marked library failed to load. Please refresh the page.</p>';
      return;
    }

    // Configure marked
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    const html = marked.parse(markdown);

    readmeBody.innerHTML = html;

    // Patch all external links to open in new tab
    readmeBody.querySelectorAll('a').forEach(function (link) {
      if (link.hostname !== location.hostname && link.hostname !== '') {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });

    // Smooth anchor links
    readmeBody.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        const id = this.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
  }

  /**
   * Show an error state in the content body.
   */
  function showError(message) {
    readmeBody.innerHTML =
      '<div style="text-align:center;padding:3rem 0;color:#6b7280;">' +
      '<p style="font-size:1.25rem;margin-bottom:0.5rem;">⚠️</p>' +
      '<p>' +
      message +
      '</p>' +
      '<p style="font-size:0.875rem;margin-top:1rem;">' +
      'You can also view the README directly on ' +
      '<a href="https://github.com/jun133/kitty" style="color:#f0a0b0;text-decoration:underline;">GitHub</a>.' +
      '</p>' +
      '</div>';
  }

  /**
   * Fetch the README.md and render it.
   */
  function loadReadme() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', README_RAW_URL, true);

    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        renderMarkdown(xhr.responseText);
      } else {
        showError(
          'Failed to load README (HTTP ' + xhr.status + '). ' +
            'If you are offline, the raw file may not be accessible.'
        );
      }
    };

    xhr.onerror = function () {
      showError(
        'Unable to reach GitHub. ' +
          'If you are viewing this page locally, ' +
          'open it via GitHub Pages for full functionality.'
      );
    };

    xhr.send();
  }

  // Start loading
  loadReadme();
})();
