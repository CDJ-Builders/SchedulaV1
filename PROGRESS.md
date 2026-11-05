# Schedula  Progress

## Goal


## Completed Tasks


## Next Steps


## Status


## Feature 1

### Builder – weekly mode

- [x] Support weekly schedules only; keep the schedule-type value extensible.
- [x] Replace month/date selection with multi-select weekdays (Mon–Sun).
- [x] Use time-of-day-only start and end inputs in `HH:mm` format.
- [x] Validate end time after start time and require at least one weekday.

### Builder – JSONB payload

- [x] Remove time zone, category, priority, status, recurrence rule, reminder offset, notes, and color from the form, state, payload, validation, and write path.
- [x] Persist only `title`, `description`, `weekdays`, `start_time`, and `end_time` in the existing JSONB context without a schema migration.

### Plotter – JSONB check

- [x] Parse JSONB objects safely, including string values, null/missing configuration, and legacy rows with removed keys.
- [x] Render title, description, start time, and end time for weekly blocks.
- [x] Stop reading removed keys from the plotter.

## Refactor Log

## Current Risks

- The frontend verification covered API-backed workflows; visual browser/PNG verification remains a manual check in the target browser environment.
- Existing unrelated worktree changes were preserved, including edits to this file and deleted legacy documentation.
- Password encryption remains reversible in the existing helper and is outside the current domain migration scope.
