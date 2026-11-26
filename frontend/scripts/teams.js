document.addEventListener('DOMContentLoaded', async function () {
 if (!localStorage.getItem('token')) { location.href = 'login.html'; return; }

 var DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
 var $ = function (id) { return document.getElementById(id); };
 var TEAMS = [], team = null, viewMode = 'team', selectedMember = null, personalSchedules = [];
 // Match Builder's visible schedule window so member view does not hide the
 // early and evening blocks present in the consolidated team schedule.
 var FROM = 7, TO = 22;
 var memberSlider = $('member-slider');
 var statusTimer = null, statusHideTimer = null;

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
  var data = null;
  var rawBody = '';
  if (response.status !== 204) {
   rawBody = await response.text().catch(function () { return ''; });
   try { data = rawBody ? JSON.parse(rawBody) : {}; } catch (error) { data = {}; }
  }
  if (!response.ok) {
   var message = data && data.error;
   if (!message && path.indexOf('/shared-schedule') !== -1 && response.status === 404) {
    message = 'The running backend does not recognize shared schedule imports yet. Restart the backend from this Schedula workspace, then try again.';
   } else if (!message && rawBody && !response.headers.get('content-type')?.includes('application/json')) {
    message = 'The Teams server returned HTTP ' + response.status + ' without a JSON error. Restart the backend and retry the import.';
   }
   var failure = new Error(message || 'The Teams request could not be completed (HTTP ' + response.status + ').');
   failure.status = response.status;
   throw failure;
  }
  if (response.status !== 204 && data === null) throw new Error('The Teams server returned an invalid response.');
  return data;
 }
 function displayName(member) { return member.isSelf ? member.name + ' (You)' : member.name; }
 function showStatus(message, isError) {
  var status = $('team-status');
  if (statusTimer) window.clearTimeout(statusTimer);
  if (statusHideTimer) window.clearTimeout(statusHideTimer);
  status.textContent = message || '';
  status.classList.toggle('is-error', Boolean(isError));
  status.classList.toggle('is-visible', Boolean(message));
  status.hidden = !message;
  if (message) {
   statusTimer = window.setTimeout(function () {
    status.classList.remove('is-visible');
    statusHideTimer = window.setTimeout(function () { status.hidden = true; }, 180);
   }, isError ? 5000 : 2800);
  }
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
 function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
 function escapePopup(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]; }); }
 function popupConfirm(message, title, confirmType) {
  return new Promise(function (resolve) {
   window.confirmPopup(escapePopup(message), function () { resolve(true); }, function () { resolve(false); }, escapePopup(title), confirmType || 'primary');
  });
 }
 function popupSuccess(message, title) { window.successPopup(escapePopup(message), escapePopup(title)); }
 function popupError(message, title) { window.alert('Error: ' + escapePopup(message), escapePopup(title || 'Team schedule error')); }
 function toHour(value) { var parts = String(value || '').split(':').map(Number); return (parts[0] || 0) + (parts[1] || 0) / 60; }
 function fullDay(shortDay) { return {Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday',Sun:'Sunday'}[shortDay]; }
 function blocksForDay(shortDay) {
  // Pending proposals are shown in the review dialog. Rendering them over the
  // shared schedule duplicates the block for its proposer and each accepter.
  return (team.events[shortDay] || []).map(function (b) { return { s:b[0], e:b[1], title:b[2], description:b[3] || '', kind:'team' }; });
 }
 function sortBlocksByTime(blocks) {
  return blocks.sort(function (a, b) {
   return a.s - b.s || a.e - b.e || String(a.title || '').localeCompare(String(b.title || ''));
  });
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
  var bd = $('board'); bd.textContent = '';
  bd.classList.toggle('team-view-mode', viewMode === 'team');
  $('team-view-button').classList.toggle('is-active', viewMode === 'team');
  $('team-view-button').setAttribute('aria-pressed', viewMode === 'team' ? 'true' : 'false');
  $('member-view-button').classList.toggle('is-active', viewMode === 'member');
  $('member-view-button').setAttribute('aria-pressed', viewMode === 'member' ? 'true' : 'false');
  memberSlider.hidden = viewMode !== 'member';
  if (viewMode === 'member') revealMember(memberSlider.querySelector('[aria-pressed="true"]'));

  if (viewMode === 'member') {
   var selected = team.members.find(function (member) { return member.id === selectedMember; }) || team.members[0];
   if (selected) {
    selectedMember = selected.id;
    bd.setAttribute('aria-label', displayName(selected) + "'s weekly timetable");
    var timetable = el('div', 'team-table single-member member-timetable');
    var timetableHeader = el('div', 'team-table-header');
    timetableHeader.appendChild(el('div', 'member-heading', displayName(selected)));
    ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].forEach(function (label) {
     timetableHeader.appendChild(el('div', '', label));
    });
    timetable.appendChild(timetableHeader);

    var timetableRow = el('div', 'team-table-row member-timetable-row');
    var axis = el('div', 'member-time-axis team-member-cell');
    for (var hour = FROM; hour < TO; hour++) {
     var hourLabel = hour < 12 ? hour + ' AM' : (hour === 12 ? '12 PM' : hour - 12 + ' PM');
     axis.appendChild(el('span', '', hourLabel));
    }
    timetableRow.appendChild(axis);
    DAYS.forEach(function (shortDay) {
     var fullDay = {Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday',Sun:'Sunday'}[shortDay];
     var column = el('div', 'member-day-column team-day-cell');
     column.setAttribute('aria-label', fullDay);
     var blocks = sortBlocksByTime((selected.busy[shortDay] || []).map(function (block) { return { s:block[0], e:block[1], title:block[2] || 'Busy', kind:'' }; })
      .concat(blocksForDay(shortDay)));
     blocks.forEach(function (blockData) {
      if (blockData.e <= FROM || blockData.s >= TO) return;
      var block = el('div', 'team-block member-week-block ' + blockData.kind);
      block.style.top = ((Math.max(blockData.s, FROM) - FROM) / (TO - FROM) * 100) + '%';
      block.style.height = ((Math.min(blockData.e, TO) - Math.max(blockData.s, FROM)) / (TO - FROM) * 100) + '%';
      block.appendChild(el('b', '', blockData.title));
      if (blockData.description) block.appendChild(el('small', '', blockData.description));
      block.appendChild(el('small', '', rng(blockData.s, blockData.e)));
      column.appendChild(block);
     });
     timetableRow.appendChild(column);
    });
    timetable.appendChild(timetableRow);
    bd.appendChild(timetable);
   }
  } else {
   bd.setAttribute('aria-label', 'Team schedules for ' + team.members.map(displayName).join(', '));
   var table = el('div', 'team-table');
   var header = el('div', 'team-table-header');
   header.appendChild(el('div', 'member-heading', 'Team member'));
   ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].forEach(function (label) {
    header.appendChild(el('div', '', label));
   });
   table.appendChild(header);
   team.members.forEach(function (member) {
    var row = el('div', 'team-table-row');
    var memberCell = el('div', 'team-member-cell');
    var memberName = el('span', 'team-member-name');
    memberName.appendChild(el('span', 'team-member-label', displayName(member)));
    memberCell.appendChild(memberName);
    row.appendChild(memberCell);
    DAYS.forEach(function (shortDay) {
     var fullDay = {Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday',Sun:'Sunday'}[shortDay];
     var cell = el('div', 'team-day-cell');
     var blocks = sortBlocksByTime((member.busy[shortDay] || []).map(function (block) { return { s:block[0], e:block[1], title:block[2] || 'Busy', kind:'' }; })
      .concat(blocksForDay(shortDay)));
     if (!blocks.length) cell.appendChild(el('span', 'team-empty', 'No blocks added'));
     blocks.forEach(function (blockData) {
      var block = el('div', 'team-block ' + blockData.kind);
      block.appendChild(el('b', '', blockData.title));
      if (blockData.description) block.appendChild(el('small', '', blockData.description));
      block.appendChild(el('small', '', rng(blockData.s, blockData.e)));
      cell.appendChild(block);
     });
     cell.setAttribute('aria-label', fullDay);
     row.appendChild(cell);
    });
    table.appendChild(row);
   });
   bd.appendChild(table);
  }

  renderProposals();
 }

 function renderProposals() {
  var container = $('team-proposal-review'), count = $('team-proposal-review-count');
  var currentMember = (team.members || []).find(function (member) { return member.isSelf; });
  var currentUserId = currentMember && String(currentMember.id);
  var proposals = (team.proposals || []).filter(function (proposal) {
   return proposal.status === 'pending' && !proposal.current_user_response &&
    (!currentUserId || String(proposal.proposed_by_user_id) !== currentUserId);
  });
  container.hidden = proposals.length === 0;
  count.textContent = proposals.length + (proposals.length === 1 ? ' Proposal to Review' : ' Proposals to Review');
  var list = $('team-proposal-review-list');
  list.textContent = '';
  proposals.forEach(function (proposal) {
   var row = el('article', 'team-proposal');
   var detail = el('div', 'team-proposal-detail');
   detail.appendChild(el('strong', '', proposal.title || 'Team meeting'));
   detail.appendChild(el('span', '', proposal.weekday + ' · ' + proposal.start_time + '–' + proposal.end_time));
   if (proposal.description) detail.appendChild(el('span', 'team-proposal-description', proposal.description));
   row.appendChild(detail);
   [['decline', 'Reject', 'danger'], ['accept', 'Accept', 'success']].forEach(function (choice) {
    var button = el('button', 'key sm ' + choice[2], choice[1]);
    button.type = 'button';
    button.addEventListener('click', async function () {
     button.disabled = true;
     var rowButtons = row.querySelectorAll('button');
     rowButtons.forEach(function (item) { item.disabled = true; });
     $('team-proposal-review-status').hidden = false;
     $('team-proposal-review-status').textContent = choice[0] === 'accept' ? 'Adding this block to your shared schedule…' : 'Removing this proposal for everyone…';
     try {
      await api('/teams/' + encodeURIComponent(team.id) + '/proposals/' + encodeURIComponent(proposal.id) + '/responses', {
       method:'POST', body:JSON.stringify({ response:choice[0] })
      });
      var teamId = team.id;
      await refreshTeams(teamId);
      if (!($('team-proposal-review-dialog').open)) return;
      $('team-proposal-review-status').textContent = choice[0] === 'accept'
       ? 'Added to your shared schedule.' : 'Proposal rejected and removed for everyone.';
      showStatus(choice[0] === 'accept' ? 'Weekly block added to your shared schedule.' : 'Proposal rejected for everyone.');
     } catch (error) {
      $('team-proposal-review-status').hidden = false;
      $('team-proposal-review-status').textContent = error.message;
      $('team-proposal-review-status').classList.add('is-error');
      rowButtons.forEach(function (item) { item.disabled = false; });
     }
    });
    row.appendChild(button);
   });
   list.appendChild(row);
  });
  if (!proposals.length && $('team-proposal-review-dialog').open) {
   list.appendChild(el('p', 'team-proposal-review-empty', 'You’re all caught up.'));
  }
 }

 $('team-proposal-review-open').addEventListener('click', function () {
  $('team-proposal-review-status').hidden = true;
  $('team-proposal-review-status').classList.remove('is-error');
  renderProposals();
  $('team-proposal-review-dialog').showModal();
  var firstAction = $('team-proposal-review-list').querySelector('button');
  ($('team-proposal-review-close')).focus();
  if (firstAction) firstAction.focus();
 });
 $('team-proposal-review-close').addEventListener('click', function () { $('team-proposal-review-dialog').close(); $('team-proposal-review-open').focus(); });
 $('team-proposal-review-dialog').addEventListener('click', function (event) {
  if (event.target === this) { this.close(); $('team-proposal-review-open').focus(); }
 });

 var sel = $('team');
 function fill() { sel.textContent = ''; var newTeam = el('option', '', 'New Team'); newTeam.value = '__new_team__'; sel.appendChild(newTeam); TEAMS.forEach(function (x) { var o = el('option', '', x.name); o.value = x.id; sel.appendChild(o); }); if (team) sel.value = team.id; }
 function updateSettingsLink() { $('team-settings-link').href = 'teams-settings.html?team=' + encodeURIComponent(team.id); }

 function renderSharedScheduleOptions() {
  var select = $('team-shared-schedule');
  if (!select || !team) return;
  select.textContent = '';
  var blank = el('option', '', 'Do not share a schedule');
  blank.value = '';
  select.appendChild(blank);
  personalSchedules.forEach(function (schedule) {
   var option = el('option', '', schedule.title || 'Untitled schedule');
   option.value = schedule.id;
   select.appendChild(option);
  });
  if (team.sharedScheduleId && !personalSchedules.some(function (schedule) { return schedule.id === team.sharedScheduleId; })) {
   var existing = el('option', '', 'Current shared schedule (unavailable)');
   existing.value = team.sharedScheduleId;
   select.appendChild(existing);
  }
  select.value = team.sharedScheduleId || '';
  $('import-team-schedule').disabled = personalSchedules.length === 0 && !team.sharedScheduleId;
 }

 async function loadPersonalSchedules() {
  try {
   var result = await api('/schedules');
   var schedules = Array.isArray(result) ? result : (result.schedules || []);
   personalSchedules = schedules.filter(function (schedule) { return !schedule.group_id; });
   renderSharedScheduleOptions();
  } catch (error) {
   personalSchedules = [];
   renderSharedScheduleOptions();
   popupError(error.message, 'Could not load saved schedules');
  }
 }

 function fillMembers() {
  memberSlider.textContent = '';
  if (!team.members.some(function (m) { return m.id === selectedMember; })) {
   var self = team.members.find(function (m) { return m.isSelf; });
   selectedMember = self ? self.id : (team.members[0] && team.members[0].id);
  }
  team.members.forEach(function (m) {
   var button = el('button', 'member-slide');
   button.type = 'button';
   button.appendChild(el('span', 'member-slide-name', displayName(m)));
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
    $('main-content').hidden = false;
    document.body.classList.add('no-team-mode');
    showStatus('Create a team or join with a code to get started.');
    showNoTeamDialog();
    return;
   }
   var requestedId = preferredId || new URLSearchParams(location.search).get('team') || (team && team.id);
   team = TEAMS.find(function (item) { return String(item.id) === String(requestedId); }) || TEAMS[0];
   if (noTeamDialog && noTeamDialog.open) noTeamDialog.close();
   document.body.classList.remove('no-team-mode');
   $('main-content').hidden = false;
   fill();
   fillMembers();
   updateSettingsLink();
   render();
   renderSharedScheduleOptions();
   showStatus('');
  } catch (error) {
   $('main-content').hidden = false;
   showStatus(error.message, true);
  }
 }
 $('team-view-button').onclick = function () { viewMode = 'team'; render(); };
 $('member-view-button').onclick = function () { viewMode = 'member'; render(); };
 $('show-member-preferences').onclick = function () { window.showTeamPreferences(team.id, team.name); };

 // Create and join use the authenticated Teams API.
 var dlg = $('dlg'), noTeamDialog = $('no-team-dialog'), joinDialog = $('team-join-dialog'), mode = 'create', pendingJoinCode = '';
 var joinDialogMode = 'join', pendingShareTeamId = null;
 function showNoTeamDialog() {
  noTeamDialog.classList.remove('is-choice');
  $('close-new-team-dialog').hidden = true;
  $('no-team-title').textContent = 'No Team Yet';
  if (!noTeamDialog.open) {
   if (typeof noTeamDialog.show === 'function') noTeamDialog.show();
   else noTeamDialog.setAttribute('open', '');
  }
 }
 function showTeamChoices() {
  $('no-team-title').textContent = 'New Team';
  $('close-new-team-dialog').hidden = false;
  noTeamDialog.classList.add('is-choice');
  if (noTeamDialog.open) noTeamDialog.close();
  noTeamDialog.showModal();
 }
 function openTeamForm(nextMode) {
  mode = nextMode;
  $('dt').textContent = mode === 'create' ? 'Create a team' : 'Join with a code';
  $('dl').textContent = mode === 'create' ? 'Team name' : 'Invite code';
  $('dv').value = '';
  $('dm').textContent = '';
  noTeamDialog.classList.remove('is-choice');
  $('close-new-team-dialog').hidden = true;
  noTeamDialog.close();
  dlg.showModal();
  $('dv').focus();
 }
 document.querySelectorAll('[data-dlg]').forEach(function (b) { b.onclick = function () { openTeamForm(b.dataset.dlg); }; });
 $('create-team-from-empty').onclick = function () { openTeamForm('create'); };
 $('join-team-from-empty').onclick = function () { openTeamForm('join'); };
 $('close-new-team-dialog').onclick = function () {
  noTeamDialog.close();
  noTeamDialog.classList.remove('is-choice');
  $('close-new-team-dialog').hidden = true;
  $('no-team-title').textContent = 'No Team Yet';
  if (!TEAMS.length) showNoTeamDialog();
 };
 noTeamDialog.addEventListener('cancel', function (event) {
  if (!TEAMS.length) event.preventDefault();
 });
 window.addEventListener('schedula:team-proposal-created', async function (event) {
  if (!team || String(event.detail && event.detail.teamId) !== String(team.id)) return;
  await refreshTeams(team.id);
  showStatus('Proposal sent and saved to your shared personal schedule.');
 });

 $('import-team-schedule').addEventListener('click', async function () {
  if (!team) return;
  var scheduleId = $('team-shared-schedule').value || null;
  if (scheduleId === team.sharedScheduleId) {
   window.noticePopup('This schedule is already shared with the team.', 'Shared schedule');
   return;
  }
  var selectedSchedule = personalSchedules.find(function (schedule) { return schedule.id === scheduleId; });
  var warning = scheduleId
   ? 'This will replace your currently shared schedule with "' + (selectedSchedule ? selectedSchedule.title : 'the selected schedule') + '".'
   : 'This will stop sharing your current schedule with the team.';
  var approved = await popupConfirm(warning, 'Update shared schedule?', 'warning');
  if (!approved) { $('team-shared-schedule').value = team.sharedScheduleId || ''; return; }
  var button = this;
  button.disabled = true;
  try {
   var result = await api('/teams/' + encodeURIComponent(team.id) + '/shared-schedule', {
    method:'PUT', body:JSON.stringify({ schedule_id:scheduleId })
   });
   team = result.team;
   render();
   renderSharedScheduleOptions();
   popupSuccess(scheduleId ? 'Your saved schedule is now shared with the team.' : 'Your schedule is no longer shared with the team.', 'Shared schedule updated');
  } catch (error) {
   $('team-shared-schedule').value = team.sharedScheduleId || '';
   popupError(error.message, 'Could not update shared schedule');
  } finally { button.disabled = false; }
 });
 noTeamDialog.addEventListener('cancel', function (event) {
  if (!noTeamDialog.classList.contains('is-choice')) event.preventDefault();
 });
 dlg.addEventListener('cancel', function (event) {
  if (!TEAMS.length) {
   event.preventDefault();
   dlg.close();
   showNoTeamDialog();
  }
 });
 $('dno').onclick = function () {
  dlg.close();
  if (!TEAMS.length) showNoTeamDialog();
 };
 async function submitJoin(scheduleId) {
  var joinButton = $('confirm-team-join');
  var payload = { code:pendingJoinCode };
  if (scheduleId) payload.schedule_id = scheduleId;
  joinButton.disabled = true;
  $('join-schedule-feedback').textContent = 'Joining team…';
  try {
   var result = await api('/teams/join', { method:'POST', body:JSON.stringify(payload) });
   joinDialog.close();
   noTeamDialog.close();
   await refreshTeams(result.team && result.team.id);
   showStatus('You joined the team.');
  } catch (error) {
   $('join-schedule-feedback').textContent = error.message;
  } finally { joinButton.disabled = false; }
 }
 function configureJoinDialog(nextMode) {
  joinDialogMode = nextMode;
  var creating = nextMode === 'share';
  $('team-join-title').textContent = 'Share a schedule?';
  $('join-schedule-description').textContent = creating
   ? 'Choose a schedule for the new team, or skip to keep it blank. You can share a schedule later.'
   : 'Select a schedule to share with this team, or skip to start with a blank shared schedule.';
  $('confirm-team-join').textContent = creating ? 'Share schedule' : 'Share & join';
 }
 async function prepareCreatedTeamShare(teamId) {
  configureJoinDialog('share');
  pendingShareTeamId = teamId;
  var select = $('join-schedule-select');
  var feedback = $('join-schedule-feedback');
  var shareButton = $('confirm-team-join');
  select.textContent = '';
  select.onchange = function () { shareButton.disabled = !this.value; };
  feedback.textContent = 'Loading your schedules…';
  shareButton.disabled = true;
  try {
   var result = await api('/schedules');
   var schedules = (Array.isArray(result) ? result : result.schedules || []).filter(function (schedule) { return !schedule.group_id; });
   if (!schedules.length) {
    feedback.textContent = 'No personal schedules available. Skip to start with a blank shared schedule.';
   } else {
    var prompt = el('option', '', 'Choose a schedule');
    prompt.value = '';
    prompt.disabled = true;
    prompt.selected = true;
    select.appendChild(prompt);
    schedules.forEach(function (schedule) {
     var option = el('option', '', schedule.title || 'Untitled schedule');
     option.value = schedule.id;
     select.appendChild(option);
    });
    feedback.textContent = '';
   }
  } catch (error) {
   feedback.textContent = error.message + ' You can skip and share a schedule later.';
  }
  dlg.close();
  joinDialog.showModal();
 }
 async function shareScheduleWithCreatedTeam(scheduleId) {
  var shareButton = $('confirm-team-join');
  shareButton.disabled = true;
  $('join-schedule-feedback').textContent = 'Sharing schedule…';
  try {
   await api('/teams/' + encodeURIComponent(pendingShareTeamId) + '/shared-schedule', {
    method:'PUT', body:JSON.stringify({ schedule_id:scheduleId })
   });
   joinDialog.close();
   await refreshTeams(pendingShareTeamId);
   pendingShareTeamId = null;
   showStatus('Team created and schedule shared.');
  } catch (error) {
   $('join-schedule-feedback').textContent = error.message;
  } finally { shareButton.disabled = false; }
 }
 async function prepareJoin(code) {
  configureJoinDialog('join');
  pendingShareTeamId = null;
  pendingJoinCode = code.toUpperCase();
  var select = $('join-schedule-select');
  var feedback = $('join-schedule-feedback');
  var shareButton = $('confirm-team-join');
  select.textContent = '';
  feedback.textContent = 'Loading your schedules…';
  shareButton.disabled = true;
  try {
   var schedules = await api('/schedules');
   schedules = (Array.isArray(schedules) ? schedules : schedules.schedules || []).filter(function (schedule) { return !schedule.group_id; });
   if (!schedules.length) {
    feedback.textContent = 'No personal schedules available. Skip to join with a blank shared schedule.';
   } else {
    var prompt = el('option', '', 'Choose a schedule');
    prompt.value = '';
    prompt.disabled = true;
    prompt.selected = true;
    select.appendChild(prompt);
    schedules.forEach(function (schedule) {
     var option = el('option', '', schedule.title);
     option.value = schedule.id;
     select.appendChild(option);
    });
    feedback.textContent = '';
    select.onchange = function () { shareButton.disabled = !this.value; };
   }
   dlg.close();
   joinDialog.showModal();
  } catch (error) {
   $('dm').textContent = error.message;
  }
 }
 $('confirm-team-join').onclick = function () {
  if (!$('join-schedule-select').value) {
   $('join-schedule-feedback').textContent = 'Choose a schedule or skip sharing.';
   return;
  }
  if (joinDialogMode === 'share') shareScheduleWithCreatedTeam($('join-schedule-select').value);
  else submitJoin($('join-schedule-select').value);
 };
 $('skip-team-join').onclick = function () {
  if (joinDialogMode === 'share') {
   joinDialog.close();
   pendingShareTeamId = null;
   showStatus('Team created.');
  } else submitJoin(null);
 };
 $('cancel-team-join').onclick = function () {
  joinDialog.close();
  if (joinDialogMode === 'share') {
   pendingShareTeamId = null;
   showStatus('Team created. You can share a schedule later.');
  } else if (!TEAMS.length) showNoTeamDialog();
 };
 joinDialog.addEventListener('cancel', function (event) {
  event.preventDefault();
  joinDialog.close();
  if (joinDialogMode === 'share') {
   pendingShareTeamId = null;
   showStatus('Team created. You can share a schedule later.');
  } else if (!TEAMS.length) showNoTeamDialog();
 });
 $('dok').onclick = async function () {
  var value = $('dv').value.trim();
  if (!value) { $('dm').textContent = mode === 'create' ? 'Enter a team name.' : 'Enter the invite code.'; return; }
  var button = $('dok');
  button.disabled = true;
  $('dm').textContent = mode === 'create' ? 'Creating team…' : 'Checking schedules…';
  try {
   if (mode === 'join') { await prepareJoin(value); return; }
   var result = await api('/teams', { method:'POST', body:JSON.stringify({ name:value }) });
   dlg.close();
   noTeamDialog.close();
   await refreshTeams(result.team && result.team.id);
   await prepareCreatedTeamShare(result.team.id);
  } catch (error) {
   $('dm').textContent = error.message;
  } finally { button.disabled = false; }
 };
 sel.addEventListener('change', function () {
  if (this.value === '__new_team__') {
   this.value = team ? team.id : '';
   showTeamChoices();
   return;
  }
  team = TEAMS.find(function (item) { return String(item.id) === this.value; }, this);
  if (!team) return;
  selectedMember = null;
  fillMembers();
  updateSettingsLink();
  render();
 });
 (async function initialize() {
  await refreshTeams();
  await loadPersonalSchedules();
  var requestedAction = new URLSearchParams(location.search).get('action');
  if (new URLSearchParams(location.search).get('create') === '1') requestedAction = 'create';
  if (requestedAction === 'create' || requestedAction === 'join') openTeamForm(requestedAction);
  else if (requestedAction === 'choose') showTeamChoices();
 })();
});

