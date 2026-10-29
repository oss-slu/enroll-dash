# [geo-enricher](https://github.com/oss-slu/geo-enricher.git) | [Open Source with SLU](https://oss-slu.github.io)
**Web tool for enriching datasets with geographic/demographic data provided by the US Census bureau**

## <u>Tech stack:</u>
- ### <u>Frontend</u>
    ### */app*   
    - Typescript 
    - React
    - Vite
    - Nginx

- ### <u>Backend</u>
    ### */api*
    - Typescript
    - NodeJS
    - Express

- ### <u>Database</u>
    - PostgreSQL 17
    - CensusReporter 2024 ACS 5-year data

## Project installation/setup
### 1. Download and install [Docker Desktop](https://www.docker.com/get-started/)
### 2. Clone the repository & open project locally
`git clone https://github.com/oss-slu/enroll-dash.git`<br>`cd enroll-dash`
### 3. Configure the database

Create the environment file with separate random database owner and application
passwords:

```sh
./scripts/setup-env
```

The `.env` file contains the database owner and application credentials. It is
ignored by Git and excluded from Docker build contexts; never commit it.
The setup script refuses to overwrite an existing `.env` file.
`PGDATABASE` controls the name of the database created when the database volume
is initialized. `PGUSER` and `PGPASSWORD` are the less-privileged credentials the
API uses to connect.

### 4. Run project with Docker Compose

The frontend can be served by nginx via the *app* container (production behavior) or with vite's dev server for developers to take advantage of hot reloading.
- #### Use docker frontend:
    - Start frontend and backend containers:<br>`docker compose up --build -d`
    - ***Frontend should now be accessible in your browser at http://localhost:8089***

- #### Run frontend via vite development server:
    - First, ensure [Node JS](https://nodejs.org/en) is installed<br>
    - Run backend container:<br>`docker compose up api --build -d`
    - Run vite dev server:<br>`cd app && npm ci && npm run dev`<br>
    - ***Frontend should now be accessible in your browser at http://localhost:7395***

## Database usage

Start only PostgreSQL and wait for its health check:

```sh
docker compose up --build --detach --wait db
```

Import the 2024 ACS 5-year CensusReporter dump after the database starts:

```sh
docker compose exec db acs-import
```

The import downloads the compressed SQL dump, replaces any prior ACS import,
and restores the data to the `acs` schema. The source dump is large, so the
first import can take a while.

Connect as the application user from inside the container:

```sh
docker compose exec db psql
```

To connect with a locally installed `psql`, export the standard `PG*` variables
from `.env`, then run `psql`. The default host connection is
`localhost:5432`; change `PGPORT` before the first Compose run if that port is
already in use.

### Run the app against a reduced-size database

The full ACS dump is large, but the project only uses a handful of tables. After
the full database (`db`) is running, generate a lite dump and start a small
database for the app:

```sh
./scripts/db/start-app-db
```

This does the following:

1. If no dump exists in `scripts/db/dump`, run `extract-lite-dump` against the
   running `db` service to create `scripts/db/dump/enroll-dash-lite.dump`.
2. Stop `db` (it shares the host port with `db-lite`), then start the `db-lite`
   service, which on first initialization restores that dump into a fresh `acs`
   schema and grants the application role access.
3. Start the `api` and `app` services pointed at `db-lite`.

`db-lite` lives in the `lite` Compose profile, so a plain `docker compose up`
never starts it — start it by name (as `start-app-db` does) or with
`--profile lite`.

You can also extract the dump on its own:

```sh
docker compose exec db extract-lite-dump
```

The dump is written into `scripts/db/dump/` (a bind-mounted directory shared with
the host, so it lands on your machine) as a custom-format `pg_dump` containing
only the `acs` tables listed in `scripts/db/extract-lite-dump`. The metadata
tables `census_table_metadata` and `census_column_metadata` are trimmed to the
kept tables, and `geoheader` is kept whole. `scripts/db/dump` is ignored by Git
and `db-lite`'s data lives in its own named volume.

To keep additional tables, add the base id (without the trailing `_moe`, which
is kept automatically) to the `KEEP_TABLES` array at the top of
`scripts/db/extract-lite-dump`.

### Restore the lite dump

The `db-lite` service restores the dump automatically: on its **first**
initialization (empty data volume), `scripts/db/acs-lite-init` runs
`pg_restore` against the newest `scripts/db/dump/*.dump`, then re-applies
`scripts/db/setup.sql` so the application role gets privileges on the restored
tables. This is what `start-app-db` relies on.

If the `db-lite` data volume already exists, the restore step is skipped because
PostgreSQL only runs its initialization scripts on an empty data directory. To
restore a newer dump, reset the volume first (`--profile lite` selects the
`db-lite` service):

```sh
docker compose --profile lite stop db-lite
docker compose --profile lite rm -f db-lite
docker volume rm enroll-dash_db-lite-data
docker compose --profile lite up --build --detach db-lite
```

You can also restore the dump by hand into any empty database:

```sh
pg_restore --clean --if-exists --no-owner --dbname=enroll_dash scripts/db/dump/enroll-dash-lite.dump
```

The dump carries the `acs` schema definition, so the target database does not
need it pre-created. The dump is produced with `--no-privileges`, so it does not
grant access to your application role. After a manual restore, either connect as
the role that owns the restored tables, or re-apply the grants from
`scripts/db/setup.sql` (as `db-lite` does) so the application role can query the
data.

## File geocoding API

Upload and enrich CSV or Excel datasets, or save a dataset directly. See the
[API route reference](docs/dev/api_routes.md) for every endpoint, parameter, and
response, and the
[file enrichment endpoint contract](docs/dev/geocoder_file_enrichment.md) for
options, limits, export behavior, and session cleanup.
