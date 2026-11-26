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

    // Native multi-selects and listboxes keep their native interaction model.
    if (select.multiple || (select.size > 1 && !select.hasAttribute('data-custom-dropdown'))) return;

    const variant = getVariant(select);
    const overflowDialog = select.closest('.edit-weekly-block-dialog');

    // Create wrapper
    const wrap = document.createElement('div');
    wrap.className = 'custom-dropdown-wrap';
    if (select.closest('.field') || select.closest('.team-dialog') || select.closest('.smart-schedule-controls') ||
        select.classList.contains('schedule-selector') ||
        select.closest('.profile-select-group') || select.closest('.team-smart-schedule-controls') ||
        select.closest('.team-proposal-form-grid')) {
      wrap.classList.add('block-level');
    }
    // Carry layout behavior onto the wrapper because the visually hidden select no
    // longer participates in flex sizing as the visible control.
    if (select.classList.contains('schedule-selector')) wrap.classList.add('schedule-dropdown-wrap');
    if (select.classList.contains('settings-team-select')) wrap.classList.add('settings-dropdown-wrap');
    if (select.closest('.team-shared-controls')) wrap.classList.add('team-shared-dropdown-wrap');

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
    btn.setAttribute('aria-controls', `custom-dropdown-${select.id || Math.random().toString(36).slice(2)}`);
    const associatedLabel = select.labels && select.labels[0];
    const associatedLabelText = associatedLabel
      ? (() => { const clone = associatedLabel.cloneNode(true); clone.querySelectorAll('select').forEach((node) => node.remove()); return clone.textContent.trim(); })()
      : '';
    btn.setAttribute('aria-label', select.getAttribute('aria-label') ||
      associatedLabelText || select.id.replace(/[-_]/g, ' '));

    const label = document.createElement('span');
    label.className = 'custom-dropdown-label';
    btn.appendChild(label);
    btn.insertAdjacentHTML('beforeend', CHEVRON_SVG);
    wrap.appendChild(btn);

    // Create floating menu
    const menu = document.createElement('div');
    menu.className = 'custom-dropdown-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-multiselectable', 'false');
    menu.id = btn.getAttribute('aria-controls');
    if (select.id) menu.setAttribute('aria-label', select.getAttribute('aria-label') || select.id.replace(/[-_]/g, ' '));
    menu.hidden = true;
    if (overflowDialog) {
      menu.classList.add('custom-dropdown-menu--dialog');
      overflowDialog.appendChild(menu);
    } else {
      wrap.appendChild(menu);
    }

    select._customDropdownWrap = wrap;
    select._customDropdownBtn = btn;
    select._customDropdownMenu = menu;
    select._customDropdownLabel = label;

    function updateLabel() {
      const selectedOption = select.options[select.selectedIndex];
      label.textContent = selectedOption ? selectedOption.text : '';
      btn.disabled = Boolean(select.disabled);
      btn.setAttribute('aria-required', String(select.required));
      btn.setAttribute('aria-invalid', String(select.getAttribute('aria-invalid') === 'true'));
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
        item.disabled = Boolean(opt.disabled || opt.parentElement.disabled);

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
          if (item.disabled) return;
          select.selectedIndex = idx;
          updateLabel();
          closeMenu();
          btn.focus();

          // Dispatch native change and input events
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        menu.appendChild(item);
      });
      updateLabel();
    }

    let activeIndex = select.selectedIndex;
    function setActive(index) {
      const items = Array.from(menu.querySelectorAll('.custom-dropdown-item:not(:disabled)'));
      if (!items.length) return;
      const item = items[(index + items.length) % items.length];
      activeIndex = Number(item.dataset.index);
      menu.querySelectorAll('.custom-dropdown-item').forEach((option) => option.classList.remove('is-active'));
      item.classList.add('is-active');
      if (!item.id) item.id = `${menu.id}-option-${activeIndex}`;
      btn.setAttribute('aria-activedescendant', item.id);
      item.scrollIntoView({ block: 'nearest' });
    }

    function openMenu() {
      closeAllDropdowns();
      buildOptions();
      menu.hidden = false;
      if (overflowDialog) positionDialogMenu();
      btn.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      activeIndex = select.selectedIndex;
      setActive(activeIndex < 0 ? 0 : activeIndex);
    }

    function closeMenu() {
      menu.hidden = true;
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    }

    function positionDialogMenu() {
      const trigger = btn.getBoundingClientRect();
      const viewportPadding = 12;
      const maxHeight = Math.max(120, Math.min(280, window.innerHeight - viewportPadding * 2));
      const width = Math.min(trigger.width, window.innerWidth - viewportPadding * 2);
      menu.style.width = `${width}px`;
      menu.style.maxHeight = `${maxHeight}px`;
      menu.style.left = `${Math.max(viewportPadding, Math.min(trigger.left, window.innerWidth - width - viewportPadding))}px`;
      const contentHeight = Math.min(menu.scrollHeight, maxHeight);
      const below = window.innerHeight - trigger.bottom - 8;
      const above = trigger.top - 8;
      const placeAbove = below < contentHeight && above > below;
      menu.style.top = `${placeAbove
        ? Math.max(viewportPadding, trigger.top - Math.min(contentHeight, above) - 8)
        : Math.min(trigger.bottom + 8, window.innerHeight - contentHeight - viewportPadding)}px`;
    }
    if (overflowDialog) {
      window.addEventListener('resize', positionDialogMenu);
      overflowDialog.addEventListener('scroll', positionDialogMenu, true);
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

    // Keep focus on the trigger and expose the active option through ARIA.
    btn.addEventListener('keydown', (e) => {
      const items = Array.from(menu.querySelectorAll('.custom-dropdown-item:not(:disabled)'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (menu.hidden) openMenu();
        const current = items.findIndex((item) => Number(item.dataset.index) === activeIndex);
        const next = current < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1) :
          current + (e.key === 'ArrowDown' ? 1 : -1);
        setActive(next);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (menu.hidden) openMenu();
        else menu.querySelector(`[data-index="${activeIndex}"]`)?.click();
      } else if (e.key === 'Escape') {
        closeMenu();
      } else if (e.key === 'Tab') {
        closeMenu();
      } else if (e.key === 'Home' || e.key === 'End') {
        if (!menu.hidden) {
          e.preventDefault();
          setActive(e.key === 'Home' ? 0 : items.length - 1);
        }
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
    if (!e.target.closest('.custom-dropdown-wrap') && !e.target.closest('.custom-dropdown-menu')) {
      closeAllDropdowns();
    }
  });

  window.initCustomDropdowns = function () {
      document.querySelectorAll('select:not([data-native-select])').forEach(enhanceSelect);
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
