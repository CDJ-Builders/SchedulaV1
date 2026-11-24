document.addEventListener('DOMContentLoaded', async function () {
 if (!localStorage.getItem('token')) { location.href = 'login.html'; return; }

 var DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
 var $ = function (id) { return document.getElementById(id); };
 var TEAMS = [], team = null, day = 'Mon', viewMode = 'team', selectedMember = null;
 var ROW = 40, H0 = 7, H1 = 19, FROM = 8, TO = 18;
 var memberSlider = $('member-slider');

 async function api(path, options) {
  options = options || {};
  var token = localStorage.getItem('token');
  var response;
  try {
   response = await fetch(window.APP_CONFIG.API_BASE + path, {
    ...options,
    headers: Object.assign({ 'Content-Type':'application/json', Authorization:'Bearer ' + token }, options.headers || {})
   });
  } catch (error) { throw new Error('Unable to reach the Schedula server.'); }
  var data = response.status === 204 ? null : await response.json().catch(function () { return {}; });
  if (!response.ok) {
   var failure = new Error(data && data.error || 'The Teams request could not be completed.');
   failure.status = response.status;
   throw failure;
  }
  return data;
 }
 function displayName(member) { return member.isSelf ? 'You' : member.name; }
 function showStatus(message, isError) {
  $('msg').textContent = message || '';
  $('live').textContent = message || '';
  $('team-status').textContent = message || '';
  $('team-status').hidden = !message;
  $('team-status').classList.toggle('is-error', Boolean(isError));
 }
 async function loadTeams() {
  var result = await api('/teams');
  var teams = Array.isArray(result) ? result : (result.teams || []);
  return teams.map(function (item) {
   item.members = (item.members || []).map(function (member) {
    member.busy = member.busy || {};
    return member;
   });
   item.events = item.events || {};
   item.proposals = item.proposals || [];
   return item;
  });
 }
 function t(h) { var H = Math.floor(h), p = H >= 12 ? 'PM' : 'AM'; return (H % 12 || 12) + ':' + (h % 1 ? '30' : '00') + ' ' + p; }
 function rng(a, b) { return t(a) + ' – ' + t(b); }
 function asTime(h) { var whole = Math.floor(h), minutes = Math.round((h - whole) * 60); return String(whole).padStart(2, '0') + ':' + String(minutes).padStart(2, '0'); }
 function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
 function toHour(value) { var parts = String(value || '').split(':').map(Number); return (parts[0] || 0) + (parts[1] || 0) / 60; }
 function fullDay(shortDay) { return {Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday',Sun:'Sunday'}[shortDay]; }
 function blocksForDay(shortDay) {
  var blocks = (team.events[shortDay] || []).map(function (b) { return { s:b[0], e:b[1], title:b[2], kind:'team' }; });
  (team.proposals || []).filter(function (proposal) {
   return proposal.status === 'pending' && proposal.weekday === fullDay(shortDay);
  }).forEach(function (proposal) {
   blocks.push({ s:toHour(proposal.start_time), e:toHour(proposal.end_time), title:proposal.title || 'Team meeting', kind:'prop', proposal:proposal });
  });
  return blocks;
 }

 function busyOf(m) { // personal busy + team events + proposals, for the chosen day
  var list = (m.busy[day] || []).map(function (b) { return { s:b[0], e:b[1], title:b[2] || 'Busy', kind:'' }; });
  return list.concat(blocksForDay(day));
 }
 function windows() { // times when every member is free, at least 1 hour
  var out = [], s = null;
  for (var h = FROM; h < TO; h += .5) {
   var free = team.members.every(function (m) { return !busyOf(m).some(function (b) { return h < b.e && b.s < h + .5; }); });
   if (free && s === null) s = h;
   if (!free && s !== null) { out.push([s, h]); s = null; }
  }
  if (s !== null) out.push([s, TO]);
  return out.filter(function (w) { return w[1] - w[0] >= 1; });
 }

 function revealMember(button) {
  if (!button || memberSlider.hidden) return;
  var sliderRect = memberSlider.getBoundingClientRect();
  var buttonRect = button.getBoundingClientRect();
  var visibleLeft = sliderRect.left + memberSlider.clientLeft;
  var visibleRight = visibleLeft + memberSlider.clientWidth;
  if (buttonRect.left < visibleLeft) {
   memberSlider.scrollBy({ left: buttonRect.left - visibleLeft, behavior:'smooth' });
  } else if (buttonRect.right > visibleRight) {
   memberSlider.scrollBy({ left: buttonRect.right - visibleRight, behavior:'smooth' });
  }
 }

 function render() {
  var ws = windows(), best = ws.slice().sort(function (a, b) { return (b[1] - b[0]) - (a[1] - a[0]) || a[0] - b[0]; })[0];
  var bd = $('board'); bd.textContent = '';
  bd.classList.toggle('team-view-mode', viewMode === 'team');
  $('view-toggle').textContent = viewMode === 'team' ? 'Team View' : 'Member View';
  $('view-toggle').setAttribute('aria-pressed', viewMode === 'member' ? 'true' : 'false');
  $('view-toggle').setAttribute('aria-label', 'Switch to ' + (viewMode === 'team' ? 'member' : 'team') + ' view');
  memberSlider.hidden = viewMode !== 'member';
  if (viewMode === 'member') revealMember(memberSlider.querySelector('[aria-pressed="true"]'));

  if (viewMode === 'team') {
   bd.setAttribute('aria-label', 'Team schedules for ' + team.members.map(displayName).join(', '));
   var table = el('div', 'team-table');
   var header = el('div', 'team-table-header');
   header.appendChild(el('div', 'member-heading', 'Member'));
   ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].forEach(function (label) {
    header.appendChild(el('div', '', label));
   });
   table.appendChild(header);

   team.members.forEach(function (m) {
    var row = el('div', 'team-table-row');
    var memberCell = el('div', 'team-member-cell');
    memberCell.appendChild(el('span', 'team-member-name', displayName(m)));
    memberCell.appendChild(el('span', 'team-member-role', m.isSelf ? 'View schedule' : 'View week'));
    row.appendChild(memberCell);

    DAYS.forEach(function (shortDay) {
     var fullDay = {Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday',Sun:'Sunday'}[shortDay];
     var cell = el('div', 'team-day-cell');
     var blocks = (m.busy[shortDay] || []).map(function (b) { return { s:b[0], e:b[1], title:b[2] || 'Busy', kind:'' }; })
      .concat(blocksForDay(shortDay));
     if (!blocks.length) cell.appendChild(el('span', 'team-empty', 'No blocks added'));
     blocks.forEach(function (b) {
      var block = el('div', 'team-block ' + b.kind);
      block.appendChild(el('b', '', b.title));
      block.appendChild(el('small', '', rng(b.s, b.e)));
      cell.appendChild(block);
     });
     cell.setAttribute('aria-label', fullDay);
     row.appendChild(cell);
    });
    table.appendChild(row);
   });
   bd.appendChild(table);
  } else {
   var member = team.members.filter(function (m) { return m.id === selectedMember; })[0] || team.members[0];
   if (member) {
    selectedMember = member.id;
    bd.setAttribute('aria-label', displayName(member) + "'s weekly schedule");
    var week = el('div', 'member-week');
    var weekHeader = el('div', 'member-week-header');
    weekHeader.appendChild(el('div', 'member-timezone', member.timezone || 'Local time'));
    ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].forEach(function (label) {
     weekHeader.appendChild(el('div', '', label));
    });
    week.appendChild(weekHeader);
    var weekBody = el('div', 'member-week-body');
    var timeAxis = el('div', 'member-time-axis');
    for (var hour = FROM; hour < TO; hour++) {
     var label = hour < 12 ? hour + ' AM' : (hour === 12 ? '12 PM' : hour - 12 + ' PM');
     timeAxis.appendChild(el('span', '', label));
    }
    weekBody.appendChild(timeAxis);
    DAYS.forEach(function (shortDay) {
     var column = el('div', 'member-day-column');
     column.setAttribute('aria-label', shortDay);
     var blocks = (member.busy[shortDay] || []).map(function (b) { return { s:b[0], e:b[1], title:b[2] || 'Busy', kind:'' }; })
      .concat(blocksForDay(shortDay));
     blocks.forEach(function (b) {
      if (b.e <= FROM || b.s >= TO) return;
      var block = el('div', 'team-block member-week-block ' + b.kind);
      block.style.top = ((Math.max(b.s, FROM) - FROM) / (TO - FROM) * 100) + '%';
      block.style.height = ((Math.min(b.e, TO) - Math.max(b.s, FROM)) / (TO - FROM) * 100) + '%';
      block.appendChild(el('b', '', b.title));
      block.appendChild(el('small', '', rng(b.s, b.e)));
      column.appendChild(block);
     });
     weekBody.appendChild(column);
    });
    week.appendChild(weekBody);
    bd.appendChild(week);
   }
  }

  var msg = best ? 'Everyone is free on ' + fullDay(day) + ': ' + rng(best[0], best[1]) + '.' : 'No time works for everyone on ' + fullDay(day) + '. Try another day.';
  if ($('msg').textContent !== msg) { $('msg').textContent = msg; $('live').textContent = msg; }
  $('chip').textContent = ws.length + (ws.length === 1 ? ' free window' : ' free windows');
  $('prop').disabled = !best;
  $('prop').onclick = async function () {
   if (!best) return;
   var button = $('prop');
   button.disabled = true;
   try {
    await api('/teams/' + encodeURIComponent(team.id) + '/proposals', {
     method:'POST',
     body:JSON.stringify({ title:'Team meeting', weekday:fullDay(day), start_time:asTime(best[0]), end_time:asTime(best[0] + 1), modality:$('team-modality').value })
    });
    await refreshTeams(team.id);
    showStatus('Meeting proposal sent to your team.');
   } catch (error) { showStatus(error.message, true); button.disabled = false; }
  };
  renderProposals();
 }

 function renderProposals() {
  var container = $('team-proposals'), list = $('team-proposals-list');
  list.textContent = '';
  var proposals = team.proposals || [];
  container.hidden = proposals.length === 0;
  proposals.forEach(function (proposal) {
   var row = el('article', 'team-proposal');
   var detail = el('div', 'team-proposal-detail');
   detail.appendChild(el('strong', '', proposal.title || 'Team meeting'));
   detail.appendChild(el('span', '', proposal.weekday + ' · ' + proposal.start_time + '–' + proposal.end_time));
   row.appendChild(detail);
   var response = proposal.current_user_response;
   if (proposal.status === 'pending' && !response) {
    ['accept', 'decline'].forEach(function (choice) {
     var button = el('button', 'key xs', choice === 'accept' ? 'Accept' : 'Decline');
     button.type = 'button';
     button.addEventListener('click', async function () {
      button.disabled = true;
      try {
       await api('/teams/' + encodeURIComponent(team.id) + '/proposals/' + encodeURIComponent(proposal.id) + '/responses', {
        method:'POST', body:JSON.stringify({ response:choice })
       });
       await refreshTeams(team.id);
       showStatus('Your response was recorded.');
      } catch (error) { showStatus(error.message, true); button.disabled = false; }
     });
     row.appendChild(button);
    });
   } else {
    row.appendChild(el('span', 'team-proposal-response', response ? (response === 'accept' ? 'You accepted' : 'You declined') : proposal.status));
   }
   list.appendChild(row);
  });
 }

 var sel = $('team');
 function fill() { sel.textContent = ''; TEAMS.forEach(function (x) { var o = el('option', '', x.name + (x.role === 'admin' ? ' (admin)' : '')); o.value = x.id; sel.appendChild(o); }); if (team) sel.value = team.id; }
 function updateSettingsLink() { $('team-settings-link').href = 'teams-settings.html?team=' + encodeURIComponent(team.id); }
 sel.onchange = function () { team = TEAMS.filter(function (x) { return x.id === sel.value; })[0]; selectedMember = null; fillMembers(); updateSettingsLink(); render(); };

 function fillMembers() {
  memberSlider.textContent = '';
  if (!team.members.some(function (m) { return m.id === selectedMember; })) {
   var self = team.members.find(function (m) { return m.isSelf; });
   selectedMember = self ? self.id : (team.members[0] && team.members[0].id);
  }
  team.members.forEach(function (m) {
   var button = el('button', 'member-slide', displayName(m));
   button.type = 'button';
   button.dataset.memberId = m.id;
   button.setAttribute('aria-pressed', m.id === selectedMember ? 'true' : 'false');
   button.onclick = function () {
    selectedMember = m.id;
    memberSlider.querySelectorAll('.member-slide').forEach(function (memberButton) {
     memberButton.setAttribute('aria-pressed', memberButton === button ? 'true' : 'false');
    });
    render();
   };
   memberSlider.appendChild(button);
  });
 }
 async function refreshTeams(preferredId) {
  try {
   TEAMS = await loadTeams();
   if (!TEAMS.length) {
    team = null;
    sel.textContent = '';
    $('main-content').hidden = true;
    document.body.classList.add('no-team-mode');
    showStatus('Create a team or join with a code to get started.');
    if (!noTeamDialog.open) noTeamDialog.showModal();
    return;
   }
   var requestedId = preferredId || new URLSearchParams(location.search).get('team') || (team && team.id);
   team = TEAMS.find(function (item) { return String(item.id) === String(requestedId); }) || TEAMS[0];
   document.body.classList.remove('no-team-mode');
   $('main-content').hidden = false;
   fill();
   fillMembers();
   updateSettingsLink();
   render();
   showStatus('');
  } catch (error) {
   $('main-content').hidden = false;
   showStatus(error.message, true);
  }
 }
 $('view-toggle').onclick = function () { viewMode = viewMode === 'team' ? 'member' : 'team'; render(); };
 $('show-member-preferences').onclick = function () { window.showTeamPreferences(team.id, team.name); };
 $('team-day').addEventListener('change', function () { day = this.value; render(); });

 // Create and join use the authenticated Teams API.
 var dlg = $('dlg'), noTeamDialog = $('no-team-dialog'), mode = 'create';
 function openTeamForm(nextMode) {
  mode = nextMode;
  $('dt').textContent = mode === 'create' ? 'Create a team' : 'Join with a code';
  $('dl').textContent = mode === 'create' ? 'Team name' : 'Invite code';
  $('dv').value = '';
  $('dm').textContent = '';
  noTeamDialog.close();
  dlg.showModal();
  $('dv').focus();
 }
 document.querySelectorAll('[data-dlg]').forEach(function (b) { b.onclick = function () { openTeamForm(b.dataset.dlg); }; });
 $('create-team-from-empty').onclick = function () { openTeamForm('create'); };
 $('join-team-from-empty').onclick = function () { openTeamForm('join'); };
 function closeNoTeamDialog() {
  if (!TEAMS.length) return;
  noTeamDialog.close();
  document.body.classList.remove('no-team-mode');
 }
 $('close-no-team').onclick = closeNoTeamDialog;
 noTeamDialog.addEventListener('cancel', function (event) {
  event.preventDefault();
  closeNoTeamDialog();
 });
 dlg.addEventListener('cancel', function (event) {
  if (!TEAMS.length) {
   event.preventDefault();
   dlg.close();
   noTeamDialog.showModal();
  }
 });
 $('dno').onclick = function () {
  dlg.close();
  if (!TEAMS.length) noTeamDialog.showModal();
 };
 $('dok').onclick = async function () {
  var value = $('dv').value.trim();
  if (!value) { $('dm').textContent = mode === 'create' ? 'Enter a team name.' : 'Enter the invite code.'; return; }
  var button = $('dok');
  button.disabled = true;
  $('dm').textContent = mode === 'create' ? 'Creating team…' : 'Joining team…';
  try {
   var result = mode === 'create'
    ? await api('/teams', { method:'POST', body:JSON.stringify({ name:value }) })
    : await api('/teams/join', { method:'POST', body:JSON.stringify({ code:value.toUpperCase() }) });
   dlg.close();
   noTeamDialog.close();
   await refreshTeams(result.team && result.team.id);
   showStatus(mode === 'create' ? 'Team created.' : 'You joined the team.');
  } catch (error) {
   $('dm').textContent = error.message;
  } finally { button.disabled = false; }
 };
 refreshTeams();
});

