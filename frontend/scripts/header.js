(function () {
  const script = document.currentScript;
  if (script && script.src) {
    const base = script.src.replace(/frontend\/scripts\/header\.js.*$/, '');
    if (!document.querySelector('link[data-schedula-header]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = base + 'frontend/css/header.css';
      link.dataset.schedulaHeader = '';
      document.head.appendChild(link);
    }
  }

  const header = document.querySelector('header.top');
  if (!header) return;
  header.classList.add('app-shell-header');

  const brand = header.querySelector('.brand');
  if (brand && !brand.querySelector('.mark')) {
    const logo = document.createElement('img');
    logo.src = '../assets/logo.png';
    logo.alt = '';
    logo.className = 'mark';
    logo.setAttribute('aria-hidden', 'true');
    brand.prepend(logo);
  }
  const tools = header.querySelector('.tools');
  if (tools) tools.classList.add('header-tools');

  const nav = header.querySelector('.nav');
  if (tools && nav && nav.parentElement === tools) {
    header.insertBefore(nav, tools);
  }

  header.querySelectorAll('.theme-toggle, .key.icon, .header-button').forEach(button => {
    button.classList.add('header-button');
  });

  header.querySelectorAll('.nav a, .nav button').forEach(link => {
    link.classList.add('header-nav-button');
  });

  const nameElement = header.querySelector('#header-username-display');
  const avatarElement = header.querySelector('#avatar');

  function syncAvatar() {
    if (!nameElement || !avatarElement) return;
    const name = nameElement.textContent.trim() || 'User';
    avatarElement.textContent = name.charAt(0).toUpperCase();
  }

  syncAvatar();
  if (nameElement) {
    new MutationObserver(syncAvatar).observe(nameElement, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }
})();
