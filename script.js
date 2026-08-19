// script.js — extracted interactive behavior from original index.html
// Provides: toggleCard, setTheme, setMode, clearSearch, basic nav switching, FAQ toggles
(function () {
  'use strict';

  function toggleCard(card) {
    if (!card) return;
    card.classList.toggle('expanded');
  }

  function onCardClick(e) {
    // allow clicks on the card to toggle unless clicking a link or button
    let el = e.target;
    while (el && el !== this) {
      if (el.tagName === 'A' || el.tagName === 'BUTTON') return;
      el = el.parentNode;
    }
    toggleCard(this);
  }

  function initCards() {
    document.querySelectorAll('.card.expandable').forEach(function (card) {
      card.addEventListener('click', onCardClick);
    });
  }

  function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    document.getElementById('themeLight').classList.toggle('active', theme === 'light');
    document.getElementById('themeDark').classList.toggle('active', theme === 'dark');
  }

  function setMode(mode) {
    document.body.setAttribute('data-mode', mode);
    document.getElementById('modeDefault').classList.toggle('active', mode === 'default');
    document.getElementById('modeSimple').classList.toggle('active', mode === 'simple');
  }

  function clearSearch() {
    var input = document.getElementById('globalSearch');
    input.value = '';
    document.getElementById('searchClear').classList.remove('show');
    document.getElementById('searchPanel').classList.remove('open');
  }

  function initSearch() {
    var input = document.getElementById('globalSearch');
    var clear = document.getElementById('searchClear');
    var panel = document.getElementById('searchPanel');

    input.addEventListener('input', function () {
      if (input.value.trim()) {
        clear.classList.add('show');
        panel.classList.add('open');
        panel.innerHTML = '<div class="search-tip">搜索为演示：页面内搜索未实现完整索引。</div>';
      } else {
        clear.classList.remove('show');
        panel.classList.remove('open');
      }
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') clearSearch();
    });

    clear.addEventListener('click', clearSearch);
  }

  function initNavTabs() {
    var tabs = document.querySelectorAll('.nav-tab');
    var pages = document.querySelectorAll('.page-section');
    function activate(tab) {
      tabs.forEach(function (t) { t.classList.toggle('active', t === tab); });
      var page = tab.dataset.page;
      pages.forEach(function (p) { p.classList.toggle('active', p.id === 'page-' + page); });
      // update URL hash
      history.replaceState(null, '', '#'+page);
    }
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { activate(tab); });
    });
    // activate tab by hash
    var hash = location.hash.replace('#','') || 'characters';
    var startTab = Array.from(tabs).find(t => t.dataset.page === hash) || tabs[0];
    if (startTab) activate(startTab);
  }

  function initFAQ() {
    document.querySelectorAll('.faq-question').forEach(function (q) {
      q.addEventListener('click', function () {
        var item = q.parentElement;
        item.classList.toggle('open');
        var ans = item.querySelector('.faq-answer');
        if (ans) ans.classList.toggle('open');
      });
    });
  }

  // Expose theme/mode setters to global so header buttons (inline onclick) still work
  window.toggleCard = toggleCard;
  window.setTheme = setTheme;
  window.setMode = setMode;
  window.clearSearch = clearSearch;

  document.addEventListener('DOMContentLoaded', function () {
    initCards();
    initSearch();
    initNavTabs();
    initFAQ();
    // apply defaults
    setTheme(document.body.getAttribute('data-theme') || 'light');
    setMode(document.body.getAttribute('data-mode') || 'default');
  });
})();
