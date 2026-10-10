FROM postgres:16-alpine

# Copy multi-database initialization and schema seed scripts
COPY init-multi-db.sh /docker-entrypoint-initdb.d/01-init-multi-db.sh
COPY schema-init.sql /docker-entrypoint-initdb.d/02-schema-init.sql

RUN chmod +x /docker-entrypoint-initdb.d/01-init-multi-db.sh

EXPOSE 5432
