(function () {
  const dialog = document.getElementById('member-preferences-dialog');
  const list = document.getElementById('member-preferences-list');
  const caption = document.getElementById('member-preferences-caption');
  const closeButton = document.getElementById('close-member-preferences');
  if (!dialog || !list || !caption || !closeButton) return;

  function api(path) {
    return fetch(window.APP_CONFIG.API_BASE + path, {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
    }).then(async function (response) {
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || 'Could not load team preferences.');
      return data;
    });
  }

  function showMessage(message, error) {
    list.textContent = '';
    const note = document.createElement('p');
    note.className = 'preferences-message' + (error ? ' is-error' : '');
    note.textContent = message;
    list.appendChild(note);
  }

  function render(members) {
    list.textContent = '';
    if (!members.length) return showMessage('No member preferences are available.');
    members.forEach(function (member) {
      const preference = member.preferences || {};
      const card = document.createElement('article');
      card.className = 'member-preference-card';
      const heading = document.createElement('h3');
      heading.textContent = member.isSelf ? member.name + ' (You)' : member.name;
      card.appendChild(heading);
      [
        ['Preferred Days', preference.days || 'No preferences set'],
        ['Preferred Times', preference.times || 'No preferences set'],
        ['Modality', preference.modality || 'No preference'],
        ['Commute', preference.commute || 'No commute'],
        ['Preferred Break', Number(preference.preferredBreakMinutes ?? 60) + ' minutes'],
        ['Back-to-back tolerance', String(preference.maxBackToBack ?? 0)]
      ].forEach(function (detail) {
        const row = document.createElement('p');
        const label = document.createElement('strong');
        label.textContent = detail[0] + ': ';
        row.appendChild(label);
        row.appendChild(document.createTextNode(detail[1]));
        card.appendChild(row);
      });
      list.appendChild(card);
    });
  }

  closeButton.addEventListener('click', function () { dialog.close(); });

  window.showTeamPreferences = async function (teamId, teamName) {
    caption.textContent = 'Preferences for ' + teamName;
    showMessage('Loading preferences…');
    if (!dialog.open) dialog.showModal();
    try {
      const result = await api('/teams/' + encodeURIComponent(teamId) + '/preferences');
      render(result.members || []);
    } catch (error) { showMessage(error.message, true); }
  };
})();
