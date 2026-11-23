# SchedulaML Integration Progress

## Scope and constraints

- Implement the Schedula MindLab Smart Schedule integration per `docs/SCHEDULAML_INTEGRATION_PLAN.md` and the user-provided detailed implementation request.
- No Docker. Run the Python inference service as a plain local process.
- Do not modify model artifacts or `features.py` logic. Copy supplied artifacts unchanged and verify SHA-256 using a versioned manifest.
- Service files live at `schedulaml/`; work also covers `backend/` integration files, builder UI files, `docs/`, `.env.example`, `.gitignore`, and this progress file.
- Keep this file current so another agent can resume cleanly.

## Environment finding

- Supplied model runtime: Python 3.13.18, scikit-learn 1.6.1, LightGBM 4.6.0, NumPy 2.4.6, pandas 2.2.3, joblib 1.6.0.
- Host runtime is Python 3.14.5. Project-local `.venv313` uses Python 3.13.13 and all pinned dependencies from `requirements.txt`; Python 3.13.18 was unavailable in the configured interpreter catalog. The provided serialized model tests pass on 3.13.13 with the exact pinned library versions.
- Supplied model files are each under 10 MB (largest: `l1_models.joblib`, 8,728,221 bytes).

## Phases

### Phase 1 — Python inference service

- [x] Copy artifacts unchanged and create checksum manifest.
- [x] Implement schemas, adapter, scorer selection, verified model loading, FastAPI endpoints, docs, and tests.
- [x] Run static compilation and the Python suite under Python 3.13.13 with the exact pinned model libraries.

### Phase 2 — Feature contract

- [x] Inspect SQL schema and map each model field to Schedula data.
- [x] Add preferred-break storage/UI with 60-minute default and 0–6 back-to-back tolerance controls.
- [x] Apply user decisions: all weekly blocks count as classes; types are Project/Event/Meeting; recurring weekly schedules only; onsite/online only; density defaults documented as Light <=5, Medium >5 through 15, Heavy >15 (training labels unverified).

### Phase 3 — Node backend

- [x] Add authenticated recommendation endpoint, feature flag, configuration, normalization, bounded private service call, rate limiting, and response validation.
- [x] Add focused Node tests; all 9 pass.

### Phase 4 — Builder UI

- [x] Add duration and meeting type inputs; connect the button and accessible states.
- [x] Preserve explicit user confirmation and stale-result conflict checks.

### Phase 5 — Tests and validation

- [x] Python adapter/service/synthetic-schedule/golden regression and grid-boundary tests authored for the pinned model runtime.
- [x] Node service tests authored; all 8 pass.
- [x] Python pytest, artifact loading, and golden regression checks on Python 3.13.13 with pinned dependencies (28 pass).
- [x] Manual run checklist and smoke commands documented.

### Phase 6 — Docs

- [x] Model card and service/integration docs, contracts, run/test commands, and artifact rollback.

## Handoffs / decisions needed

- Confirmed by user: preferred break is a per-user preference, added as `preferred_break_minutes` with a 60-minute default; back-to-back tolerance is 0–6 and maps directly.
- Confirmed by user: weekly blocks share class semantics; meeting types are Project, Event, Meeting; scope is recurring weekly schedules; occupancy is onsite or online only. Active dated busy blocks fail closed.
- Current density thresholds in feature code: Light <=5 occupied hours; Medium >5 and <=15; Heavy >15. Training validity remains unverified.
- Current density thresholds in feature code: Light <=5 occupied hours; Medium >5 and <=15; Heavy >15. Training validity remains unverified.
- PostgreSQL migrations 005 and 006 have been applied and verified: preferred break defaults to 60; back-to-back tolerance is constrained to 0–6. No existing preference values were out of range.
- Test environment note: Python 3.13.18 was not available from the interpreter catalog; Python 3.13.13 successfully loads the artifacts using the exact pinned scikit-learn, LightGBM, NumPy, pandas, and joblib versions.
