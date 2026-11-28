// ============================================================
// Purpose: shared API configuration and DOM/string helpers; loaded before page scripts.
// Requires: window and document; provides: window.APP_CONFIG and window.APP_UTILS.
// ============================================================

// 1. Environment-specific API Configuration
window.APP_CONFIG = (() => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;

  let apiBaseUrl = '';

  // Local development fallback
  if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1') {
    apiBaseUrl = 'http://localhost:3000/api';
  } else if (hostname.includes('github.io')) {
    // 🌟 production URL for GitHub Pages - easily swap this with your live Render/Railway URL!
    apiBaseUrl = 'https://YOUR-BACKEND-SERVICE.onrender.com/api';
  } else {
    // Default dynamic co-located hostname (Kubernetes, Single Domain hosting)
    const port = window.location.port ? ':' + window.location.port : '';
    apiBaseUrl = `${protocol}//${hostname}${port}/api`;
  }

  return {
    API_BASE: apiBaseUrl,
  };
})();

// 2. Shared Helper Operations
/** Shared escaping, DOM, and time helpers used by page scripts. */
window.APP_UTILS = {
  /** Resolve an element by its document ID. @param {string} id @returns {HTMLElement|null} */
  getElement(id) {
    return document.getElementById(id);
  },

  /** Escape text before inserting it into popup HTML. @param {*} value @returns {string} */
  escapePopup(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  },

  /**
   * Encodes standard characters to protect dynamic HTML insertions against XSS.
   */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
      '/': '&#x2F;',
      '`': '&#x60;',
      '=': '&#x3D;'
    };
    return String(str).replace(/[&<>"'`=\/]/g, (m) => map[m]);
  },

  /**
   * Standardizes string HH:MM:SS or HH:MM formats to integer minutes (since 12:00 AM).
   */
  timeStringToMinutes(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length < 2) return null;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return null;
    return hours * 60 + minutes;
  }
};
