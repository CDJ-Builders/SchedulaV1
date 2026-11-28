# Architecture

## Frontend

Schedula uses plain HTML pages, global scripts, and CSS files. Scripts load in document order and must be available before scripts that call their globals.

| Page | Main scripts | Main styles |
| --- | --- | --- |
| `index.html` | `landing.js`, popup, footer, and background scripts | `landing.css`, shared theme and chrome |
| `pages/home.html` | `auth.js`, `home.js`, shared navigation scripts | `dashboard.css`, shared theme and chrome |
| `pages/login.html`, `signup.html`, `forgot-password.html` | `auth.js`, `utils.js`, popup and background scripts | `auth.css`, shared theme and chrome |
| `pages/builder.html`, `setup.html` | `schedules.js`, `setup.js`, `scheduleExcel.js`, `timePicker.js` as applicable | `builder.css`, `profile.css`, schedule and shared styles |
| `pages/plotter.html` | `plotter.js`, `plotterModel.js` | `plotter.css`, shared theme and chrome |
| `pages/profile.html` | `profile.js`, `preferences.js` | `profile.css`, shared theme and chrome |
| `pages/teams.html`, `teams-settings.html` | `teams.js`, `teamProposals.js`, `teamsSettings.js`, `teamPreferences.js` as applicable | `teams.css`, `teams-settings.css`, `team-preferences.css` |
| `admin/index.html` | `api.js`, `session.js`, `admin.js`, shared utilities | `admin.css`, background styles |

Check local HTML script and stylesheet references with `node scripts/check-html-assets.js` after changing page assets.

## Backend

`backend/db-server.js` configures Express and mounts the API routers. `backend/config/` loads environment settings, database connections, health thresholds, and retention settings. `backend/middleware/` handles authentication, authorization, validation, request metrics, and error responses. `backend/routes/` defines HTTP endpoints and delegates to `backend/services/`, where domain and database operations live. `backend/utils/` contains shared helpers for email, logging, passwords, and asynchronous handlers.

Database changes are ordered SQL migrations in `backend/sql/migrations/`; `backend/sql/1setup.sql` is generated from them by `npm run db:build-setup` in `backend/`.

## SchedulaML request flow

The recommendation routes call `backend/services/recommendationService.js`. It validates the request, loads and maps the user's or team's persisted weekly schedule and preferences into the model context, and sends the request to `SCHEDULAML_URL` with the optional service key and configured timeout. The Python FastAPI service in `schedulaml/app/main.py` validates the request with `schemas.py`, maps the context through `adapter.py`, and scores candidates with `scoring.py` and the versioned model loader. The backend validates the response before returning recommendations to the browser.
