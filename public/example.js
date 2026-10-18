(() => {
  'use strict';

  const STORAGE_KEY = 'novaProxy.preferences.v2';
  const MAX_HISTORY = 25;
  const MAX_BOOKMARKS = 50;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const urlInput = $('#urlInput');
  const addressForm = $('#addressForm');
  const searchButton = $('#searchButton');
  const clearButton = $('#clearButton');
  const bookmarkButton = $('#bookmarkButton');
  const iframeWindow = $('#iframeWindow');
  const browserMain = $('.browser-main');
  const homeView = $('#homeView');
  const browserView = $('#browserView');
  const proxyStatus = $('#proxyStatus');
  const statusMessage = $('#statusMessage');
  const currentHost = $('#currentHost');
  const pageCaption = $('#pageCaption');
  const searchEngine = $('#searchEngine');
  const toast = $('#toast');

  const defaultState = { theme: 'dark', searchEngine: 'google', bookmarks: [], history: [] };
  let state = loadState();
  let activeUrl = '';
  let toastTimeout = 0;
  let titleUpdateTimeout = 0;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return { ...defaultState, bookmarks: [], history: [] };
      return {
        theme: saved.theme === 'light' ? 'light' : 'dark',
        searchEngine: ['google', 'duckduckgo', 'bing'].includes(saved.searchEngine) ? saved.searchEngine : 'google',
        bookmarks: Array.isArray(saved.bookmarks) ? saved.bookmarks.filter(validSavedPage).slice(0, MAX_BOOKMARKS) : [],
        history: Array.isArray(saved.history) ? saved.history.filter(validSavedPage).slice(0, MAX_HISTORY) : []
      };
    } catch (_) {
      return { ...defaultState, bookmarks: [], history: [] };
    }
  }

  function validSavedPage(page) {
    if (!page || typeof page.url !== 'string') return false;
    try {
      const parsed = new URL(page.url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch (_) {
      return false;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      showToast('Could not save preferences in this browser.');
    }
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function shortHost(value) {
    try {
      return new URL(value).hostname.replace(/^www\./i, '');
    } catch (_) {
      return value || 'Web page';
    }
  }

  function displayTitle(page) {
    return page.title || shortHost(page.url);
  }

  function faviconLetter(page) {
    const host = shortHost(page.url);
    return (host.replace(/[^a-z0-9]/ig, '').charAt(0) || 'W').toUpperCase();
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function setStatus(message, active = false) {
    statusMessage.textContent = message;
    proxyStatus.textContent = active ? 'Browsing' : 'Proxy ready';
  }

  function applyTheme() {
    document.body.dataset.theme = state.theme;
    const light = state.theme === 'light';
    $('#themeButton').textContent = light ? '☾' : '☼';
    $('#themeButton').setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
    $('#themeButton').title = light ? 'Switch to dark theme' : 'Switch to light theme';
    const metaTheme = $('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = light ? '#eef4f8' : '#101b2a';
  }

  function updateBookmarkButton() {
    const saved = !!activeUrl && state.bookmarks.some((page) => page.url === activeUrl);
    bookmarkButton.classList.toggle('is-saved', saved);
    bookmarkButton.textContent = saved ? '★' : '☆';
    bookmarkButton.setAttribute('aria-pressed', String(saved));
    bookmarkButton.title = saved ? 'Remove bookmark' : 'Bookmark this page';
    bookmarkButton.setAttribute('aria-label', bookmarkButton.title);
  }

  function renderSavedList(target, pages, type) {
    if (!pages.length) {
      target.innerHTML = '<p class="sidebar-empty">' +
        (type === 'bookmark' ? 'Pages you save will appear here.' : 'Your recent pages will appear here.') +
        '</p>';
      return;
    }
    target.innerHTML = pages.map((page, index) => {
      const host = shortHost(page.url);
      const subline = type === 'history' && page.visitedAt
        ? new Date(page.visitedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : host;
      return '<div class="saved-link" data-saved-item="' + escapeHTML(type) + '">' +
        '<button class="saved-link-open" type="button" data-action="open-saved" data-url="' + escapeHTML(page.url) + '" title="' + escapeHTML(page.url) + '">' +
          '<span class="saved-favicon" aria-hidden="true">' + escapeHTML(faviconLetter(page)) + '</span>' +
          '<span class="saved-link-copy"><strong>' + escapeHTML(displayTitle(page)) + '</strong><small>' + escapeHTML(subline) + '</small></span>' +
        '</button>' +
        (type === 'bookmark'
          ? '<button class="remove-saved" type="button" data-action="remove-bookmark" data-url="' + escapeHTML(page.url) + '" title="Remove bookmark" aria-label="Remove bookmark">×</button>'
          : '') +
        '</div>';
    }).join('');
  }

  function renderHomeHistory() {
    const target = $('#homeHistory');
    if (!state.history.length) {
      target.innerHTML = '<div class="home-empty"><span>↻</span><div><strong>No pages yet</strong><small>Your recent pages will show up here after you browse.</small></div></div>';
      return;
    }
    target.innerHTML = state.history.slice(0, 4).map((page) =>
      '<button class="history-card" type="button" data-action="open-saved" data-url="' + escapeHTML(page.url) + '" title="' + escapeHTML(page.url) + '">' +
        '<span class="history-badge" aria-hidden="true">' + escapeHTML(faviconLetter(page)) + '</span>' +
        '<span class="history-copy"><strong>' + escapeHTML(displayTitle(page)) + '</strong><small>' + escapeHTML(shortHost(page.url)) + '</small></span>' +
        '<span class="card-arrow" aria-hidden="true">↗</span>' +
      '</button>'
    ).join('');
  }

  function renderSavedPages() {
    renderSavedList($('#bookmarkList'), state.bookmarks, 'bookmark');
    renderSavedList($('#historyList'), state.history.slice(0, 12), 'history');
    renderHomeHistory();
    updateBookmarkButton();
  }

  function showHome() {
    activeUrl = '';
    browserMain.classList.remove('has-page');
    browserView.setAttribute('aria-hidden', 'true');
    homeView.removeAttribute('aria-hidden');
    iframeWindow.removeAttribute('src');
    pageCaption.textContent = 'Current page';
    currentHost.textContent = 'LOCAL SESSION';
    urlInput.value = '';
    updateBookmarkButton();
    setStatus('Ready for a new destination', false);
    urlInput.focus({ preventScroll: true });
  }

  function resolveDestination(rawInput) {
    const value = String(rawInput || '').trim();
    if (!value) return null;

    const appearsToBeAddress =
      /^https?:\/\//i.test(value) ||
      /^(localhost(?::\d+)?|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?(?:[/?#].*)?$/i.test(value) ||
      /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(value);

    if (appearsToBeAddress) {
      try {
        const parsed = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
      } catch (_) {
        // Invalid address-shaped input falls back to a search.
      }
    }

    const query = encodeURIComponent(value);
    const engines = {
      google: 'https://www.google.com/search?q=' + query,
      duckduckgo: 'https://duckduckgo.com/?q=' + query,
      bing: 'https://www.bing.com/search?q=' + query
    };
    return engines[state.searchEngine] || engines.google;
  }

  function navigate(rawInput, options = {}) {
    const destination = resolveDestination(rawInput);
    if (!destination) {
      urlInput.focus();
      return;
    }
    let uvConfig;
    try { uvConfig = __uv$config; } catch (_) { uvConfig = null; }
    if (!uvConfig || typeof uvConfig.encodeUrl !== 'function' || !uvConfig.prefix) {
      showToast('The proxy client has not loaded yet. Refresh and try again.');
      setStatus('Proxy client unavailable', false);
      return;
    }

    activeUrl = destination;
    urlInput.value = destination;
    currentHost.textContent = shortHost(destination).toUpperCase();
    pageCaption.textContent = shortHost(destination);
    browserMain.classList.add('has-page');
    homeView.setAttribute('aria-hidden', 'true');
    browserView.removeAttribute('aria-hidden');
    setStatus('Opening ' + shortHost(destination) + '…', true);

    try {
      iframeWindow.src = uvConfig.prefix + uvConfig.encodeUrl(destination);
    } catch (error) {
      setStatus('Could not open this destination', false);
      showToast('The proxy could not open that address.');
      return;
    }

    addHistoryEntry(destination);
    renderSavedPages();
    if (!options.fromSaved) urlInput.blur();
  }

  function addHistoryEntry(url) {
    const page = {
      url,
      title: shortHost(url),
      visitedAt: new Date().toISOString()
    };
    state.history = [page, ...state.history.filter((item) => item.url !== url)].slice(0, MAX_HISTORY);
    saveState();
  }

  function toggleBookmark() {
    if (!activeUrl) {
      showToast('Open a page before bookmarking it.');
      return;
    }
    const index = state.bookmarks.findIndex((page) => page.url === activeUrl);
    if (index >= 0) {
      state.bookmarks.splice(index, 1);
      showToast('Bookmark removed.');
    } else {
      if (state.bookmarks.length >= MAX_BOOKMARKS) state.bookmarks.pop();
      let title = shortHost(activeUrl);
      try {
        const frameTitle = iframeWindow.contentDocument && iframeWindow.contentDocument.title;
        if (frameTitle && frameTitle.trim()) title = frameTitle.trim().slice(0, 90);
      } catch (_) {
        // Some proxied sites disallow reading their document title.
      }
      state.bookmarks.unshift({ url: activeUrl, title, addedAt: new Date().toISOString() });
      showToast('Page bookmarked.');
    }
    saveState();
    renderSavedPages();
  }

  function handleSavedAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const url = button.dataset.url;
    if (action === 'open-saved' && url) navigate(url, { fromSaved: true });
    if (action === 'remove-bookmark' && url) {
      state.bookmarks = state.bookmarks.filter((page) => page.url !== url);
      saveState();
      renderSavedPages();
      showToast('Bookmark removed.');
    }
  }

  addressForm.addEventListener('submit', (event) => {
    event.preventDefault();
    navigate(urlInput.value);
  });

  clearButton.addEventListener('click', () => {
    urlInput.value = '';
    urlInput.focus();
  });

  $('#brandHome').addEventListener('click', (event) => {
    event.preventDefault();
    showHome();
  });
  $('#homeButton').addEventListener('click', showHome);
  $('#openHomeFromFrame').addEventListener('click', showHome);

  $('#backButton').addEventListener('click', () => {
    if (!activeUrl) return showToast('There is no page to go back to yet.');
    try {
      iframeWindow.contentWindow.history.back();
      setStatus('Going back…', true);
    } catch (_) {
      showToast('This page does not allow browser history controls.');
    }
  });

  $('#forwardButton').addEventListener('click', () => {
    if (!activeUrl) return showToast('There is no page to go forward to yet.');
    try {
      iframeWindow.contentWindow.history.forward();
      setStatus('Going forward…', true);
    } catch (_) {
      showToast('This page does not allow browser history controls.');
    }
  });

  $('#reloadButton').addEventListener('click', () => {
    if (!activeUrl) return showToast('Open a page before reloading.');
    setStatus('Reloading ' + shortHost(activeUrl) + '…', true);
    try {
      iframeWindow.contentWindow.location.reload();
    } catch (_) {
      iframeWindow.src = iframeWindow.src;
    }
  });

  bookmarkButton.addEventListener('click', toggleBookmark);

  $$('[data-url]').forEach((button) => {
    button.addEventListener('click', () => navigate(button.dataset.url));
  });

  $('#bookmarkList').addEventListener('click', handleSavedAction);
  $('#historyList').addEventListener('click', handleSavedAction);
  $('#homeHistory').addEventListener('click', handleSavedAction);

  $('#clearBookmarksButton').addEventListener('click', () => {
    if (!state.bookmarks.length) return showToast('There are no bookmarks to clear.');
    if (!window.confirm('Clear all saved bookmarks from this browser?')) return;
    state.bookmarks = [];
    saveState();
    renderSavedPages();
    showToast('Bookmarks cleared.');
  });

  $('#clearHistoryButton').addEventListener('click', () => {
    if (!state.history.length) return showToast('There is no recent history to clear.');
    if (!window.confirm('Clear recent browsing history saved by Nova Proxy on this browser?')) return;
    state.history = [];
    saveState();
    renderSavedPages();
    showToast('Recent history cleared.');
  });

  $('#viewHistoryButton').addEventListener('click', () => {
    const section = $('.history-section');
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    showToast('Your recent pages are in the sidebar.');
  });

  $('#themeButton').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    saveState();
    applyTheme();
  });

  searchEngine.value = state.searchEngine;
  searchEngine.addEventListener('change', () => {
    state.searchEngine = ['google', 'duckduckgo', 'bing'].includes(searchEngine.value) ? searchEngine.value : 'google';
    saveState();
    showToast('Search engine set to ' + searchEngine.options[searchEngine.selectedIndex].text + '.');
  });

  $('#fullscreenButton').addEventListener('click', async () => {
    if (!activeUrl) return showToast('Open a page before entering fullscreen.');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await browserMain.requestFullscreen();
    } catch (_) {
      showToast('Fullscreen is not available in this browser.');
    }
  });

  iframeWindow.addEventListener('load', () => {
    if (!activeUrl) return;
    setStatus('Page frame loaded · ' + shortHost(activeUrl), true);
    window.clearTimeout(titleUpdateTimeout);
    titleUpdateTimeout = window.setTimeout(() => {
      try {
        const title = iframeWindow.contentDocument && iframeWindow.contentDocument.title;
        if (title && title.trim()) {
          const found = state.history.find((page) => page.url === activeUrl);
          if (found) {
            found.title = title.trim().slice(0, 90);
            saveState();
            renderSavedPages();
          }
          pageCaption.textContent = title.trim();
        }
      } catch (_) {
        // Keep the hostname if a page does not expose its title.
      }
    }, 350);
  });

  window.addEventListener('online', () => {
    if (!activeUrl) setStatus('Browser reports an internet connection', false);
  });
  window.addEventListener('offline', () => setStatus('Browser reports no internet connection', false));

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
      event.preventDefault();
      urlInput.focus();
      urlInput.select();
    }
    if (event.key === 'Escape' && document.activeElement === urlInput) {
      urlInput.value = '';
      urlInput.blur();
    }
  });

  applyTheme();
  renderSavedPages();
  setStatus('Ready for a new destination', false);
})();
