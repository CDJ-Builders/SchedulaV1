# Schedula MindLab Smart Scheduling Integration Plan

## Goal

Connect the **Smart Schedule** button in Schedula's schedule builder to Schedula MindLab (SML), so a user can request ranked, feasible times for a meeting and choose which recommendation to add to their schedule. Recommendations must remain suggestions: the user reviews and selects a slot, and Schedula validates conflicts before saving.

## What exists today

- `pages/builder.html` contains `#smart-schedule-btn` next to the weekly-block form.
- `frontend/scripts/schedules.js` currently responds to that button with “Smart Schedule is coming soon.” The builder edits recurring weekly blocks (`weekdays`, `start_time`, `end_time`, `modality`) and persists them through `/api/schedules`.
- The current Node/Express API already has authenticated schedule, event, preference, and availability routes. The schema includes `preferences`, `availability_blocks`, events, and weekly schedule context.
- `C:\Users\Win11\Downloads\sml\SML_SourceCode_Final.ipynb` is a research notebook, not a deployable inference package. It creates candidate meeting slots Monday–Saturday, engineers 33 features from a weekly class grid and preferences, and trains LR, RF, GB, and optional LightGBM models. It saves RF and GB model files, but its demo `get_top_slots()` ranks cached rows from the notebook run; it does not accept an arbitrary live Schedula user request and build features end to end.
- The notebook's research input includes meeting length, modality, and type plus survey preference fields. Schedula's current builder asks the user to enter a weekday and start/end times directly and uses modality values `onsite`/`online`; the newer event schema uses `in_person`/`online`/`hybrid`. These contracts need an explicit mapping.

## Recommended architecture

Keep the browser calling Schedula's authenticated Node API. Add a thin Node endpoint such as `POST /api/schedules/:scheduleId/recommendations`; the Node service verifies ownership, loads that schedule's current weekly events and the user's preferences/availability, then calls a separately deployed, private Python inference service. The Python service returns ranked candidate slots and model metadata. Node validates the response and sends it to the browser. The browser displays options and only writes a slot after the user selects one.

This boundary lets the existing app retain authentication, ownership checks, and persistence while serving the notebook's Python/scikit-learn artifacts without loading Python models in Node. Keep the Python service inaccessible to public clients; only the backend should call it. Do not send user identity or survey labels to the model service when the necessary normalized scheduling features suffice.

## Product behavior to settle in implementation

Treat Smart Schedule as **recommend a time for the meeting described by the form**, rather than automatically replacing the entire schedule. The user should provide a title, duration, modality, and (if used by the model) meeting type. Duration should be explicit because a start/end range is not yet meaningful before a recommendation is selected. Do not require a weekday or start time before requesting options. The recommendation panel should offer a configurable small list (for example, five) of day/start/end choices, make it clear why a candidate is infeasible if one is rejected, and allow the user to apply a selected option back to the builder form for review before adding it.

If the intended feature is instead a full automatic timetable builder or course scheduler, its inputs and output persistence differ substantially; make that a separate product decision before implementation.

## Proposed request/response contract

### Browser to Schedula API

`POST /api/schedules/:scheduleId/recommendations`

Require the normal bearer token. Example request:

```json
{
  "meeting": {
    "duration_minutes": 60,
    "modality": "onsite",
    "type": "event"
  },
  "limit": 5
}
```

The request should not accept authoritative existing events or preferences from the browser. The backend loads these from the owned schedule and user records to prevent forged context. If recommendations should include an unsaved builder draft, accept only the proposed meeting fields and have the backend construct the remaining context from persisted data.

### Schedula API to browser

```json
{
  "recommendations": [
    {
      "weekday": "Tuesday",
      "start_time": "10:00",
      "end_time": "11:00",
      "score": 0.82
    }
  ],
  "model": {
    "name": "schedulaml-rf",
    "version": "<artifact-version>"
  },
  "warnings": []
}
```

`score` should be documented as a relative ranking score, not a calibrated probability, unless calibration is added and evaluated. Return a clear empty-result response when there are no feasible slots. Avoid returning model internals or personally identifiable training information.

## Implementation phases

### 1. Make the model deployable

- Turn notebook transformations into a tested Python inference module: normalize input, construct the 33 features in the exact trained order, enumerate candidates, reject conflicts, score them, and return the top N.
- Persist a single versioned artifact bundle containing model, feature names/order, preprocessing, allowed values, and metadata. Pin Python and package versions. Avoid loading the survey workbook or downloading data at request time.
- Compare LR and RF against the rule baseline using grouped validation, per-fold variability, and feasible-slot checks. Choose the production scorer based on reviewed evidence; the notebook's small exploratory results do not establish production accuracy.
- Correct documentation discrepancies and pin the candidate time grid. The notebook's candidate loop permits slots from 07:00 through the 22:00 boundary, while the SML README describes a 07:00–18:00 grid.
- Add a model card describing training data provenance, intended use, limitations, version, and retraining procedure. Do not package raw survey data with the service.

