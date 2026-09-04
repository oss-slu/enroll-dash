\set ON_ERROR_STOP on

-- The official Postgres entrypoint provides the application credentials through
-- the standard libpq variables. Other callers can preserve those credentials in
-- APPLICATION_USER and APPLICATION_PASSWORD while using different connection
-- credentials to run this file as the database owner.
\getenv application_user APPLICATION_USER
\if :{?application_user}
\else
    \getenv application_user PGUSER
\endif

\getenv application_password APPLICATION_PASSWORD
\if :{?application_password}
\else
    \getenv application_password PGPASSWORD
\endif

SELECT format(
    'CREATE ROLE %I WITH LOGIN PASSWORD %L',
    :'application_user',
    :'application_password'
)
WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = :'application_user'
) \gexec

SELECT format(
    'ALTER ROLE %I WITH LOGIN PASSWORD %L',
    :'application_user',
    :'application_password'
) \gexec

SELECT format(
    'GRANT ALL PRIVILEGES ON DATABASE %I TO %I',
    current_database(),
    :'application_user'
) \gexec

-- Grant access to every non-system object created during initialization.
SELECT format(
    'GRANT ALL PRIVILEGES ON SCHEMA %I TO %I',
    nspname,
    :'application_user'
)
FROM pg_catalog.pg_namespace
WHERE nspname !~ '^pg_'
    AND nspname <> 'information_schema' \gexec

SELECT format(
    'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I TO %I',
    nspname,
    :'application_user'
)
FROM pg_catalog.pg_namespace
WHERE nspname !~ '^pg_'
    AND nspname <> 'information_schema' \gexec

SELECT format(
    'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I TO %I',
    nspname,
    :'application_user'
)
FROM pg_catalog.pg_namespace
WHERE nspname !~ '^pg_'
    AND nspname <> 'information_schema' \gexec

SELECT format(
    'GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA %I TO %I',
    nspname,
    :'application_user'
)
FROM pg_catalog.pg_namespace
WHERE nspname !~ '^pg_'
    AND nspname <> 'information_schema' \gexec

-- Keep the application role authorized for objects added later by the database
-- owner in existing application schemas.
SELECT format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT ALL PRIVILEGES ON TABLES TO %I',
    current_user,
    nspname,
    :'application_user'
)
FROM pg_catalog.pg_namespace
WHERE nspname !~ '^pg_'
    AND nspname <> 'information_schema' \gexec

SELECT format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT ALL PRIVILEGES ON SEQUENCES TO %I',
    current_user,
    nspname,
    :'application_user'
)
FROM pg_catalog.pg_namespace
WHERE nspname !~ '^pg_'
    AND nspname <> 'information_schema' \gexec

SELECT format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT ALL PRIVILEGES ON ROUTINES TO %I',
    current_user,
    nspname,
    :'application_user'
)
FROM pg_catalog.pg_namespace
WHERE nspname !~ '^pg_'
    AND nspname <> 'information_schema' \gexec
