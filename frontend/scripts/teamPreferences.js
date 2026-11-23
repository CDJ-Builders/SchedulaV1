(function () {
  const SAMPLE_PREFERENCES = {
    You: { days: 'Monday, Wednesday, Friday', times: '8–10 AM, 1–3 PM', modality: 'Onsite', commute: '30 minutes' },
    Mika: { days: 'Tuesday, Thursday', times: '10 AM–12 PM', modality: 'Online', commute: '15 minutes' },
    Jun: { days: 'Monday, Friday', times: '1–5 PM', modality: 'Onsite', commute: 'No commute' },
    Ana: { days: 'Wednesday, Thursday', times: '10 AM–12 PM', modality: 'No preference', commute: '20 minutes' },
    Paolo: { days: 'Tuesday, Wednesday', times: '9–11 AM', modality: 'Online', commute: '10 minutes' },
    Kaye: { days: 'Monday, Thursday', times: '2–4 PM', modality: 'Onsite', commute: '25 minutes' }
  };

  const dialog = document.getElementById('member-preferences-dialog');
  const list = document.getElementById('member-preferences-list');
  const caption = document.getElementById('member-preferences-caption');
  const closeButton = document.getElementById('close-member-preferences');
  if (!dialog || !list || !caption || !closeButton) return;

  closeButton.addEventListener('click', function () {
    dialog.close();
  });

  window.showTeamPreferences = function (teamName, members) {
    caption.textContent = 'Demo data · Sample preferences for ' + teamName;
    list.textContent = '';
    members.forEach(function (member) {
      const name = typeof member === 'string' ? member : member.name;
      const preference = SAMPLE_PREFERENCES[name] || {
        days: 'No preferences set',
        times: 'No preferences set',
        modality: 'No preference',
        commute: 'Not specified'
      };
      const card = document.createElement('article');
      card.className = 'member-preference-card';
      const heading = document.createElement('h3');
      heading.textContent = name;
      card.appendChild(heading);
      [
        ['Preferred days', preference.days],
        ['Preferred times', preference.times],
        ['Modality', preference.modality],
        ['Commute', preference.commute]
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
    dialog.showModal();
  };
})();
