// Premium Theme Handler for Schedula
// Immediately applied on load to prevent theme flash

(function () {
  const STORAGE_KEY = 'schedula-theme';
  const savedTheme = localStorage.getItem(STORAGE_KEY);

  // Set initial theme (default to dark if not set)
  const initialTheme = savedTheme || 'dark';
  document.documentElement.setAttribute('data-theme', initialTheme);

  // SVG Definitions for Moon and Sun
  const moonSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#2a1245" stroke-width="2" class="theme-icon-svg" style="width: 20px; height: 20px; color: #2a1245;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </svg>
  `;

  const sunSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="#2a1245" stroke-width="2" class="theme-icon-svg" style="width: 20px; height: 20px; color: #2a1245;">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m0 13.5V21M4.22 4.22l1.58 1.58m12.4 12.4l1.58 1.58M3 12h2.25m13.5 0H21M4.22 19.78l1.58-1.58m12.4-12.4l1.58-1.58M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z" />
    </svg>
  `;

  // Function to update all toggle button contents
  function updateToggleButtons(theme) {
    const toggles = document.querySelectorAll('.theme-toggle');
    toggles.forEach(toggle => {
      toggle.innerHTML = theme === 'light' ? moonSvg : sunSvg;
      toggle.querySelectorAll('svg, svg *').forEach(icon => {
        icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke', '#2a1245');
      });
      toggle.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
      toggle.setAttribute('title', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
      toggle.dataset.themeIcon = theme;
    });
  }

  // Toggle Theme Function
  window.toggleTheme = function () {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';

    document.documentElement.classList.add('theme-transitioning');
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    updateToggleButtons(newTheme);
    window.setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 220);
  };

  // Wire up theme toggles when DOM is loaded
  document.addEventListener('DOMContentLoaded', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    updateToggleButtons(currentTheme);

    // Dynamic delegate click event to allow dynamically created headers/buttons to work
    document.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.theme-toggle');
      if (toggleBtn) {
        window.toggleTheme();
      }
    });
  });
})();
