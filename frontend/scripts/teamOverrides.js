(function () {
  const STORAGE_KEY = 'schedula-team-overrides';

  function readAll() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  }

  window.TEAM_OVERRIDES = {
    get: function (teamId) {
      return readAll()[teamId] || {};
    },
    save: function (teamId, changes) {
      const all = readAll();
      all[teamId] = Object.assign({}, all[teamId], changes);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }
  };
})();
