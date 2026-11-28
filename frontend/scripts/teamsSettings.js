document.addEventListener('DOMContentLoaded', function () {
  if (!localStorage.getItem('token')) { location.href = 'login.html'; return; }
  var $ = function (id) { return document.getElementById(id); };
  var teamSelect = $('settings-team-select');
  var activeTeam = null;
  var teams = [];

  function api(path, options) {
    return window.APP_API.request(path, options || {}, {
      emptyResponse: {},
      errorMessage: function ({ data }) { return data.error || 'The request could not be completed.'; }
    });
  }
  function feedback(id, message, error) {
    var element = $(id);
    if (element) { element.textContent = message || ''; element.classList.toggle('is-error', Boolean(error)); }
  }
  function confirmPopup(options) {
    return new Promise(function (resolve) {
      window.confirmPopup(window.APP_UTILS.escapePopup(options.message), function () { resolve(true); }, function () { resolve(false); }, window.APP_UTILS.escapePopup(options.title), options.tone === 'warning' ? 'warning' : (options.tone === 'danger' ? 'error' : 'primary'));
    });
  }
  function noticePopup(title, message, tone) {
    if (tone === 'danger') window.alert('Error: ' + window.APP_UTILS.escapePopup(message), window.APP_UTILS.escapePopup(title));
    else if (tone === 'warning') window.alert('⚠️ ' + window.APP_UTILS.escapePopup(message), window.APP_UTILS.escapePopup(title));
    else window.successPopup(window.APP_UTILS.escapePopup(message), window.APP_UTILS.escapePopup(title));
    var popup = document.querySelector('.custom-modal-overlay');
    var okButton = popup && popup.querySelector('#custom-alert-ok');
    if (!okButton) return Promise.resolve();
    return new Promise(function (resolve) {
      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        okButton.removeEventListener('click', finish);
        popup.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onEscape);
        window.setTimeout(resolve, 320);
      }
      function onBackdrop(event) { if (event.target === popup) finish(); }
      function onEscape(event) { if (event.key === 'Escape') finish(); }
      okButton.addEventListener('click', finish, { once: true });
      popup.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onEscape);
    });
  }
  function redirectToTeamsPage() {
    window.location.replace(new URL('./teams.html', window.location.href).href);
  }
  function displayName(member) { return member.isSelf ? member.name + ' (You)' : member.name; }
  function memberIcon(kind) {
    var image = document.createElement('img');
    image.className = 'settings-member-icon ' + kind;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.src = kind === 'admin' ? '../assets/admin.png' : '../assets/profile.png';
    return image;
  }
  function creatorCrown() {
    var crown = document.createElement('span');
    crown.className = 'settings-creator-crown';
    crown.setAttribute('role', 'img');
    crown.setAttribute('aria-label', 'Team creator');
    crown.title = 'Team creator';
    crown.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 7 5 4 4-7 4 7 5-4-2 12H5L3 7Z"/><path d="M6 21h12"/></svg>';
    return crown;
  }
  function personLabel(member) {
    var label = document.createElement('span');
    label.className = 'settings-person-label';
    if (member.isCreator) label.appendChild(creatorCrown());
    label.appendChild(memberIcon(member.role === 'admin' ? 'admin' : 'member'));
    label.appendChild(document.createTextNode(displayName(member)));
    return label;
  }
  function actionIcon(kind) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('settings-role-icon');
    var paths = {
      promote:'<path d="M12 19V5M5 12l7-7 7 7"/>',
      demote:'<path d="M12 5v14M19 12l-7 7-7-7"/>',
      remove:'<path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3"/>'
    };
    svg.innerHTML = paths[kind];
    return svg;
  }
  function setButtonContents(button, icon, label) {
    button.appendChild(actionIcon(icon));
    var text = document.createElement('span');
    text.textContent = label;
    button.appendChild(text);
  }
  function showNoTeams(message) {
    $('settings-title').textContent = 'Teams';
    $('team-settings-content').hidden = true;
    $('no-teams-message').hidden = false;
    $('no-teams-message').textContent = message || 'You are not a member of a team yet. Create or join one from the Teams page.';
    $('no-teams-message').classList.toggle('is-error', Boolean(message));
  }
  async function removeTeamFromSettings(teamId) {
    teams = teams.filter(function (team) { return team.id !== teamId; });
    fillTeamSelect();
    if (!teams.length) {
      activeTeam = null;
      showNoTeams();
      return;
    }
    teamSelect.value = teams[0].id;
    await loadTeam(teams[0].id);
  }
  function populatePeople(id, role) {
    var list = $(id);
    list.textContent = '';
    (activeTeam.members || []).filter(function (member) { return (member.role === 'admin') === (role === 'admin'); }).forEach(function (member) {
      var item = document.createElement('li');
      item.appendChild(personLabel(member));
      if (activeTeam.isAdmin && !member.isSelf && !member.isCreator) {
        var action = document.createElement('button');
        var actionType = role === 'admin' ? 'demote' : 'promote';
        action.className = 'settings-role-button ' + actionType;
        action.type = 'button';
        setButtonContents(action, actionType, actionType === 'demote' ? 'Demote' : 'Promote');
        action.addEventListener('click', async function () {
          var promote = actionType === 'promote';
          var approved = await confirmPopup({
            title: promote ? 'Promote member?' : 'Demote admin?',
            message: promote
              ? 'Give ' + displayName(member) + ' admin access to this team?'
              : 'Remove admin access from ' + displayName(member) + '?',
            confirmLabel: promote ? 'Promote' : 'Demote',
            tone: promote ? 'success' : 'warning'
          });
          if (!approved) return;
          action.disabled = true;
          try {
            await api('/teams/' + activeTeam.id + '/members/' + member.id, {
              method: 'PUT', body: JSON.stringify({ role: promote ? 'admin' : 'member' })
            });
            await loadTeam(activeTeam.id);
            await noticePopup(promote ? 'Member promoted' : 'Admin demoted', displayName(member) + (promote ? ' is now an admin.' : ' is now a member.'));
          } catch (error) { await noticePopup('Could not update role', error.message, 'danger'); action.disabled = false; }
        });
        item.appendChild(action);
        var remove = document.createElement('button');
        remove.className = 'settings-role-button remove';
        remove.type = 'button';
        setButtonContents(remove, 'remove', 'Remove');
        remove.addEventListener('click', async function () {
          var approved = await confirmPopup({
            title: 'Remove team member?',
            message: 'Remove ' + displayName(member) + ' from this team? They will lose access to its shared schedule.',
            confirmLabel: 'Remove',
            tone: 'danger'
          });
          if (!approved) return;
          remove.disabled = true;
          try {
            await api('/teams/' + activeTeam.id + '/members/' + member.id, { method: 'DELETE' });
            await loadTeam(activeTeam.id);
            await noticePopup('Member removed', displayName(member) + ' was removed from the team.');
          } catch (error) { await noticePopup('Could not remove member', error.message, 'danger'); remove.disabled = false; }
        });
        item.appendChild(remove);
      }
      list.appendChild(item);
    });
  }
  function renderTeam() {
    $('team-settings-content').hidden = false;
    $('no-teams-message').hidden = true;
    $('settings-title').textContent = activeTeam.name + ' settings';
    $('group-name').value = activeTeam.name;
    $('group-name').readOnly = !activeTeam.isAdmin;
    $('save-team-name').hidden = !activeTeam.isAdmin;
    $('group-code').textContent = activeTeam.code || 'No group code';
    $('regenerate-group-code').hidden = !activeTeam.isAdmin;
    $('role-permission-note').hidden = activeTeam.isAdmin;
    $('delete-team').hidden = !activeTeam.isCreator;
    populatePeople('settings-admins', 'admin');
    populatePeople('settings-members', 'member');
    $('leave-team').hidden = false;
    $('leave-team').disabled = false;
  }
  async function loadTeam(id) {
    var result = await api('/teams/' + encodeURIComponent(id));
    activeTeam = result.team;
    renderTeam();
  }
  function fillTeamSelect() {
    teamSelect.textContent = '';
    var newTeamOption = document.createElement('option');
    newTeamOption.value = '__new_team__';
    newTeamOption.textContent = 'New Team';
    teamSelect.appendChild(newTeamOption);
    teams.forEach(function (team) {
      var option = document.createElement('option');
      option.value = team.id;
      option.textContent = team.name;
      teamSelect.appendChild(option);
    });
  }

  $('show-member-preferences').addEventListener('click', function () {
    if (activeTeam) window.showTeamPreferences(activeTeam.id, activeTeam.name);
  });
  $('save-team-name').addEventListener('click', async function () {
    var button = this;
    var name = $('group-name').value.trim();
    if (!name) return feedback('team-name-feedback', 'Team name cannot be empty.', true);
    button.disabled = true;
    try {
      var result = await api('/teams/' + activeTeam.id, { method: 'PUT', body: JSON.stringify({ name: name }) });
      activeTeam = result.team;
      teams = teams.map(function (team) { return team.id === activeTeam.id ? activeTeam : team; });
      feedback('team-name-feedback', 'Team name saved.');
      renderTeam();
      var selected = teamSelect.querySelector('option[value="' + activeTeam.id + '"]');
      if (selected) selected.textContent = activeTeam.name;
      await noticePopup('Team name saved', 'The team name was updated successfully.');
    } catch (error) { feedback('team-name-feedback', error.message, true); }
    finally { button.disabled = false; }
  });
  $('regenerate-group-code').addEventListener('click', async function () {
    var approved = await confirmPopup({
      title: 'Regenerate team code?',
      message: 'The current code will stop working. Anyone using it will need the new code.',
      confirmLabel: 'Regenerate',
      tone: 'warning'
    });
    if (!approved) return;
    this.disabled = true;
    try {
      var result = await api('/teams/' + activeTeam.id + '/group-code', { method: 'POST' });
      $('group-code').textContent = result.code;
      await noticePopup('Team code regenerated', 'The new team code is ready to share.');
    } catch (error) { await noticePopup('Could not regenerate code', error.message, 'danger'); }
    finally { this.disabled = false; }
  });
  $('leave-team').addEventListener('click', async function () {
    if (!activeTeam) return;
    var leavingTeamName = activeTeam.name;
    var isLastMember = (activeTeam.members || []).length === 1;
    var approved = await confirmPopup({
      title: 'Leave this team?',
      message: isLastMember
        ? 'You are the last member. Leaving will delete the team and remove it for everyone.'
        : activeTeam.isCreator
          ? 'Creator access will transfer to the next admin, or to the first member alphabetically.'
          : 'You will lose access to this team and its shared schedule.',
      confirmLabel: 'Leave team',
      tone: 'danger'
    });
    if (!approved) return;
    var button = this;
    button.disabled = true;
    var redirectTimer = null;
    try {
      var result = await api('/teams/' + activeTeam.id + '/leave', { method: 'POST' });
      redirectTimer = window.setTimeout(redirectToTeamsPage, 1600);
      await removeTeamFromSettings(activeTeam.id);
      await noticePopup(result.teamDeleted ? 'Team deleted' : 'You left the team', result.teamDeleted
        ? leavingTeamName + ' was deleted because you were its last member.'
        : 'You no longer have access to ' + leavingTeamName + '.');
      window.clearTimeout(redirectTimer);
      redirectToTeamsPage();
    } catch (error) {
      if (redirectTimer) window.clearTimeout(redirectTimer);
      await noticePopup('Could not leave team', error.message, 'danger');
      button.disabled = false;
    }
  });
  $('delete-team').addEventListener('click', async function () {
    if (!activeTeam || !activeTeam.isCreator) return;
    var teamId = activeTeam.id;
    var teamName = activeTeam.name;
    var approved = await confirmPopup({
      title: 'Delete this team for everyone?',
      message: 'Delete ' + teamName + ' for all members? Its team events, meeting proposals, and shared team access will be removed. Members’ personal schedules remain theirs.',
      confirmLabel: 'Delete team',
      tone: 'danger'
    });
    if (!approved) return;
    var button = this;
    button.disabled = true;
    try {
      await api('/teams/' + encodeURIComponent(teamId), { method: 'DELETE' });
      redirectToTeamsPage();
    } catch (error) {
      await noticePopup('Could not delete team', error.message, 'danger');
      button.disabled = false;
    }
  });
  teamSelect.addEventListener('change', function () {
    if (this.value === '__new_team__') { location.href = 'teams.html?action=choose'; return; }
    location.href = 'teams-settings.html?team=' + encodeURIComponent(this.value);
  });

  (async function init() {
    try {
      var result = await api('/teams');
      teams = result.teams || [];
      fillTeamSelect();
      if (!teams.length) return showNoTeams();
      var requested = new URLSearchParams(location.search).get('team');
      var selected = teams.find(function (team) { return team.id === requested; }) || teams[0];
      teamSelect.value = selected.id;
      await loadTeam(selected.id);
    } catch (error) { showNoTeams('Could not load your teams: ' + error.message); }
  })();
});
