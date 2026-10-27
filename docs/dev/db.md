# Database connection

The API connects to Postgres through one shared pool, defined in
`api/src/db/connect.ts`. That file owns the pool, a small `query` wrapper, and
the startup and shutdown functions. It doesn't build queries or manage
transactions.

```ts
import { closeDB, connectDB, query } from '../../api/src/db/connect';

await connectDB();

const result = await query(
    'select id, address from applicants where cohort = $1',
    [cohort],
);

await closeDB();
```

Pass values in the params array, not inside the statement string. `query` is
generic over the row type, so `query<applicantRow>(...)` returns typed rows.
Use `query` instead of importing `pool` directly.

## Environment variables

`connect.ts` doesn't pass a host, port, user, password, or database name to the
pool. The `pg` driver picks those up from `process.env` on its own, so there
are no credentials in the code. `.env.example` lists them.

`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` are the ones the
API uses. `POSTGRES_USER` and `POSTGRES_PASSWORD` belong to the Postgres
container and are only used to set it up. The API connects as the application
user, not the owner.

Setup lives outside the API: `scripts/setup-env` writes a `.env` with random
passwords, `scripts/db/setup.sql` creates the database and the app user, and
`db.Dockerfile` plus the `db` service in `compose.yaml` run Postgres. `.env`
isn't committed.

## Pool settings

The pool allows 10 connections at once, closes idle ones after 30 seconds, and
throws if it waits more than 5 seconds for a free connection. It also sets
`statement_timeout` to 15 seconds, so Postgres cancels anything slower than
that. `statement_timeout` is spelled with an underscore because it's a Postgres
setting passed through, not a `pg` option.

## Connection lifecycle

`api/src/main.ts` calls `connectDB()` and awaits it before `app.listen()`.
`connectDB` runs `select 1`, so if the database is down or the credentials are
wrong the process exits before the API starts taking requests. On `SIGTERM` it
calls `closeDB()`, which drains the pool.

## Idle connection errors

```ts
pool.on('error', (err) => console.error('Unexpected PG pool error', err));
```

An idle connection can die on its own, for example if Postgres restarts. Node
crashes the process on an `'error'` event with no listener, so this line is
what keeps that from taking the API down. Don't remove it.

## Tests

`api/src/tests/db/connect.test.ts` mocks the `pg` module with
`jest.unstable_mockModule`, so the tests need no database and run in CI as is.
They check what `connect.ts` tells the pool to do: the pool settings, the error
listener, and the three exported functions.

Run them from `api` with `npm test -- src/tests/db/connect.test.ts`.

The pool is built when the module is imported, not when a test runs, and
`jest.config.ts` sets `clearMocks: true`. So the test file saves those
import-time calls in constants at the top. Reading them inside a test would
find the history already cleared.

## Current limitations

`closeDB()` only runs on `SIGTERM`, so Ctrl+C in local development skips the
pool drain. `connect.ts` also doesn't check that the `PG*` variables are set.
If they're missing you get a `pg` connection error later instead of a clear
message at startup.