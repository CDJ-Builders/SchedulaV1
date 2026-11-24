document.addEventListener('DOMContentLoaded', function () {
  if (!localStorage.getItem('token')) { location.href = 'login.html'; return; }
  var $ = function (id) { return document.getElementById(id); };
  var teamSelect = $('settings-team-select');
  var memberSelect = $('settings-member-select');
  var activeTeam = null;
  var teams = [];

  function api(path, options) {
    options = options || {};
    return fetch(window.APP_CONFIG.API_BASE + path, Object.assign({}, options, {
      headers: Object.assign({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') }, options.headers || {})
    })).then(async function (response) {
      var data = response.status === 204 ? {} : await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
      return data;
    });
  }
  function feedback(id, message, error) {
    var element = $(id);
    if (element) { element.textContent = message || ''; element.classList.toggle('is-error', Boolean(error)); }
  }
  function displayName(member) { return member.isSelf ? 'You' : member.name; }
  function showNoTeams() {
    $('settings-title').textContent = 'Teams';
    $('team-settings-content').hidden = true;
    $('no-teams-message').hidden = false;
  }
  function populateMemberSelect() {
    memberSelect.textContent = '';
    (activeTeam.members || []).forEach(function (member) {
      var option = document.createElement('option');
      option.value = member.id;
      option.textContent = displayName(member);
      if (member.isSelf) option.selected = true;
      memberSelect.appendChild(option);
    });
  }
  function populatePeople(id, role) {
    var list = $(id);
    list.textContent = '';
    (activeTeam.members || []).filter(function (member) { return (member.role === 'admin') === (role === 'admin'); }).forEach(function (member) {
      var item = document.createElement('li');
      var label = document.createElement('span');
      label.textContent = displayName(member);
      item.appendChild(label);
      if (activeTeam.isAdmin && !member.isSelf) {
        var action = document.createElement('button');
        action.className = 'settings-role-button';
        action.type = 'button';
        action.textContent = role === 'admin' ? 'Demote' : 'Promote to admin';
        action.addEventListener('click', async function () {
          action.disabled = true;
          try {
            await api('/teams/' + activeTeam.id + '/members/' + member.id, {
              method: 'PUT', body: JSON.stringify({ role: role === 'admin' ? 'member' : 'admin' })
            });
            await loadTeam(activeTeam.id);
            feedback('team-name-feedback', 'Member role updated.');
          } catch (error) { feedback('team-name-feedback', error.message, true); action.disabled = false; }
        });
        item.appendChild(action);
        var remove = document.createElement('button');
        remove.className = 'settings-role-button';
        remove.type = 'button';
        remove.textContent = 'Remove';
        remove.addEventListener('click', async function () {
          if (!window.confirm('Remove ' + displayName(member) + ' from this team?')) return;
          remove.disabled = true;
          try {
            await api('/teams/' + activeTeam.id + '/members/' + member.id, { method: 'DELETE' });
            await loadTeam(activeTeam.id);
            feedback('team-name-feedback', 'Member removed.');
          } catch (error) { feedback('team-name-feedback', error.message, true); remove.disabled = false; }
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
    populateMemberSelect();
    populatePeople('settings-admins', 'admin');
    populatePeople('settings-members', 'member');
    $('leave-team').hidden = false;
    $('leave-team').disabled = (activeTeam.members || []).length === 1;
  }
  async function loadTeam(id) {
    var result = await api('/teams/' + encodeURIComponent(id));
    activeTeam = result.team;
    renderTeam();
  }
  function fillTeamSelect() {
    teamSelect.textContent = '';
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
      feedback('team-name-feedback', 'Team name saved.');
      renderTeam();
      var selected = teamSelect.querySelector('option[value="' + activeTeam.id + '"]');
      if (selected) selected.textContent = activeTeam.name;
    } catch (error) { feedback('team-name-feedback', error.message, true); }
    finally { button.disabled = false; }
  });
  $('regenerate-group-code').addEventListener('click', async function () {
    if (!window.confirm('Regenerate the group code? Existing codes will stop working.')) return;
    this.disabled = true;
    try {
      var result = await api('/teams/' + activeTeam.id + '/group-code', { method: 'POST' });
      $('group-code').textContent = result.code;
      feedback('group-code-feedback', 'Group code regenerated.');
    } catch (error) { feedback('group-code-feedback', error.message, true); }
    finally { this.disabled = false; }
  });
  $('leave-team').addEventListener('click', async function () {
    if (!activeTeam || !window.confirm('Leave ' + activeTeam.name + '?')) return;
    this.disabled = true;
    try {
      await api('/teams/' + activeTeam.id + '/leave', { method: 'POST' });
      teams = teams.filter(function (team) { return team.id !== activeTeam.id; });
      fillTeamSelect();
      if (!teams.length) showNoTeams();
      else { teamSelect.value = teams[0].id; await loadTeam(teams[0].id); }
    } catch (error) { feedback('team-name-feedback', error.message, true); this.disabled = false; }
  });
  teamSelect.addEventListener('change', function () {
    location.href = 'teams-settings.html?team=' + encodeURIComponent(this.value);
  });

  (async function init() {
    try {
      var result = await api('/teams');
      teams = result.teams || [];
      if (!teams.length) return showNoTeams();
      fillTeamSelect();
      var requested = new URLSearchParams(location.search).get('team');
      var selected = teams.find(function (team) { return team.id === requested; }) || teams[0];
      teamSelect.value = selected.id;
      await loadTeam(selected.id);
    } catch (error) { showNoTeams(); feedback('team-name-feedback', error.message, true); }
  })();
});
