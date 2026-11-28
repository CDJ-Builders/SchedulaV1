Historical snapshot (2026-10-19). Files named here may no longer exist.

# Schedula Refactor Audit

**Phase:** 0 - Reconnaissance
**Date:** 2026-10-19
**Scope:** Read-only codebase inventory plus this audit document. No runtime code, schema, seed, or deployment files were changed in Phase 0.

## Executive Summary

The repository is a static HTML/CSS/vanilla JavaScript frontend backed by a modular Node.js/Express API and PostgreSQL. The API is already split into `config/`, `middleware/`, `routes/`, `services/`, and `utils/`; `backend/db-server.js` composes the application and is not monolithic.

The current runtime still models an academic catalog rather than a generic schedule product. `PROGRAM`, `TERM`, `COURSE`, `COURSE_TERM`, `PROFESSOR`, and `COURSESLOT` are the primary domain model. `SCHEDULE` stores a JSONB list of course/slot objects and derives display data through course joins. The setup/profile flows require program/year/semester selection, and the builder and plotter carry course, unit, professor, room, curriculum, and regular/irregular assumptions.

The smallest credible refactor boundary is to retain authentication, account/profile infrastructure, generic schedule CRUD concepts, overlap detection, time parsing, browser routing, visualization/export, and centralized middleware while replacing the academic catalog, term selection, course-slot joins, and academic admin screens with schedules/events/preferences/availability.

## Turnover Document Findings

The requested `progress.md` did not exist. The historical report referred to uppercase `PROGRESS.md`, which was read at the time as the turnover source of truth.

Relevant current statements:

- The stated goal is to transition Academic Schedule Builder into Schedula and remove Kubernetes integrations.
- The document says the smart-scheduling MVP is implemented and users can define blocked times to prevent conflicting course additions.
- Its checklist marks database, frontend availability/preferences, backend smart scheduling, and handoff work complete.

Conflicts with the current prompt:

- The turnover document still describes a simple MVP around blocked times and conflicting **course** additions, while this prompt requires a general-purpose, team-oriented schedule builder with generic events and a future-ready multi-user/team schema.
- It treats the current academic schema as reusable design, while this prompt explicitly removes academic entities and requires new generic tables, UUID keys, soft deletes, UTC `timestamptz`, event recurrence, availability, and future group sharing.
- It referenced Kubernetes removal, but the workspace listing did not include a `k8s/` directory; the historical `CODEX.md` also documented one. This was recorded for verification during cleanup.
- The handover says MVP-ready, but the current UI/API still exposes academic resources and the current database bootstrap only auto-initializes refresh tokens. There is no migration runner or end-to-end verification command documented.
- The turnover document mentioned `NEW_PRD.md`; `PRD.md` was treated as the product requirements document at the time.

These are recorded as conflicts only. They are not silently resolved in Phase 0.

## Repository Map

### Database and deployment

- `backend/sql/1setup.sql`: current schema and indexes. Creates uppercase academic tables, authentication token tables, `SCHEDULE`, and the single JSONB `USER_PREFERENCES` blocked-time field.
- `backend/sql/1terms.sql`: academic program and term seed data.
- `backend/sql/2users.sql`: user/profile seed data, including DLSU-D email addresses, academic term assignment, and development credentials.
- `backend/sql/3professors.sql`: professor seed data.
- `backend/sql/4courses.sql`: course, course-term, and course-slot seed data with academic codes, instructors, and rooms.
- `backend/sql/Dockerfile`: SQL image packaging; reusable container boundary, but its copied/ordered SQL inputs will need to match the new migration plan.
- No migration runner is present. SQL files appear to depend on ordered initialization.
- No `k8s/` directory was present, although deployment references remained in the historical `CODEX.md` and generated/history documentation.

### Backend runtime

