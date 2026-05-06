// Runs in the page's MAIN world at document_start.
// Must intercept fetch/XHR before Instagram's own code registers handlers.
(function () {
  const API_PATTERNS = ['/api/v1/', '/api/v2/', '/graphql/query'];

  function isApiUrl(url) {
    try {
      const s = typeof url === 'string' ? url : url?.toString?.() || '';
      return API_PATTERNS.some((p) => s.includes(p));
    } catch (_) {
      return false;
    }
  }

  function dispatch(url, data) {
    window.postMessage({ __igCrawler: true, url: String(url), data }, '*');
  }

  // ── fetch ──────────────────────────────────────────────────────────────────
  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    return _fetch.call(this, input, init).then((response) => {
      if (isApiUrl(url)) {
        response
          .clone()
          .json()
          .then((data) => dispatch(url, data))
          .catch(() => {});
      }
      return response;
    });
  };

  // ── XMLHttpRequest ─────────────────────────────────────────────────────────
  const _XHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new _XHR();
    let _url = '';

    const _open = xhr.open;
    xhr.open = function (method, url, ...rest) {
      _url = url || '';
      return _open.apply(this, [method, url, ...rest]);
    };

    xhr.addEventListener('load', () => {
      if (!isApiUrl(_url)) return;
      try {
        const data = JSON.parse(xhr.responseText);
        dispatch(_url, data);
      } catch (_) {}
    });

    return xhr;
  }
  PatchedXHR.prototype = _XHR.prototype;
  window.XMLHttpRequest = PatchedXHR;
})();
