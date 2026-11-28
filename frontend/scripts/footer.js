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

  const PRIMARY_NAV_ICONS = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/><path d="M8 21v-6h8v6"/>',
    builder: '<rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M8 2v4M16 2v4M3 9h18M8 13h3M13 13h3M8 17h3"/>',
    plotter: '<path d="M4 20V5M4 20h17"/><path d="m7 16 4-5 3 2 5-7"/><circle cx="7" cy="16" r="1"/><circle cx="11" cy="11" r="1"/><circle cx="14" cy="13" r="1"/><circle cx="19" cy="6" r="1"/>',
    teams: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1zM16 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 4 5v1h-4"/>',
  };

  function decoratePrimaryNavLink(link) {
    const href = (link.getAttribute('href') || '').split(/[?#]/, 1)[0];
    const page = href.split('/').pop().replace(/\.html?$/i, '').toLowerCase();
    const iconMarkup = PRIMARY_NAV_ICONS[page];
    if (!iconMarkup || link.querySelector('.primary-nav-icon')) return;

    const label = link.textContent.trim();
    link.replaceChildren();

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'primary-nav-icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    icon.innerHTML = iconMarkup;

    const text = document.createElement('span');
    text.className = 'nav-label';
    text.textContent = label;

    link.append(icon, text);
    link.setAttribute('aria-label', label);
  }

  function loadStylesheet() {
    if (document.querySelector('link[data-site-footer]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = assetBase + 'frontend/css/chrome.css';
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
        <p><strong>Last Updated:</strong> November 2026</p>
        <h4>1. ACCEPTANCE OF TERMS</h4>
        <p>By accessing or using Schedula, you agree to be bound by these Terms and Conditions. If you do not agree, please discontinue use of the service.</p>
        <h4>2. SERVICE SCOPE &amp; SMART SCHEDULING</h4>
        <p>Schedula is a personal and collaborative scheduling platform featuring conflict detection, visual timetable plotting, team coordination, Excel/PNG/PDF import and export, and ML-assisted slot recommendations (SchedulaML). Recommendations are advisory—always review generated or shared schedules before relying on them.</p>
        <h4>3. ACCOUNTS &amp; SECURITY</h4>
        <p>Account registration requires email verification. You are responsible for safeguarding your password, session access, and any activity under your account. Sessions automatically expire after periods of inactivity for your protection.</p>
        <h4>4. TEAM COLLABORATION &amp; SHARED CONTENT</h4>
        <p>When you create or join a team using an invite code, team members and administrators can view shared availability windows, team proposals, and schedule details permitted by your team settings. You are responsible for the accuracy of schedules and files you import or share.</p>
        <h4>5. ACCEPTABLE USE &amp; MODERATION</h4>
        <p>You agree not to misuse the platform, attempt unauthorized access, bypass rate limits or role controls, interfere with service operation, or upload unlawful content. System administrators may monitor operational health, audit logs, and enforce access or retention policies to keep the platform secure.</p>
        <h4>6. DISCLAIMER &amp; LIMITATION OF LIABILITY</h4>
        <p>Schedula is provided &ldquo;as is&rdquo; without warranties of any kind. CDJ Builders is not liable for missed commitments, scheduling conflicts, or data loss resulting from use of the service.</p>
        <h4>7. CHANGES TO TERMS</h4>
        <p>We may update these Terms from time to time. Continued use of Schedula after updates are posted constitutes acceptance of the revised Terms.</p>
        <h4>8. CONTACT</h4>
        <p>Questions about these Terms? Contact <a href="mailto:cdj.builders.dev@gmail.com">cdj.builders.dev@gmail.com</a>.</p>
      `,
    },
    privacy: {
      title: 'Privacy Policy',
      body: `
        <p><strong>Last Updated:</strong> November 2026</p>
        <h4>1. INFORMATION WE COLLECT</h4>
        <p>We collect account details you provide (name, email address, and encrypted password), onboarding and scheduling preferences (preferred time windows, breaks, and tolerance settings), availability blocks, personal and team schedules, team memberships and meeting proposals, and basic operational logs (error diagnostics and audit events) needed to keep the service reliable.</p>
        <h4>2. HOW WE USE YOUR INFORMATION</h4>
        <p>Your data is used to authenticate your account, verify your email, store and export your schedules, detect time conflicts, generate personalized Smart Scheduling recommendations via SchedulaML, and coordinate team availability.</p>
        <h4>3. DATA STORAGE, SECURITY &amp; RETENTION</h4>
        <p>Passwords are protected using strong cryptographic hashing (Blowfish <code>crypt()</code>), API access is guarded by JWT authentication with idle session timeouts, and database queries are parameterized. Operational logs follow automated retention and pruning schedules. While we apply industry-standard safeguards, no system can guarantee absolute security.</p>
        <h4>4. TEAM SHARING &amp; THIRD-PARTY DISCLOSURE</h4>
        <p>We do not sell or rent your personal information. Availability windows and shared schedule details are visible only to members of teams you explicitly join. We may disclose data only if required by law or to protect user and platform safety.</p>
        <h4>5. YOUR CHOICES &amp; ACCOUNT DELETION</h4>
        <p>You can update your profile, preferences, and availability blocks at any time, export your schedules, or permanently delete your account from your Profile settings—which removes your associated personal data.</p>
        <h4>6. POLICY UPDATES</h4>
        <p>We may revise this Privacy Policy periodically. Any updates will appear directly in this modal.</p>
        <h4>7. CONTACT</h4>
        <p>For privacy inquiries, contact <a href="mailto:cdj.builders.dev@gmail.com">cdj.builders.dev@gmail.com</a>.</p>
      `,
    },
    about: {
      title: 'About Us',
      body: `
        <h4>Schedula by CDJ Builders</h4>
        <p>Schedula is a student-first, collaborative scheduling workspace built by <strong>CDJ Builders</strong> (De La Salle University &ndash; Dasmari&ntilde;as: Carmona, Devega, and Jimenez).</p>
        <h4>What You Can Do</h4>
        <ul>
          <li><strong>Build &amp; Detect Conflicts:</strong> Organize weekly blocks with automatic time-overlap checks.</li>
          <li><strong>Smart Scheduling (SchedulaML):</strong> Get ML-powered slot recommendations tailored to your habits, breaks, and availability.</li>
          <li><strong>Plot &amp; Export:</strong> Customize timetable colors, fonts, and modality tags, then export to PNG, PDF, or Excel.</li>
          <li><strong>Coordinate Teams:</strong> Create or join teams via invite codes, compare member availability, and propose or review group meetings.</li>
        </ul>
        <h4>Our Mission</h4>
        <p>We built Schedula to eliminate spreadsheet friction and make personal and team time planning faster, clearer, and less stressful.</p>
        <h4>Get in Touch</h4>
        <p>Have feedback or need support? Reach us at <a href="mailto:cdj.builders.dev@gmail.com">cdj.builders.dev@gmail.com</a>.</p>
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
      if (overlay.dataset.closing === 'true') return;
      overlay.dataset.closing = 'true';
      overlay.classList.add('is-closing');
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 150);
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
    const isHero = document.body.classList.contains('hero-root');
    let footer = document.querySelector('.site-footer');
    if (footer?.dataset.footerReady === 'true') return;
    if (!footer) footer = document.createElement('footer');
    footer.className = 'site-footer ' + (isHero ? 'site-footer--hero' : 'site-footer--static');
    footer.setAttribute('role', 'contentinfo');
    footer.innerHTML = `
      <div class="site-footer-inner">
        <p class="site-footer-copy">
          &copy; CDJ Builders
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
            <span>About Us</span>
          </button>
        </nav>
      </div>
    `;

    const landingCopy = isHero ? document.querySelector('.landing-copy') : null;
    if (!footer.isConnected) (landingCopy || document.body).appendChild(footer);
    footer.dataset.footerReady = 'true';
    footer.setAttribute('aria-busy', 'false');

    if (!isHero) {
      document.body.classList.add('has-site-footer');
    }

    footer.querySelectorAll('[data-footer-modal]').forEach((btn) => {
      btn.addEventListener('click', () => showFooterModal(btn.getAttribute('data-footer-modal')));
    });

  }

  function addAccessibleMobileChrome() {
    const main = document.querySelector('main');
    if (main && !main.id) main.id = 'main-content';
    if (main && !document.querySelector('.skip-link')) {
      const skip = document.createElement('a');
      skip.className = 'skip-link';
      skip.href = `#${main.id}`;
      skip.textContent = 'Skip to main content';
      document.body.prepend(skip);
    }

    const desktopNav = document.querySelector('.app-shell-header .nav');
    if (!desktopNav) return;
    const links = [...desktopNav.querySelectorAll('a[href]')];
    links.forEach(decoratePrimaryNavLink);
    const existingMobileNav = document.querySelector('.mobile-primary-nav');
    if (existingMobileNav) {
      existingMobileNav.querySelectorAll('a[href]').forEach(decoratePrimaryNavLink);
      // A previously rendered mobile bar still needs the body class that
      // enables its fixed layout and the matching content clearance.
      document.body.classList.add('has-mobile-nav');
      return;
    }
    if (links.length < 4) return;
    const mobileNav = document.createElement('nav');
    mobileNav.className = 'mobile-primary-nav';
    mobileNav.setAttribute('aria-label', 'Primary navigation');
    links.forEach((link) => {
      const item = link.cloneNode(true);
      mobileNav.appendChild(item);
    });
    document.body.appendChild(mobileNav);
    document.body.classList.add('has-mobile-nav');
  }

  loadStylesheet();
  addAccessibleMobileChrome();

  // All current pages load this script at the end of body. Inject now so the
  // footer and its layout class exist before the browser's first full paint.
  injectFooter();

  window.showFooterModal = showFooterModal;
})();
