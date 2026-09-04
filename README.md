# [enroll-dash](https://github.com/oss-slu/enroll-dash.git) | [Open Source with SLU](https://oss-slu.github.io)
**Online tools and dashboards for Saint Louis University's Office of Enrollment**

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
