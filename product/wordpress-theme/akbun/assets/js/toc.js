/**
 * Floating Table of Contents
 * Auto-generates ToC from post headings (h1, h2) with Intersection Observer
 */
(function () {
  'use strict';

  var container = document.querySelector('.floating-toc');
  if (!container) return;

  var postBody = document.querySelector('.post-body');
  if (!postBody) return;

  var headings = postBody.querySelectorAll('h1, h2');
  if (headings.length < 2) return;

  var list = container.querySelector('.floating-toc-list');
  if (!list) return;

  // Build ToC items
  headings.forEach(function (heading, index) {
    if (!heading.id) {
      heading.id = 'toc-heading-' + index;
    }

    var li = document.createElement('li');
    var tag = heading.tagName.toLowerCase();
    li.className = 'toc-item toc-' + tag;

    var a = document.createElement('a');
    a.className = 'toc-link';
    a.href = '#' + heading.id;
    a.textContent = heading.textContent;

    li.appendChild(a);
    list.appendChild(li);
  });

  container.classList.add('visible');

  // Intersection Observer for active link tracking
  var links = list.querySelectorAll('.toc-link');
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          links.forEach(function (link) {
            link.classList.remove('active');
          });
          var activeLink = list.querySelector('a[href="#' + entry.target.id + '"]');
          if (activeLink) {
            activeLink.classList.add('active');
          }
        }
      });
    },
    {
      rootMargin: '-80px 0px -80% 0px',
      threshold: 0,
    }
  );

  headings.forEach(function (heading) {
    observer.observe(heading);
  });
})();
