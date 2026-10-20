FROM postgres:17-alpine

RUN apk add --no-cache bash curl

COPY scripts/db/setup.sql /docker-entrypoint-initdb.d/010-setup.sql
COPY scripts/db/acs-import /usr/local/bin/acs-import
COPY scripts/db/extract-lite-dump /usr/local/bin/extract-lite-dump

RUN chmod 0755 /usr/local/bin/acs-import /usr/local/bin/extract-lite-dump