### 2. Define the live feature contract

- Map Schedula schedule data into the training representation: Monday–Saturday hourly occupancy, online/onsite class indicators, preferred and avoided days/time bins, commute, preferred break, back-to-back tolerance, preferred modality, requested duration, and meeting type.
- Define defaults and missing-value rules for preferences that are absent or unset. The current SQL preference fields do not by themselves guarantee the notebook's complete feature set (for example, preferred break, tolerance semantics, and commute units need confirmation).
- Confirmed scope: only recurring weekly schedule blocks are modeled, all such blocks count as classes, and occupancy is onsite or online. Dated events and active dated busy availability fail closed rather than being projected onto weekly slots. Sunday and out-of-grid weekly periods are excluded; non-hour durations are rejected. Schedule timezone and daylight-saving behavior remain constrained by canonical local-time weekly blocks.
- Map `onsite` to Schedula's event `in_person` where writing events; normalize modality inside the inference adapter rather than changing persisted values implicitly.

### 3. Add the backend integration

- Add an authenticated route under `backend/routes/schedules.js`, following the existing `authenticateToken` pattern.
- In a schedule/recommendation service, verify that the caller owns the schedule, load only that user's schedule/events/preferences/availability, and normalize them into the Python service request.
- Add a configured private inference-service URL, request timeout, bounded payload, response validation, and graceful `503`/timeout behavior. Never expose service credentials in frontend code. Restrict and rate-limit the endpoint appropriately.
- Keep SQL and feature/context assembly out of the route handler. Do not persist generated recommendations as schedule events; persistence happens through the existing event or schedule flow only after user confirmation.

### 4. Connect the builder UI

- Replace the placeholder handler in `frontend/scripts/schedules.js` with a request using the shared API base and bearer token conventions.
- Add pending, empty, error, and retry states; disable duplicate submissions while a request is running.
- Render recommendation choices safely (text content or escaped values), with accessible keyboard interaction and a live status announcement.
- Selecting a choice fills the weekday/start/end fields and preserves the user's entered title, description, and modality. The existing Add block action remains the explicit confirmation step and existing conflict checking remains authoritative.
- If the schedule changed after recommendations were generated, recheck conflicts before applying/saving and ask the user to request fresh options when necessary.

### 5. Deploy and operate

- Deploy the Python inference service alongside the backend with a pinned runtime and versioned model artifact. Configure private service networking, health/readiness checks, resource limits, and secrets through the deployment environment.
- Add model version and inference latency to structured operational logs without logging event descriptions, user preferences, tokens, or raw schedule data.
- Provide a safe fallback message when ML is unavailable. A rule-based recommendation path may be used only after it is implemented and kept behaviorally consistent; never silently label rule output as model output.
- Document artifact replacement and rollback. Keep the previous artifact available so a new model can be rolled back without a frontend/database migration.

## Validation and acceptance criteria

- Feature-generation parity: the live request and notebook/reference pipeline produce the same 33 named features and ordering for fixed fixtures.
- Candidate generation always respects meeting duration, supported weekdays/time grid, existing schedule blocks, and busy availability; no returned recommendation overlaps a known event.
- API rejects unauthenticated requests, unknown schedules, and schedules not owned by the caller; malformed meeting inputs receive actionable 4xx responses.
- Builder shows loading, results, no-results, and service-error states; applying a result fills the form; adding it still uses existing validation and persistence behavior.
- Test short and long meeting durations, each modality/type, empty preferences, dense schedules, no feasible slot, backend timeout, and stale recommendations.
- Measure ranking quality on held-out respondent/scenario groups and compare with the rule baseline before enabling the model broadly. Track user acceptance/selection only with appropriate privacy and consent controls.

## Key risks and decisions

1. **Research-to-production gap:** the current inference helper is not an online inference pipeline. Refactoring and parity checks are prerequisites to connecting the button.
2. **Data mismatch:** survey-trained features and Schedula's stored preferences/events are not yet proven semantically equivalent. Confirm units, day mapping, modality, and missing values before making quality claims.
3. **Limited evidence:** the notebook describes a small dataset and exploratory grouped cross-validation. Treat scores as initial research evidence, not a guarantee for individual users.
4. **Scope:** this plan recommends one meeting at a time. The selectable trained type labels are Project, Event, and Meeting. Recommending a full course timetable requires a different UX, input contract, and result application flow.
5. **Timezone and recurring events:** weekly local-time blocks cannot be naively converted to dated instants without timezone and recurrence rules. Build the model input from the canonical weekly representation and validate any selected slot in that same time basis.

## Suggested delivery order

1. Confirm the one-meeting recommendation behavior and input fields.
2. Extract and version the Python feature/candidate/inference pipeline.
3. Verify feature parity and evaluate against the rule baseline.
4. Implement the private Python service and authenticated Node adapter.
5. Connect and polish the builder interaction.
6. Roll out behind a feature flag, observe errors and user selections, then enable broadly after review.
