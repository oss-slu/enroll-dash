FROM postgres:17-alpine

RUN apk add --no-cache bash

# The application database is initialized from the latest lite dump found in the
# mounted dump directory, then the application role is granted access by the
# shared setup.sql. acs-lite-init is run as an executable .sh file by the
# official entrypoint on first initialization.
COPY scripts/db/setup.sql /docker-entrypoint-initdb.d/010-setup.sql
COPY scripts/db/acs-lite-init /docker-entrypoint-initdb.d/020-acs-lite-init.sh

RUN chmod 0755 /docker-entrypoint-initdb.d/020-acs-lite-init.sh
