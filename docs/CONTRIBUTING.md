# Contributing

## Branches

Use short descriptive branch names with the `codex/` prefix for Codex changes, for example `codex/fix-schedule-export`.

## Verify changes

From `backend/`, run `npm ci` and `npm test`. From `schedulaml/`, run `pytest`. Run `node scripts/check-html-assets.js` from the repository root after frontend asset changes.

## Add a database migration

1. Add the next numbered `NNN_description.up.sql` and matching `.down.sql` under `backend/sql/migrations/`.
2. Keep the down migration as the reverse of the up migration and review both directions.
3. From `backend/`, run `npm run db:build-setup` and commit the generated `backend/sql/1setup.sql` with the migration pair. Never edit `1setup.sql` by hand.

## Frontend cache busting

Use one shared `?v=` value across an HTML page's cache-busted asset references. Bump the page's value on each cache-busting reference together; avoid unrelated descriptive tokens on individual script and stylesheet tags.
