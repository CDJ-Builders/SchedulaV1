# Admin API

All endpoints below are mounted under `/api/admin`, require an existing bearer access token, revalidate the user's PostgreSQL role per request, set `Cache-Control: no-store`, and use the existing `{ "error": "..." }` error format. A request ID is returned in `X-Request-ID` and in error bodies.

## Access and metadata

### `GET /meta`

Returns the current role and only the privacy-approved capabilities. The current general-data resource list is empty because no safe general-purpose CRUD resource exists in the schema.

```json
{
  "role": "developer",
  "environment": "production",
  "resources": [],
  "capabilities": {
    "dashboard": true,
    "health": true,
    "diagnostics": true,
    "audit": true,
    "generalDataCrud": false,
    "userRoleManagement": false
  }
}
```

## Read-only user configuration

These endpoints are available to `developer` and `super_admin` only. Each directory or detail request creates an audit record in the same transaction as its database reads. Lists are paginated (25 by default, maximum 100) and searchable by email, display name, or UID.

- `GET /users?page=1&limit=25&q=<email|name|uid>` — account UID, email, role, status, creation/update timestamps, and counts indicating configured personal schedules, entries, and preferences.
- `GET /users/:id` — account, profile, preferences, personal schedules and their saved context, and personal schedule entries.

Soft-deleted accounts and records remain visible for retention and recovery context. Team/group records and authentication data (password hashes, tokens, reset secrets) are not returned. Configuration content is recursively redacted for credential-like fields and values before serialization.

### `PATCH /access/users/:id/role`

Super admin only. Requires current password in the JSON body. Allowed roles: `user`, `developer`, `super_admin`. Self-demotion and demotion of the last active super admin return 409.

```json
{ "password": "current password", "role": "developer" }
```

Returns `{ "id": "...", "role": "developer" }`. The password is never returned or audited.

## Dashboard and health

- `GET /dashboard?range=7d|30d|90d` — bundled overview, time series, and breakdowns. Individual panel failures are returned alongside successful panels so the dashboard can render partial results. Health is loaded separately so dependency checks do not delay the charts.
- `GET /stats/overview?range=7d|30d|90d`
- `GET /stats/timeseries?metric=signups|schedules_created|entries_created|requests|errors|smart_schedule_calls&range=7d|30d|90d&interval=day|hour`
- `GET /stats/breakdown?metric=users_by_role|entries_by_modality|top_routes|top_error_routes`
- `GET /health`

Stats are aggregated in SQL and overview responses are cached in memory for 30 seconds. Values lacking a source signal return `null` or an empty series with a reason. Schedule and user breakdowns return counts only, not individual records.

Health includes API process, PostgreSQL connectivity/pool and provider diagnostics, SchedulaML, and configured SMTP reachability. Optional catalog diagnostics report `degraded` when provider permissions do not expose them. A stopped database reports `down`; an unreachable ML service reports `down`.

## Audit and diagnostics

- `GET /audit?page=1&limit=25&actor=<uuid>&resource=<name>&action=<name>&from=<ISO-8601>&to=<ISO-8601>`
- `GET /logs/errors?page=1&limit=25&route=<normalized-route>&from=<ISO-8601>&to=<ISO-8601>`
- `GET /metrics/requests?page=1&limit=25&route=<normalized-route>&from=<ISO-8601>&to=<ISO-8601>`

Page size is capped at 100. Audit and error endpoints return `has_more` for accurate previous/next controls; the dashboard shows 24-hour counts and links to the paginated logs. Audit tables allocate columns for timestamp, action, resource, actor, and change data. Error tables allocate columns for timestamp, route, message, and stack; long values wrap or scroll inside the table card. Audit before/after JSON is redacted. Error records include request ID and normalized route, omit user ID/request body, and are retention-pruned. Request metrics are per-minute normalized route/status rollups.

## Maintenance

Both actions are super-admin only, rate-limited, and require current password. Each successful action writes one audit record in the same transaction.

- `POST /maintenance/prune-logs` — applies configured audit/error/metrics retention.
- `POST /maintenance/clear-expired-sessions` — deletes expired/revoked refresh-token rows and expired/used reset-token rows.

Body: `{ "password": "current password" }`. There is no arbitrary SQL endpoint and no generic personal/team CRUD API.
