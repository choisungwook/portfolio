/**
 * Prism.js syntax highlighting bootstrap
 * Downloads Prism from CDN and applies highlighting to code blocks.
 * This approach avoids bundling Prism.js into the theme (smaller theme zip).
 */
(function () {
  'use strict';

  // Language mapping (WordPress code block class to Prism language)
  var LANG_MAP = {
    'language-hcl': 'hcl',
    'language-terraform': 'hcl',
    'language-tf': 'hcl',
    'language-py': 'python',
    'language-python': 'python',
    'language-sh': 'bash',
    'language-bash': 'bash',
    'language-shell': 'bash',
    'language-js': 'javascript',
    'language-javascript': 'javascript',
    'language-ts': 'typescript',
    'language-typescript': 'typescript',
    'language-json': 'json',
    'language-yaml': 'yaml',
    'language-yml': 'yaml',
    'language-go': 'go',
    'language-golang': 'go',
    'language-docker': 'docker',
    'language-dockerfile': 'docker',
    'language-sql': 'sql',
    'language-ini': 'ini',
    'language-toml': 'toml',
    'language-css': 'css',
    'language-html': 'markup',
    'language-xml': 'markup',
    'language-java': 'java',
    'language-rust': 'rust',
    'language-php': 'php',
  };

  var codeBlocks = document.querySelectorAll('pre code, .post-body pre > code');
  if (codeBlocks.length === 0) return;

  // Detect languages needed
  var languages = new Set();
  codeBlocks.forEach(function (code) {
    var pre = code.parentElement;
    var lang = null;

    // Check code element classes
    code.classList.forEach(function (cls) {
      if (LANG_MAP[cls]) {
        lang = LANG_MAP[cls];
      }
    });

    // Check pre data-language attribute (WordPress block editor)
    if (!lang && pre.dataset.language) {
      var mapped = LANG_MAP['language-' + pre.dataset.language.toLowerCase()];
      lang = mapped || pre.dataset.language.toLowerCase();
    }

    if (lang) {
      languages.add(lang);
      code.className = 'language-' + lang;
    }
  });

  if (languages.size === 0) {
    languages.add('markup');
  }

  // Load Prism CSS
  var cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = 'https://cdn.jsdelivr.net/npm/prismjs@1/themes/prism-tomorrow.min.css';
  document.head.appendChild(cssLink);

  // Load Prism core + languages
  var langList = Array.from(languages).join('+');
  var script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/prismjs@1/components/prism-core.min.js';
  script.onload = function () {
    var autoloader = document.createElement('script');
    autoloader.src = 'https://cdn.jsdelivr.net/npm/prismjs@1/plugins/autoloader/prism-autoloader.min.js';
    autoloader.onload = function () {
      if (window.Prism) {
        Prism.highlightAll();
      }
    };
    document.head.appendChild(autoloader);
  };
  document.head.appendChild(script);
})();
