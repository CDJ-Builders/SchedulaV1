/**
 * @file footer.js
 * @description Injects the universal site footer on all pages except admin.
 * Provides Terms, Privacy Policy, and About modals.
 */
(function () {
  if (/\/admin\//i.test(window.location.pathname)) return;

  const script = document.currentScript;
  if (!script || !script.src) return;

  const assetBase = script.src.replace(/frontend\/scripts\/footer\.js.*$/, '');

  function loadStylesheet() {
    if (document.querySelector('link[data-site-footer]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = assetBase + 'frontend/css/footer.css';
    link.setAttribute('data-site-footer', '');
    document.head.appendChild(link);
  }

  const ICONS = {
    email: '<svg class="site-footer-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>',
    terms: '<svg class="site-footer-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
    privacy: '<svg class="site-footer-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>',
    about: '<svg class="site-footer-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  };

  const MODAL_CONTENT = {
    terms: {
      title: 'Terms and Conditions',
      body: `
        <h4>1. ACCEPTANCE</h4>
        <p>By using Schedula, you agree to these Terms and Conditions. If you do not agree, please discontinue use of the service.</p>
        <h4>2. EDUCATIONAL USE</h4>
        <p>Schedula helps people organize personal and team schedules. Availability and shared schedule data may change, so review important plans before relying on them.</p>
        <h4>3. ACCOUNTS</h4>
        <p>You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. Notify us promptly if you suspect unauthorized access.</p>
        <h4>4. ACCEPTABLE USE</h4>
        <p>You agree not to misuse the platform, attempt unauthorized access, interfere with service operation, or use the tool for unlawful purposes.</p>
        <h4>5. DISCLAIMER</h4>
        <p>The service is provided &ldquo;as is&rdquo; without warranties of any kind. CDJ Builders is not liable for missed commitments or scheduling outcomes resulting from use of this tool.</p>
        <h4>6. CHANGES</h4>
        <p>We may update these terms from time to time. Continued use after changes are posted constitutes acceptance of the revised terms.</p>
        <h4>7. CONTACT</h4>
        <p><a href="mailto:cdj.builders.dev@gmail.com">cdj.builders.dev@gmail.com</a>.</p>
      `,
    },
    privacy: {
      title: 'Privacy Policy',
      body: `
        <h4>INFORMATION WE COLLECT</h4>
        <p>We collect information you provide when creating an account, profile preferences, availability, and schedule data you save within the application.</p>
        <h4>HOW WE USE YOUR INFORMATION</h4>
        <p>Your information is used to authenticate your account, store your schedules, personalize your experience, and improve the reliability of the service.</p>
        <h4>DATA STORAGE AND SECURITY</h4>
        <p>We take reasonable measures to protect your data. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.</p>
        <h4>SHARING</h4>
        <p>We do not sell your personal information. We may share data only when required by law or to protect the rights and safety of users and the service.</p>
        <h4>YOUR CHOICES</h4>
        <p>You may update and delete profile information within the app. For data inquiries, contact us at the email address listed in the site footer.</p>
        <h4>UPDATES</h4>
        <p>This Privacy Policy may be updated periodically. Material changes will be reflected on this page when you view the policy from the footer.</p>
        <h4>CONTACT</h4>
        <p><a href="mailto:cdj.builders.dev@gmail.com">cdj.builders.dev@gmail.com</a>.</p>
      `,
    },
    about: {
      title: 'About',
      body: `
        <h4>Schedula</h4>
        <p>Schedula is a focused scheduling workspace by <strong>CDJ Builders</strong>.</p>
        <h4>What you can do</h4>
        <ul>
          <li>Build schedules with conflict detection</li>
          <li>Plot your week visually with the timeline plotter</li>
          <li>Save, restore, and manage multiple schedule versions</li>
        </ul>
        <h4>OUR MISSION</h4>
        <p>We built Schedula to make time planning faster, clearer, and less stressful.</p>
        <h4>GET IN TOUCH</h4>
        <p><a href="mailto:cdj.builders.dev@gmail.com">cdj.builders.dev@gmail.com</a>.</p>
      `,
    },
  };

  function showFooterModal(key) {
    const content = MODAL_CONTENT[key];
    if (!content) return;

    const existing = document.querySelector('.custom-modal-overlay.footer-info-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay footer-info-modal';
    overlay.innerHTML = `
      <div class="custom-modal" role="dialog" aria-modal="true" aria-labelledby="footer-modal-title">
        <div class="custom-modal-title" id="footer-modal-title">${content.title}</div>
        <div class="custom-modal-body">${content.body}</div>
        <div class="custom-modal-actions">
          <button type="button" class="custom-modal-btn primary" id="footer-modal-close">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    const close = () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('#footer-modal-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    document.addEventListener('keydown', function onEsc(ev) {
      if (ev.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onEsc);
      }
    });
  }

  function injectFooter() {
    if (document.querySelector('.site-footer')) return;

    const isHero = document.body.classList.contains('hero-root');
    const footer = document.createElement('footer');
    footer.className = 'site-footer ' + (isHero ? 'site-footer--hero' : 'site-footer--static');
    footer.setAttribute('role', 'contentinfo');
    footer.innerHTML = `
      <div class="site-footer-inner">
        <p class="site-footer-copy">
          &copy; CDJ Builders
          <span class="sfv-inline" id="sfv-inline" aria-label="Deployed versions"></span>
        </p>
        <nav class="site-footer-nav" aria-label="Site footer">
          <a class="site-footer-link" href="mailto:cdj.builders.dev@gmail.com">
            ${ICONS.email}
            <span>cdj.builders.dev@gmail.com</span>
          </a>
          <button type="button" class="site-footer-link" data-footer-modal="terms">
            ${ICONS.terms}
            <span>Terms and Conditions</span>
          </button>
          <button type="button" class="site-footer-link" data-footer-modal="privacy">
            ${ICONS.privacy}
            <span>Privacy Policy</span>
          </button>
          <button type="button" class="site-footer-link" data-footer-modal="about">
            ${ICONS.about}
            <span>About</span>
          </button>
        </nav>
      </div>
    `;

    const landingCopy = isHero ? document.querySelector('.landing-copy') : null;
    (landingCopy || document.body).appendChild(footer);

    if (!isHero) {
      document.body.classList.add('has-site-footer');
    }

    footer.querySelectorAll('[data-footer-modal]').forEach((btn) => {
      btn.addEventListener('click', () => showFooterModal(btn.getAttribute('data-footer-modal')));
    });

    // Fetch version data from /versions.json
    fetch(assetBase + 'versions.json')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const inline = document.getElementById('sfv-inline');
        if (!inline) return;
        const parts = [
          data.frontend ? 'v' + data.frontend : null,
          data.backend ? 'v' + data.backend : null,
          data.postgres ? 'v' + data.postgres : null
        ].filter(Boolean);
        if (parts.length) {
          inline.textContent = parts.join(' · ');
          inline.classList.add('sfv-loaded');
        }
      })
      .catch(() => { /* silent fallback for local dev */ });
  }

  loadStylesheet();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFooter);
  } else {
    injectFooter();
  }

  window.showFooterModal = showFooterModal;
})();