- `backend/db-server.js`: Express app composition, CORS, compression, rate limit, JSON parsing, router mounting, optional static serving, error middleware, and startup. Generic infrastructure; route names/mounts need updating.
- `backend/config/env.js`: dotenv loading and JWT, encryption, SMTP, port, and static-serving configuration. Mostly reusable; stale deployment/provider assumptions should be checked in Phase 4. There is no committed `.env.example` visible in the workspace map.
- `backend/config/database.js`: PostgreSQL pool and refresh-token auto-initialization. Reusable connection/shutdown layer, but current initialization references legacy uppercase auth table names and is not a generic migration system.
- `backend/middleware/auth.js`: JWT authentication and `Admin` role lookup in `USER_CREDENTIALS`. Reusable concept; role/permission model needs to become compatible with group memberships and future RLS decisions.
- `backend/middleware/validation.js`: shared email/string validation. Reusable, but event/profile/preferences validation must be added without making optional event fields required.
- `backend/middleware/errorHandler.js`: centralized error middleware. Reusable.
- `backend/utils/asyncHandler.js`: reusable async route wrapper.
- `backend/utils/crypto.js`: password encryption helper. Authentication support is reusable, but reversible password storage was recorded as a security risk in the historical `CODEX.md`.
- `backend/utils/email.js`: password reset email and development fallback. Reusable; no academic dependency.
- `backend/utils/helpers.js`: debug and `parseTimeToMins` helper. Time parsing is reusable, while hardcoded academic hours in callers are not.

### Backend routes and services

- `backend/routes/auth.js`: signup, login, refresh, logout, forgot-password, and reset-password. Reusable authentication routes; error handling is locally duplicated despite centralized middleware.
- `backend/services/authService.js`: credential creation/login, JWT and refresh token rotation, password reset. Reusable auth service; SQL table names are legacy and password handling should be revisited separately from domain refactor.
- `backend/routes/user.js`: academic `/term` POST/GET, session, profile update/delete, and `/preferences` blocked-times endpoints. Session/profile/delete are reusable. `/term` is academic-only. `/preferences` is a partial generic starting point but currently stores only `blockedTimes`.
- `backend/services/userService.js`: `saveTerm`, `getTerm`, `getSession`, `updateProfile`, `deleteProfile`, `getUserPreferences`, `updateUserPreferences`. `saveTerm` and `getTerm` are academic-only; profile/session/delete are reusable; preferences must generalize to typed/structured user preferences and availability.
- `backend/routes/courses.js`: `/courses`, `/schedule` GET/PUT/DELETE, course-slot removal, and schedule deletion. The schedule CRUD concept is reusable, but the route file and service contract are course-shaped and must become generic event/schedule resources. No course/professor/room route may remain after Phase 2.
- `backend/services/courseService.js`: `getCourses`, `getSchedule`, `saveSchedule`, `removeCourseFromSchedule`, `deleteSchedule`. `getCourses` and all course-slot hydration are academic-only. Schedule persistence is reusable only after replacing JSONB course lists with generic schedule/event ownership and overlap logic.
- `backend/routes/programs.js` and `backend/services/programService.js`: public program listing and cache. Academic-only and removable once setup no longer selects programs.
- `backend/routes/admin.js`: admin CRUD for programs, terms, courses, professors, course slots, users, and schedules. Only user administration, schedule administration, and the admin authorization boundary are reusable. Academic resource routes must be removed/replaced.
- `backend/services/adminService.js`: academic program/term generation and CRUD, academic users with `termid`, course/course-term CRUD, professor CRUD, course-slot time validation and CRUD, and schedule listing/deletion. The user/admin role operations and generic administrative pagination pattern can be reused; academic functions and 7 AM/8 PM assumptions must be removed or generalized.

### Frontend pages and scripts

