// Keep the home page behind the existing authentication check.
    document.addEventListener('DOMContentLoaded', function () {
      if (!localStorage.getItem('token')) {
        window.location.href = 'login.html';
        return;
      }

      // Update the greeting and avatar when auth.js finishes loading the username.
      var nameEl = document.getElementById('header-username-display');
      var periodEl = document.getElementById('greet-period');
      var whoEl = document.getElementById('greet-name');

      function greet() {
        var name = (nameEl && nameEl.textContent.trim()) || 'User';
        var hour = new Date().getHours();
        periodEl.textContent = (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ',';
        whoEl.textContent = name;
      }

      greet();
      if (nameEl) {
        new MutationObserver(greet).observe(nameEl, { childList: true, characterData: true, subtree: true });
      }
    });

// Reposition the home dashboard panels with pointer or keyboard input.
    document.addEventListener('DOMContentLoaded', function () {
      const START = 7 * 60, STEP = 30, ROWS = 7, END = START + ROWS * 60, DURATION = 3 * 60;
      const table = document.getElementById('home-schedule-table');
      const lanes = Array.from(table.querySelectorAll('.day .lane'));
      const panels = Array.from(table.querySelectorAll('[data-home-panel]'));
      const all = panels.map((element) => ({
        el: element,
        day: Math.max(0, Math.min(lanes.length - 1, Number(element.dataset.day) || 0)),
        start: Math.max(START, Math.min(END - DURATION,
          Math.round(((Number(element.dataset.start) || START) - START) / STEP) * STEP + START)),
        duration: DURATION
      }));

      function formatTime(minutes) {
        const hour = Math.floor(minutes / 60), minute = minutes % 60;
        return (hour % 12 || 12) + ':' + String(minute).padStart(2, '0') + ' ' + (hour >= 12 ? 'PM' : 'AM');
      }
      function formatRange(start, end) {
        const first = formatTime(start), last = formatTime(end);
        return first.replace(/ (AM|PM)$/, '') + (first.slice(-2) === last.slice(-2) ? '' : ' ' + first.slice(-2)) + ' – ' + last;
      }
      function place(block) {
        const element = block.el;
        const lane = lanes[block.day];
        if (element.parentElement !== lane) lane.appendChild(element);
        element.style.setProperty('--panel-top', (block.start - START) / 60);
        element.style.setProperty('--panel-hours', block.duration / 60);
        element.dataset.day = String(block.day);
        element.dataset.start = String(block.start);
        const dayName = lane.closest('.day').querySelector('h2').textContent.trim();
        element.setAttribute('aria-label', dayName + ', ' + element.querySelector('.head b').textContent + ', ' +
          formatRange(block.start, block.start + block.duration) + '. Use the arrow keys to move this panel.');
      }
      function render() {
        all.forEach(block => block.el.classList.remove('clash'));
        all.forEach((a, index) => all.slice(index + 1).forEach(b => {
          const overlap = Math.min(a.start + a.duration, b.start + b.duration) - Math.max(a.start, b.start);
          if (a.day === b.day && overlap > 0) { a.el.classList.add('clash'); b.el.classList.add('clash'); }
        }));
      }
      function change(block, day, start) {
        block.day = Math.max(0, Math.min(lanes.length - 1, day));
        block.start = Math.max(START, Math.min(END - block.duration,
          Math.round((start - START) / STEP) * STEP + START));
        place(block);
        render();
      }
      table.addEventListener('pointerdown', event => {
        const grip = event.target.closest('.tool-grip');
        if (!grip || event.button > 0) return;
        const element = grip.closest('.home-tool-panel');
        const block = all.find(item => item.el === element);
        if (!block) return;
        event.preventDefault();
        const y0 = event.clientY, start0 = block.start;
        element.setPointerCapture(event.pointerId);
        element.classList.add('drag');
        element.focus({ preventScroll: true });
        const move = current => {
          const hovered = document.elementFromPoint(current.clientX, current.clientY)?.closest('.day');
          const hoveredIndex = hovered ? Array.from(table.querySelectorAll('.day')).indexOf(hovered) : -1;
          const nextDay = hoveredIndex >= 0 ? hoveredIndex : block.day;
          const rowPixels = lanes[nextDay].clientHeight / ROWS;
          const nextStart = start0 + (current.clientY - y0) / rowPixels * 60;
          if (nextDay !== block.day || Math.round((nextStart - START) / STEP) !== Math.round((block.start - START) / STEP)) {
            change(block, nextDay, nextStart);
          }
        };
        const up = () => {
          element.classList.remove('drag');
          element.removeEventListener('pointermove', move);
          element.removeEventListener('pointerup', up);
          element.removeEventListener('pointercancel', up);
        };
        element.addEventListener('pointermove', move);
        element.addEventListener('pointerup', up);
        element.addEventListener('pointercancel', up);
      });
      table.addEventListener('keydown', event => {
        const element = event.target.closest('.home-tool-panel');
        const block = all.find(item => item.el === element);
        if (!block || event.target.closest('a') || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const delta = event.key === 'ArrowUp' ? -STEP : event.key === 'ArrowDown' ? STEP : 0;
        const dayDelta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
        change(block, block.day + dayDelta, block.start + delta);
      });
      all.forEach(place);
      render();
    });