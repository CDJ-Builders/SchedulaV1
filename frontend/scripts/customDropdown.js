/**
 * customDropdown.js — Schedula Skeuomorphic Dropdown Enhancer
 * Replaces native <select> menus with luxury skeuomorphic dropdown panels
 * while maintaining 100% two-way sync with underlying <select> elements.
 */
(function () {
  'use strict';

  const CHEVRON_SVG = `
    <svg class="custom-dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6"/>
    </svg>`;

  const CHECK_SVG = `
    <svg class="custom-dropdown-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5"/>
    </svg>`;

  function getVariant(select) {
    if (select.classList.contains('team-select') || select.classList.contains('settings-team-select')) {
      return 'variant-key-lavender';
    }
    if (select.classList.contains('schedule-selector')) {
      return 'variant-key-white';
    }
    if (select.classList.contains('events-day-filter')) {
      return 'variant-filter';
    }
    return 'variant-field';
  }

  function enhanceSelect(select) {
    if (!select || select._customDropdownWrap) return;

    // Check if select should be enhanced (builder, teams, settings, filters, form fields)
    const isTarget =
      select.classList.contains('team-select') ||
      select.classList.contains('schedule-selector') ||
      select.classList.contains('events-day-filter') ||
      select.classList.contains('settings-team-select') ||
      select.classList.contains('settings-member-select') ||
      select.closest('.field') ||
      select.hasAttribute('data-custom-dropdown');

    if (!isTarget) return;

    const variant = getVariant(select);

    // Create wrapper
    const wrap = document.createElement('div');
    wrap.className = 'custom-dropdown-wrap';
    if (select.closest('.field') || select.classList.contains('schedule-selector')) {
      wrap.classList.add('block-level');
    }

    // Insert wrapper before select and move select inside
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('custom-dropdown-native');

    // Create custom button trigger
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `custom-dropdown-btn ${variant}`;
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');

    const label = document.createElement('span');
    label.className = 'custom-dropdown-label';
    btn.appendChild(label);
    btn.insertAdjacentHTML('beforeend', CHEVRON_SVG);
    wrap.appendChild(btn);

    // Create floating menu
    const menu = document.createElement('div');
    menu.className = 'custom-dropdown-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    wrap.appendChild(menu);

    select._customDropdownWrap = wrap;
    select._customDropdownBtn = btn;
    select._customDropdownMenu = menu;
    select._customDropdownLabel = label;

    function updateLabel() {
      const selectedOption = select.options[select.selectedIndex];
      label.textContent = selectedOption ? selectedOption.text : '';
      btn.disabled = Boolean(select.disabled);
    }

    select.addEventListener('focus', () => {
      btn.focus();
    });

    // Native change listener (when script modifies select or sets value)
    select.addEventListener('change', () => {
      updateLabel();
      buildOptions();
    });

    // Hook property descriptors to catch programmatic updates in existing scripts
    const originalValueProp = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
    if (originalValueProp) {
      Object.defineProperty(select, 'value', {
        get() {
          return originalValueProp.get.call(this);
        },
        set(val) {
          originalValueProp.set.call(this, val);
          updateLabel();
          buildOptions();
        },
        configurable: true
      });
    }

    const originalIndexProp = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
    if (originalIndexProp) {
      Object.defineProperty(select, 'selectedIndex', {
        get() {
          return originalIndexProp.get.call(this);
        },
        set(idx) {
          originalIndexProp.set.call(this, idx);
          updateLabel();
          buildOptions();
        },
        configurable: true
      });
    }

    const originalDisabledProp = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'disabled');
    if (originalDisabledProp) {
      Object.defineProperty(select, 'disabled', {
        get() {
          return originalDisabledProp.get.call(this);
        },
        set(dis) {
          originalDisabledProp.set.call(this, dis);
          btn.disabled = Boolean(dis);
        },
        configurable: true
      });
    }

    function buildOptions() {
      menu.innerHTML = '';
      Array.from(select.options).forEach((opt, idx) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'custom-dropdown-item';
        item.setAttribute('role', 'option');
        item.dataset.value = opt.value;
        item.dataset.index = idx;

        const isSelected = idx === select.selectedIndex;
        if (isSelected) {
          item.classList.add('is-selected');
          item.setAttribute('aria-selected', 'true');
        }

        const isAction = opt.value === 'new' || opt.text.trim().startsWith('+');
        if (isAction) {
          item.classList.add('is-action');
        }

        const itemText = document.createElement('span');
        itemText.textContent = opt.text;
        item.appendChild(itemText);
        item.insertAdjacentHTML('beforeend', CHECK_SVG);

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          select.selectedIndex = idx;
          select.value = opt.value;
          updateLabel();
          closeMenu();
          btn.focus();

          // Dispatch native change and input events
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('input', { bubbles: true }));
          if (typeof select.onchange === 'function') {
            select.onchange();
          }
        });

        menu.appendChild(item);
      });
      updateLabel();
    }

    function openMenu() {
      closeAllDropdowns();
      buildOptions();
      menu.hidden = false;
      btn.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');

      // Scroll selected item into view
      const selectedItem = menu.querySelector('.custom-dropdown-item.is-selected');
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    }

    function closeMenu() {
      menu.hidden = true;
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (menu.hidden) {
        openMenu();
      } else {
        closeMenu();
      }
    });

    // Keyboard support
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (menu.hidden) {
          openMenu();
        } else {
          const items = Array.from(menu.querySelectorAll('.custom-dropdown-item'));
          const current = menu.querySelector('.custom-dropdown-item.is-selected');
          const nextIdx = current ? (items.indexOf(current) + 1) % items.length : 0;
          items[nextIdx]?.click();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!menu.hidden) {
          const items = Array.from(menu.querySelectorAll('.custom-dropdown-item'));
          const current = menu.querySelector('.custom-dropdown-item.is-selected');
          const prevIdx = current ? (items.indexOf(current) - 1 + items.length) % items.length : items.length - 1;
          items[prevIdx]?.click();
        }
      } else if (e.key === 'Escape') {
        closeMenu();
      }
    });

    // Observe changes to <option> children (e.g. dynamic load in teams.html or schedules.js)
    const observer = new MutationObserver(() => {
      buildOptions();
    });
    observer.observe(select, { childList: true, subtree: true, characterData: true });

    // Initial build
    buildOptions();
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.custom-dropdown-menu').forEach((menu) => {
      menu.hidden = true;
    });
    document.querySelectorAll('.custom-dropdown-btn.is-open').forEach((btn) => {
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-dropdown-wrap')) {
      closeAllDropdowns();
    }
  });

  window.initCustomDropdowns = function () {
    document.querySelectorAll('select').forEach(enhanceSelect);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initCustomDropdowns);
  } else {
    window.initCustomDropdowns();
  }

  // Also auto-enhance any new select added dynamically
  new MutationObserver(() => {
    window.initCustomDropdowns();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