- `index.html`: landing copy contains academic schedule/course language. Shell and branding can remain; copy must become generic.
- `pages/home.html`: dashboard copy says academic planning. Dashboard navigation cards are reusable; text is academic.
- `pages/setup.html` and `frontend/scripts/setup.js`: required onboarding for full name, program, year level, and semester; calls `/programs` and `/term`. Entire flow is academic-only and should become generic profile/preferences setup or be removed if not needed.
- `pages/builder.html`: page shell, schedule selector, save/delete controls, and import table are reusable. Import table and labels are course-specific: Code, Name, Units, Teacher, Room, Day, Start, End. Inline dropdown helper is reusable UI behavior.
- `frontend/scripts/classes.js`: `Professor`, `CourseSlot`, and `Course` are academic data classes. Replace with generic event/domain objects; do not add a parallel abstraction unless the existing builder requires one.
- `frontend/scripts/subjects.js`: academic builder coordinator. Academic symbols and behavior include `getTermData`, `clearTermCache`, course state, `loadAvailableCourses`, `displayAvailableCourses`, `addAvailableCourse`, unit totals, regular/irregular status, course-code/name/teacher/room/unit inputs, `checkScheduleConflict`, `removeManualCourse`, `removeCourse`, and `loadUserSchedule`. `doTimesOverlap`, schedule switching, save/delete wiring, escaping, and generic conflict presentation are reusable.
- `pages/plotter.html` and `frontend/scripts/plotter.js`: visualization and PNG export are reusable. Academic UI and logic include hide-professor, hide-subject-code/name, hide-room controls, course/teacher fallback labels, `course.courseslot_id`, six-day Monday-Saturday grid, 7 AM origin, and `plotBlock` fields named code/name/teacher. The renderer should target generic event fields and configurable recurrence/date behavior later.
- `pages/profile.html` and `frontend/scripts/profile.js`: credential editing, password visibility, account deletion, and availability UI are reusable. The right-hand academic selection panel, program/year/semester state, `/term` calls, course-selection local storage, and academic labels are academic-only. Current availability UI is a useful starting point but sends blocked times through generic `/preferences` only.
- `frontend/scripts/auth.js`: token/session handling, route guards, refresh, logout, and header population are reusable. Password reset DOM references are not domain-specific despite search hits.
- `frontend/scripts/utils.js`: API-base detection, escaping, and time conversion are reusable. Production URL is a placeholder and deployment behavior needs a later decision.
- `frontend/scripts/popup.js`, `theme.js`, and `footer.js`: generic interaction/theme/footer infrastructure. `footer.js` has legal/about copy only; no runtime academic model dependency.
- `frontend/css/main.css`, `landing.css`, `dashboard.css`, `chrome.css`, `profile.css`, `builder.css`, `plotter.css`, and `admin.css`: visual infrastructure can be retained. Shared header and footer styles now live together in `chrome.css`. Academic selectors and labels are concentrated in `builder.css`, `profile.css`, `plotter.css`, and admin styles used by academic tabs; remove orphaned selectors after markup changes. Existing styling includes glass-like variables/copy that should be compared with the prompt's minimal visual constraint during Phase 3.
- `admin/admin.html`: generic admin shell, auth wiring, pagination container, modal, and schedules tab are reusable. Programs, terms, courses, professors, course slots tabs/filters/tables are academic-only. Schedule table currently displays total units and regular/irregular academic status.
- `admin/admin.js`: generic auth guard, pagination primitives, modal lifecycle, escaping, time parsing, and fetch/render patterns are reusable. Academic cache variables, tab state, renderers, filters, dependency loading, form generation, and CRUD dispatch for programs/terms/courses/professors/course slots are academic-only. User rows expose assigned term; schedule rows expose units and regular status.

## Academic Domain Inventory

### Tables and relationships

Current tables from `backend/sql/1setup.sql`:

