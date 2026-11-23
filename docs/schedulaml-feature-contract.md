# SchedulaML Feature Contract

This document maps Schedula's current persistence model to the normalized request consumed by `schedulaml/`. SchedulaML version 1.1.0 accepts a Monday–Saturday hourly grid from 07:00 through 22:00, hourly meeting durations, `Onsite`/`Online` meeting modalities, and the three explicitly selected training labels `Project`, `Event`, and `Meeting`.

## Normalized service request

`POST /rank` receives only:

- `context.occupancy`: one 15-cell list for each of `mon` through `sat`, in hour order 07:00–08:00 through 21:00–22:00. Each cell is exactly `ON`, `OL`, or `OF`.
- `context.preferences`: commute minutes, preferred break minutes, back-to-back tolerance, preferred modality, all six preferred/avoided day flags, and all nine preferred/avoided time-bin flags.
- `context.warnings`: optional bounded warnings from the adapter for excluded or conservatively handled source data.
- `meeting`: whole-hour `duration_minutes`, `modality` (`onsite` or `online`), and `type` (`project`, `event`, or `meeting`).
- `limit`: 1–20, default 5.

The service converts this into every model key read by `features.py`, including day and time preference flags omitted from `feature_schema.json`'s `input_fields`. The service rejects unsupported vocabularies and malformed duration rather than relying on the feature code's silent fallbacks.

## Database and builder mapping

The migration schema is `backend/sql/migrations/001_schedula_schema.up.sql`; active service paths are in `backend/services/scheduleService.js` and `backend/services/userService.js`.

| SML input / feature meaning | Schedula source | Adapter treatment | Status |
| --- | --- | --- | --- |
| `sched_{day}_{hour}00` occupancy; `day_class_hours`, `day_onsite_hours`, gaps, busiest/free day, online adjacent class | `schedule_context.context` weekly blocks (`weekdays`, `start_time`, `end_time`, `modality`) | Every weekly block is treated as a class for model features. Mark touched hours `ON` for `onsite`, `OL` for `online`. A partial hour is conservatively occupied with a warning. Only canonical recurring weekly local-time blocks are modeled; exclude and warn on non-weekly items. | User-confirmed: all recurring weekly blocks count as classes, with no distinction. Hybrid values are unsupported; only onsite/online occupancy is allowed. |
| Same occupancy grid | `events` (`start_at`, `end_at`, `timezone`, `recurrence_rule`, `modality`, `category`) | Dated events are not projected into the weekly grid. Any upcoming event or event with a recurrence rule blocks recommendations with a safe service error until the schedule is represented as canonical recurring weekly blocks. | Current release focuses only on recurring weekly schedules. |
| Occupied time from availability | `availability_blocks` (`start_at`, `end_at`, `timezone`, `availability_type`, no recurrence) | Active dated `busy` blocks block recommendations with a safe service error; they are not projected onto recurring weekly slots. `free` ranges do not occupy cells. | Dated availability has no recurring weekly representation, so it is excluded by failing closed. |
| `PrefMon` … `PrefSat`, `AvoidMon` … `AvoidSat` | Same-named Boolean columns in `preferences`; returned by `getPreferences()` | Copy explicitly to all six day flags. Sunday does not exist in the model; omit Sunday and warn if the source contains a Sunday preference. | Direct match for supported days. |
| `pref_time_{0708…2224}`, `avoid_time_{0708…2224}` | Same-named Boolean columns in `preferences` | Copy all nine flags explicitly, including `2224`, even though the candidate grid ends at 22:00. | Direct match; final bin has no candidate overlap under the version 1.1.0 grid. |
| `Preferred Modality` | `preferences.preferred_modality` (`onsite`, `online`, `no preference`) | Map to exact model spellings `Onsite`, `Online`, `No Preference`. | Direct vocabulary mapping. |
| `Commute` / `commute_min` | `preferences.commute_time` / `commute_time` in `userService.js`; setup/profile forms label it “Estimated commute time (minutes)” | Normalized API expects minutes. Adapter passes hours when minutes are ≤240, otherwise minutes, to compensate for `features.py`'s `<=4` means-hours heuristic. | Unit is confirmed by the current setup/profile UI labels. Values should still be range-checked. |
| `Back-To-Back Tolerance` / `b2b_tolerance` | `preferences.max_back_to_back` | Store values 0–6 and pass directly; the model computes `(6 - value)` in its tolerance penalty. Both profile and onboarding use a horizontal radio group with choices 0–6. | User-confirmed mapping and scale. Backend and UI validation enforce 0–6. |
| `Preferred Break` / `break_shortfall` | `preferences.preferred_break_minutes`; edited on profile and setup/onboarding | Store and send the value in minutes. Database and UI defaults are 60 minutes. | Added by migration `005_preferred_break`. |
| `meeting_length_min` / `meeting_len_h` | Builder form's proposed duration field | Require whole hours, at least 60 minutes and no greater than the 15-hour grid; the meeting must fit at least one valid start. | New UI input. Non-hour values return 422. |
| `meeting_modality`, `meeting_onsite`, `modality_match` | Proposed meeting's builder modality; weekly blocks use `onsite`, `online` | Map only `onsite` to `Onsite` and `online` to `Online`. Reject hybrid or unknown values. | User-confirmed: only onsite/online values are supported. |
| `meeting_type`, `type_project`, `type_event` | Explicit Smart Schedule type choice; trained labels are `Project`, `Event`, `Meeting` | Pass the selected label unchanged. `features.py` has explicit indicator features for Project and Event; Meeting intentionally yields both indicators as zero, consistent with how the supplied training features encoded it. Do not infer from title/category. | User-confirmed labels; Meeting is a known training label. |
| `total_class_hours`, `n_feasible`, `density_tier` | No stored Schedula equivalents; computed by `features.py` | Do not send overrides. The feature code computes from the occupancy grid. | Current thresholds: Light at 5 or fewer total occupied hours, Medium above 5 through 15, Heavy above 15. These thresholds are code defaults and have not been confirmed against training labels. |
| `ScenarioID`, respondent IDs, target labels, `cv_group` | None in live Schedula scheduling data | Never send these fields. | Training/evaluation metadata only. |

## Model feature list

The 33 ordered model features are:

`day_idx`, `is_saturday`, `overlaps_lunch`, `is_morning`, `is_late`, `gap_before`, `gap_after`, `min_gap`, `back_to_back`, `day_class_hours`, `day_is_free`, `day_is_busiest`, `day_onsite_hours`, `meeting_len_h`, `meeting_onsite`, `type_project`, `type_event`, `tier_heavy`, `tier_medium`, `n_feasible`, `total_class_hours`, `pref_day`, `avoid_day`, `pref_time_share`, `avoid_time_share`, `break_shortfall`, `b2b_tolerance`, `b2b_x_tolerance`, `modality_match`, `pref_modality_none`, `commute_min`, `extra_trip_cost`, and `online_next_to_class`.

`feature_schema.json` remains the order authority. The service checks generated DataFrame columns against that list before standalone `gb`/`lgb` inference. The layered model uses the features indirectly through its L1 models.

## Current model semantics

- Every canonical recurring weekly block contributes to class occupancy and class-hour totals.
- Only onsite and online modalities are accepted; hybrid blocks fail closed instead of being mapped to a different modality.
- Dated and non-recurring events are outside the current feature scope and stop recommendation requests when they could conflict.
- Active dated busy availability also stops recommendations instead of being projected onto every matching weekday.
- The model's current density cutoffs are `>5` hours for Medium and `>15` hours for Heavy. Their training validity remains unverified.
