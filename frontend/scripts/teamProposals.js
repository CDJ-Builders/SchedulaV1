document.addEventListener('DOMContentLoaded', function () {
  const $ = id => document.getElementById(id);
  const proposalDialog = $('team-proposal-dialog');
  const smartDialog = $('team-smart-schedule-dialog');
  const proposalForm = $('team-proposal-form');
  const proposalStatus = $('team-proposal-status');
  const smartStatus = $('team-smart-schedule-status');
  const smartGenerateButton = $('team-smart-schedule-generate');
  const smartInputs = [$('team-smart-title'), $('team-smart-modality'), $('team-smart-duration'), $('team-smart-type')];
  let activeTeamId = null;
  let recommendationRequest = null;
  let proposalRequest = null;
  let proposalConflictConfirmationPending = false;

  function escapePopup(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
  }

  function confirmProposalConflict(message) {
    return new Promise(resolve => {
      const dialog = $('team-proposal-conflict-dialog');
      if (!dialog || typeof dialog.showModal !== 'function') {
        resolve(window.confirm(message));
        return;
      }
      $('team-proposal-conflict-message').textContent = message;
      dialog.returnValue = '';
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'continue'), { once: true });
      $('team-proposal-conflict-cancel').onclick = () => dialog.close('cancel');
      $('team-proposal-conflict-continue').onclick = () => dialog.close('continue');
      dialog.showModal();
      $('team-proposal-conflict-cancel').focus();
    });
  }

  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(window.APP_CONFIG.API_BASE + path, {
        ...options,
        headers: Object.assign({
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem('token')
        }, options.headers || {})
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error('Unable to reach the Schedula server.');
    }
    const rawBody = response.status === 204 ? '' : await response.text().catch(() => '');
    let data = {};
    try { data = rawBody ? JSON.parse(rawBody) : {}; } catch { }
    if (!response.ok) {
      const missingRecommendationRoute = response.status === 404 && /\/recommendations(?:\?|$)/.test(path);
      const error = new Error(data.error || (missingRecommendationRoute
        ? 'The team recommendation route is not loaded by the backend yet. Restart or redeploy the backend, then retry.'
        : 'The request could not be completed (HTTP ' + response.status + ').'));
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function setProposalStatus(message, isError = false) {
    proposalStatus.textContent = message || '';
    proposalStatus.hidden = !message;
    proposalStatus.classList.toggle('is-error', isError);
  }

  function setSmartStatus(message, isError = false) {
    smartStatus.textContent = message || '';
    smartStatus.classList.toggle('is-error', isError);
  }

  function resetRecommendations() {
    $('team-smart-schedule-model').hidden = true;
    $('team-smart-schedule-model-name').textContent = '';
    $('team-smart-schedule-options').replaceChildren();
    $('team-smart-schedule-warnings').textContent = '';
    $('team-smart-schedule-warnings').hidden = true;
  }

  function setRecommendationBusy(isBusy, request) {
    if (request && recommendationRequest !== request) return;
    smartInputs.forEach(input => { input.disabled = isBusy; });
    smartGenerateButton.disabled = isBusy || !smartInputs[0].value.trim() || !['onsite', 'online'].includes(smartInputs[1].value);
    smartGenerateButton.textContent = isBusy ? 'Finding times…' : 'Show the Best Slots';
    if (isBusy) smartGenerateButton.setAttribute('aria-busy', 'true');
    else smartGenerateButton.removeAttribute('aria-busy');
  }

  function abortRecommendations() {
    if (!recommendationRequest) return;
    const request = recommendationRequest;
    recommendationRequest = null;
    request.abort();
    smartInputs.forEach(input => { input.disabled = false; });
    setRecommendationBusy(false);
  }

  function openProposalDialog() {
    const select = $('team');
    const proposeButton = $('prop');
    const memberCount = Number(proposeButton && proposeButton.dataset.memberCount);
    if (!proposeButton || proposeButton.disabled || !Number.isFinite(memberCount) || memberCount < 2) return;
    activeTeamId = select && select.value !== '__new_team__' ? select.value : null;
    if (!activeTeamId) return;
    proposalForm.reset();
    setProposalStatus('');
    proposalDialog.showModal();
    $('proposal-title').focus();
  }

  function openSmartDialog() {
    resetRecommendations();
    $('team-smart-title').value = $('proposal-title').value;
    $('team-smart-modality').value = $('proposal-modality').value;
    $('team-smart-duration').value = '1';
    $('team-smart-type').value = '';
    smartInputs.forEach(input => { input.disabled = false; });
    setRecommendationBusy(false);
    const missing = [];
    if (!$('team-smart-title').value.trim()) missing.push('a title');
    if (!['onsite', 'online'].includes($('team-smart-modality').value)) missing.push('a modality');
    setSmartStatus(missing.length
      ? 'Enter ' + missing.join(' and ') + ' here before requesting recommendations.'
      : 'Choose a duration and type, then show the top five times.', Boolean(missing.length));
    smartDialog.showModal();
    if (missing.includes('a title')) $('team-smart-title').focus();
    else if (missing.includes('a modality')) $('team-smart-modality').focus();
    else $('team-smart-duration').focus();
  }

  function closeSmartDialog() {
    abortRecommendations();
    if (smartDialog.open) smartDialog.close();
    if (proposalDialog.open) $('team-smart-schedule-open').focus();
  }

  function cancelProposal() {
    abortRecommendations();
    if (smartDialog.open) smartDialog.close();
    if (proposalDialog.open) proposalDialog.close();
    activeTeamId = null;
    $('prop').focus();
  }

  function renderRecommendations(data) {
    resetRecommendations();
    const recommendations = Array.isArray(data.recommendations) ? data.recommendations.slice(0, 5) : [];
    if (data.model && typeof data.model.name === 'string' && typeof data.model.version === 'string') {
      $('team-smart-schedule-model-name').textContent = data.model.name + ' · version ' + data.model.version;
      $('team-smart-schedule-model').hidden = false;
    }
    if (!recommendations.length) {
      setSmartStatus(data.warnings?.[0] || 'No feasible times were found for this team.', true);
    } else {
      setSmartStatus('Choose one of the top ' + recommendations.length + ' ranked times.');
      recommendations.forEach((item, index) => {
        const row = document.createElement('li');
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'team-smart-schedule-option';
        option.setAttribute('aria-label', 'Choose recommendation ' + (index + 1) + ': ' + item.weekday + ', ' + item.start_time + ' to ' + item.end_time);
        const rank = document.createElement('span');
        rank.className = 'team-smart-schedule-rank';
        rank.textContent = String(index + 1).padStart(2, '0');
        rank.setAttribute('aria-hidden', 'true');
        const slot = document.createElement('span');
        slot.className = 'team-smart-schedule-slot';
        const title = document.createElement('strong');
        title.textContent = $('team-smart-title').value.trim() || item.weekday;
        const time = document.createElement('span');
        time.textContent = item.weekday + ' · ' + item.start_time + '–' + item.end_time + ' · ' +
          ($('team-smart-modality').value === 'online' ? 'Online' : 'Onsite');
        slot.append(title, time);
        const score = document.createElement('span');
        score.className = 'team-smart-schedule-score';
        score.textContent = Number.isFinite(item.score) ? 'Score ' + item.score.toFixed(3) : 'Ranked';
        const choose = document.createElement('span');
        choose.className = 'team-smart-schedule-choose';
        choose.textContent = 'Choose';
        option.append(rank, slot, score, choose);
        option.addEventListener('click', () => {
          $('proposal-title').value = $('team-smart-title').value.trim();
          $('proposal-modality').value = $('team-smart-modality').value;
          $('proposal-weekday').value = item.weekday;
          $('proposal-start').value = item.start_time;
          $('proposal-end').value = item.end_time;
          setProposalStatus('Recommended time selected. Review the weekly block before proposing it.');
          smartDialog.close();
          $('proposal-start').focus();
        });
        row.appendChild(option);
        $('team-smart-schedule-options').appendChild(row);
      });
    }
    if (data.warnings?.length) {
      $('team-smart-schedule-warnings').textContent = data.warnings.join(' ');
      $('team-smart-schedule-warnings').hidden = false;
    }
  }

  async function requestRecommendations() {
    if (smartGenerateButton.disabled || !activeTeamId) return;
    const title = $('team-smart-title').value.trim();
    const modality = $('team-smart-modality').value;
    const durationHours = Number($('team-smart-duration').value);
    const type = $('team-smart-type').value;
    if (!title) {
      setSmartStatus('Enter a title before requesting recommendations.', true);
      $('team-smart-title').focus();
      return;
    }
    if (!['onsite', 'online'].includes(modality)) {
      setSmartStatus('Choose onsite or online before requesting recommendations.', true);
      $('team-smart-modality').focus();
      return;
    }
    if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 3) {
      setSmartStatus('Choose a duration from 1 to 3 hours.', true);
      $('team-smart-duration').focus();
      return;
    }
    if (!['project', 'event', 'meeting'].includes(type)) {
      setSmartStatus('Choose Project, Event, or Meeting.', true);
      $('team-smart-type').focus();
      return;
    }

    const controller = new AbortController();
    recommendationRequest = controller;
    resetRecommendations();
    setRecommendationBusy(true, controller);
    setSmartStatus('Finding the top five times across schedules shared with this team…');
    try {
      const data = await api('/teams/' + encodeURIComponent(activeTeamId) + '/recommendations', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({ meeting: { duration_minutes: durationHours * 60, modality, type }, limit: 5 })
      });
      if (recommendationRequest === controller) renderRecommendations(data);
    } catch (error) {
      if (error.name !== 'AbortError' && recommendationRequest === controller) {
        setSmartStatus(error.message + ' Please retry.', true);
      }
    } finally {
      if (recommendationRequest === controller) {
        recommendationRequest = null;
        setRecommendationBusy(false);
      }
    }
  }

  $('prop').addEventListener('click', openProposalDialog);
  $('team-smart-schedule-open').addEventListener('click', openSmartDialog);
  $('team-smart-schedule-generate').addEventListener('click', requestRecommendations);
  $('team-smart-schedule-back').addEventListener('click', closeSmartDialog);
  $('team-smart-schedule-back-footer').addEventListener('click', closeSmartDialog);
  $('team-smart-schedule-cancel').addEventListener('click', cancelProposal);
  $('team-proposal-close').addEventListener('click', cancelProposal);
  $('team-proposal-cancel').addEventListener('click', cancelProposal);
  smartInputs[0].addEventListener('input', () => {
    $('proposal-title').value = smartInputs[0].value;
    setRecommendationBusy(false);
    if (!recommendationRequest) setSmartStatus(smartInputs[0].value.trim() ? 'Choose a duration and type, then show the top five times.' : 'Enter a title to unlock recommendations.', !smartInputs[0].value.trim());
  });
  smartInputs[1].addEventListener('change', () => {
    $('proposal-modality').value = smartInputs[1].value;
    setRecommendationBusy(false);
    if (!recommendationRequest) setSmartStatus(smartInputs[1].value ? 'Choose a duration and type, then show the top five times.' : 'Choose a modality to unlock recommendations.', !smartInputs[1].value);
  });
  smartInputs[2].addEventListener('change', () => {
    if (!recommendationRequest) setSmartStatus('Choose a meeting type, then show the top five times.');
  });
  smartInputs[3].addEventListener('change', () => {
    if (!recommendationRequest) setSmartStatus(smartInputs[3].value ? 'Show the top five ranked times.' : 'Choose Project, Event, or Meeting.', !smartInputs[3].value);
  });

  smartDialog.addEventListener('cancel', abortRecommendations);
  smartDialog.addEventListener('click', event => {
    if (event.target === smartDialog) closeSmartDialog();
  });
  smartDialog.addEventListener('close', () => {
    if (proposalDialog.open) $('team-smart-schedule-open').focus();
  });
  proposalDialog.addEventListener('cancel', () => {
    abortRecommendations();
    if (proposalRequest) proposalRequest.abort();
    activeTeamId = null;
  });
  proposalDialog.addEventListener('click', event => {
    if (event.target === proposalDialog) cancelProposal();
  });
  proposalDialog.addEventListener('close', () => {
    if (proposalRequest) {
      proposalRequest.abort();
      proposalRequest = null;
    }
    activeTeamId = null;
  });

  proposalForm.addEventListener('submit', async event => {
    event.preventDefault();
    const memberCount = Number($('prop').dataset.memberCount);
    if (!Number.isFinite(memberCount) || memberCount < 2) {
      setProposalStatus('At least two team members are required to make a proposal.', true);
      return;
    }
    if (!activeTeamId || proposalRequest || proposalConflictConfirmationPending) return;
    if (!proposalForm.reportValidity()) return;
    const start = $('proposal-start').value;
    const end = $('proposal-end').value;
    if (end <= start) {
      setProposalStatus('End time must be later than start time.', true);
      $('proposal-end').focus();
      return;
    }
    const conflicts = typeof window.getTeamProposalConflicts === 'function'
      ? window.getTeamProposalConflicts(activeTeamId, $('proposal-weekday').value, start, end)
      : [];
    if (conflicts.length) {
      const names = conflicts.join(', ');
      const message = 'This slot overlaps with a shared schedule slot for ' + names + '. Do you still want to propose it?';
      proposalConflictConfirmationPending = true;
      $('team-proposal-submit').disabled = true;
      const approved = await confirmProposalConflict(message);
      proposalConflictConfirmationPending = false;
      if (!approved || !proposalDialog.open || !activeTeamId) {
        $('team-proposal-submit').disabled = false;
        $('team-proposal-submit').textContent = 'Propose';
        return;
      }
    }
    const controller = new AbortController();
    proposalRequest = controller;
    $('team-proposal-submit').disabled = true;
    $('team-proposal-submit').textContent = 'Sending proposal…';
    setProposalStatus('Sending your weekly block to the team…');
    const teamId = activeTeamId;
    try {
      await api('/teams/' + encodeURIComponent(teamId) + '/proposals', {
        method: 'POST',
        signal: controller.signal,
        body: JSON.stringify({
          title: $('proposal-title').value.trim(),
          weekday: $('proposal-weekday').value,
          modality: $('proposal-modality').value,
          start_time: start,
          end_time: end,
          description: $('proposal-description').value.trim()
        })
      });
      proposalRequest = null;
      proposalDialog.close();
      window.dispatchEvent(new CustomEvent('schedula:team-proposal-created', { detail: { teamId } }));
    } catch (error) {
      if (error.name !== 'AbortError' && proposalRequest === controller) {
        if (/^schedule conflict:/i.test(error.message) && typeof window.errorPopup === 'function') {
          window.errorPopup(escapePopup(error.message), 'Schedule conflict');
        } else {
          setProposalStatus(error.message, true);
        }
      }
    } finally {
      if (proposalRequest === controller) proposalRequest = null;
      $('team-proposal-submit').disabled = false;
      $('team-proposal-submit').textContent = 'Propose';
    }
  });
});