- `USER_CREDENTIALS`: `UserID`, `UserEmail`, `UserPassword`, `UserAccess`, `CreatedAt`. Identity/auth is reusable, but naming and integer serial key conflict with the requested UUID model.
- `PROGRAM`: `ProgramID`, `ProgramName`, `TotalYears`, `SemesterType`, `DefaultUnits`. Entirely academic.
- `TERM`: `TermID`, `ProgramID`, `YearLevel`, `Semester`, `ReqUnits`. Entirely academic.
- `USER_PROFILE`: `UserID`, `UserName`, `TermID`. Profile is reusable; `TermID` is academic and must be removed. `UserName` should become a generic display name, with timezone/locale/avatar/working-hours fields planned.
- `COURSE`: `CourseCode`, `CourseName`, `CourseUnits`. Entirely academic; course code/name/units must not become required generic event fields.
- `COURSE_TERM`: `CourseCode`, `TermID`. Entirely academic join table.
- `PROFESSOR`: `ProfID`, `ProfName`, `ProfDepartment`. Entirely academic instructor entity.
- `COURSESLOT`: `CourseSlotID`, `CourseCode`, `ProfID`, `StartTime`, `EndTime`, `ScheduleDay`, `RoomCode`. Academic slot entity; generic events should use `title`, UTC timestamps, separate timezone, optional free-text/URL location, and optional participants.
- `SCHEDULE`: `ScheduleID`, `UserID`, `ScheduleName`, `ScheduleList`, `TotalUnits`, `Regular`, `CreatedAt`, `UpdatedAt`. Container concept is reusable; `UserID` needs future `owner_user_id`, `group_id`, soft delete, and UUIDs. `ScheduleList`, `TotalUnits`, and `Regular` encode the old course model and should be replaced by event rows/status fields.
- `PASSWORD_RESET_TOKEN`: auth support is reusable; names/types/key style need migration alignment.
- `REFRESH_TOKENS`: auth support is reusable; names/types/key style need migration alignment.
- `USER_PREFERENCES`: `UserID`, `BlockedTimes`, `UpdatedAt`. The preference concept is reusable but the one JSONB blocked-time field is insufficient for preferred times, buffer, modality, default view, notifications, and SchedulaML feature inputs.

Current indexes are all academic or legacy naming: `idx_term_programid`, `idx_user_profile_termid`, `idx_course_term_termid`, `idx_courseslot_coursecode`, `idx_courseslot_profid`, `idx_schedule_userid`, and auth token indexes.

### Seed data and hardcoded assumptions

- `1terms.sql` hardcodes CS/IT programs, year levels, semester numbers, and required units.
- `2users.sql` hardcodes DLSU-D addresses, named sample people, `CS4` term assignment, admin email, encrypted development passwords, and roles.
- `3professors.sql` hardcodes professor names and Computer Science/Information Technology departments.
- `4courses.sql` hardcodes CS/IT/GEN course codes, course names, units, term mappings, professor IDs, weekday patterns, 7 AM-to-8 PM-style times, and room/lab codes.
- `backend/services/adminService.js` generates terms from program years/semester type and validates slots against 7 AM and 8 PM boundaries.
- `frontend/scripts/plotter.js` assumes Monday-Saturday and a 7 AM grid origin.
- `frontend/scripts/subjects.js` assumes required units and a regular/irregular academic schedule distinction.
- `README.md`, `PRD.md`, `public/SchedulaProposal.md`, `public/SchedulaRequirements.md`, `public/SchedulaSCRUM.md`, `public/TODO.md`, and `index.html` contain academic product language. These are documentation/copy surfaces, not all runtime blockers, but Phase 4 must resolve or justify every required search hit.
- `graphify-out/` is generated output and contains stale academic labels and source paths from a previous `asb-main` location. It should not be treated as runtime ownership; regenerate or explicitly exclude it during cleanup.

### Academic routes and API payloads

- `GET /api/programs`
- `POST /api/term`
- `GET /api/term`
- `GET /api/courses`
- Admin `GET/POST/PUT/DELETE /api/admin/programs`
- Admin `GET/POST/PUT/DELETE /api/admin/terms`
- Admin `GET/POST/PUT/DELETE /api/admin/courses`
- Admin `GET/POST/PUT/DELETE /api/admin/professors`
- Admin `GET/POST/PUT/DELETE /api/admin/courseslots`
- `DELETE /api/schedule` currently accepts `courseslot_id` and `schedule_id`.
- `GET/PUT/DELETE /api/schedule` currently accepts `schedule_list`, `total_units`, `regular`, and course-slot-shaped JSON.

## Reuse Map

### Keep as-is or adapt lightly

