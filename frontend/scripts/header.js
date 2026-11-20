(function () {
  const header = document.querySelector('header.top');
  if (!header) return;

  const nameElement = header.querySelector('#header-username-display');
  const avatarElement = header.querySelector('#avatar');

  if (nameElement) {
    try {
      const cachedUser = JSON.parse(localStorage.getItem('user') || 'null');
      const cachedName = cachedUser?.username || cachedUser?.name || cachedUser?.email;
      if (cachedName) {
        nameElement.textContent = cachedName.length > 50 ? `${cachedName.slice(0, 50)}…` : cachedName;
        nameElement.title = cachedName;
      }
    } catch {
      // Keep the static placeholder when the session cache is invalid.
    }
  }

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
