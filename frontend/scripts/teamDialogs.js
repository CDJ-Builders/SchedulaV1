(function () {
  const dialog = document.getElementById('team-action-dialog');
  const title = document.getElementById('team-dialog-title');
  const message = document.getElementById('team-dialog-message');
  const cancel = document.getElementById('team-dialog-cancel');
  const confirm = document.getElementById('team-dialog-confirm');
  if (!dialog || !title || !message || !cancel || !confirm) return;

  let settle = null;
  function close(result) {
    if (!settle) return;
    const done = settle;
    settle = null;
    dialog.close();
    done(result);
  }
  cancel.addEventListener('click', function () { close(false); });
  confirm.addEventListener('click', function () { close(true); });
  dialog.addEventListener('cancel', function (event) {
    event.preventDefault();
    close(false);
  });

  function open(options) {
    if (settle) close(false);
    title.textContent = options.title || 'Confirm';
    message.textContent = options.message || '';
    confirm.textContent = options.confirmLabel || 'Continue';
    cancel.textContent = options.cancelLabel || 'Cancel';
    cancel.hidden = options.notice === true;
    confirm.classList.toggle('success', options.tone === 'success');
    confirm.classList.toggle('danger', options.tone === 'danger');
    confirm.classList.toggle('lav', options.tone !== 'success' && options.tone !== 'danger');
    dialog.classList.toggle('is-warning', options.tone === 'warning');
    dialog.classList.toggle('is-danger', options.tone === 'danger');
    dialog.showModal();
    confirm.focus();
    return new Promise(function (resolve) { settle = resolve; });
  }

  window.teamUiDialog = {
    confirm: function (options) { return open(options || {}); },
    notice: function (options) { return open(Object.assign({ notice: true, confirmLabel: 'Got it' }, options || {})); }
  };
})();