- Express app composition and router/service/middleware directory structure.
- PostgreSQL pool, graceful shutdown, parameterized `pg` queries, async route wrapper, centralized error middleware, CORS/compression/rate limiting after policy review.
- Authentication flow, token refresh/logout/reset routes, route guards, shared API configuration, HTML escaping, popup/theme/footer infrastructure.
- User account lifecycle, profile editing shell, account deletion behavior, admin authorization concept, and pagination/modal patterns.
- Schedule container idea, schedule selection/switching, save/delete workflow, overlap predicate (`doTimesOverlap`), time parsing helper, visual timetable canvas, color controls, and PNG export.
- Existing page shell, navigation, branding, and CSS organization, after academic labels and orphan selectors are removed.

### Rename/generalize

- `courseService` -> schedule/event service; `/courses` route removed rather than aliased.
- `SCHEDULE` -> generic `schedules` container with UUID ownership, group-ready ownership, context, timestamps, and soft deletion.
- JSONB course list -> `events` rows with required title/start/end/timezone/owner and nullable optional fields.
- `Course`/`CourseSlot`/`Professor` -> generic event/participant representations. Do not preserve academic classes under generic names if their required fields remain academic.
- blocked times -> user-level `availability_blocks`, with preference fields separated from free/busy data.
- profile `UserName` -> display name plus requested timezone/locale/avatar/working hours.
- plotter “course block” -> event block; code/name/teacher/room toggles -> title/description/location/participant or configurable display fields.
- admin academic tabs -> generic users, schedules/events, availability, and preferences views only if an admin surface remains in first cut.

### Remove rather than preserve

- Programs, terms, course catalog, course-term mappings, professors/instructors, course slots, unit totals, curriculum setup, semester selection, enlistment/enrollment semantics, regular/irregular status, hardcoded DLSU-D data, and academic seed records.
- Dead public program endpoint and admin CRUD for removed entities.
- `getCourses`, `saveTerm`, `getTerm`, program/term generation, course/professor/course-slot service methods, and corresponding UI filters/forms.

## Known Risks and Open Decisions for Later Phases

- Existing auth uses reversible AES password encryption and even returns a decrypted password from `getSession`; this is a security concern but is separate from the domain migration and must not be silently expanded during Phase 0.
- Current `db-server.js` starts the server immediately after `initDB()` and has no test/app export boundary, which makes focused route tests harder.
- Current SQL is not idempotent as a complete ordered migration: `CREATE TABLE IF NOT EXISTS` does not transform existing academic tables, and seed inserts can fail or preserve old data. Phase 1 must define ordered reversible migrations and a clean replacement path.
- Existing schedule persistence is JSONB and course-slot keyed; replacing it with normalized events risks data compatibility. The prompt explicitly prefers a no-breaking single-user-to-team transition, but does not require preserving academic MVP data. The plan should state whether old schedules are intentionally discarded in a fresh starter-template database.
- Current time validation is stricter than the requested nullable optional-field rule. Generic events still require core timestamps, but location/modality/category/color/priority/status/recurrence/reminder/notes/participants should not gain accidental validation dependencies.
- Current frontend timetable supports only weekday recurring-looking blocks and no date/timezone/recurrence semantics. RFC 5545 recurrence and exceptions need a clear display strategy.
- Future team permissions cannot be represented by the current Admin/Default global role alone. Phase 1 must choose app-layer authorization, Postgres RLS, or both.
- User prompt requests PostgreSQL in its own container and no app-image coupling. The current repository has SQL and frontend/backend Dockerfiles but no complete current compose/deployment map in the workspace listing; this must be verified in Phase 1/4.

## Phase 0 Exit Criteria

- [x] Read the uppercase turnover file `PROGRESS.md` fully and record its conflicts.
- [x] Map current schema, seeds, backend composition/routes/services/middleware/utils/config, frontend pages/scripts/styles, admin surface, and documentation surfaces.
- [x] Identify academic tables, columns, routes, components, functions, labels, seeds, and hardcoded assumptions.
- [x] Identify reusable scheduling/auth/visualization infrastructure.
- [x] Produce this audit without changing runtime code.

Phase 1 should use this document as the input to `docs/SCHEDULA_DB_PLAN.md`; implementation should wait until that plan is written and reviewed at the end of the database-planning phase.
