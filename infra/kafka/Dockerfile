FROM bitnami/kafka:3.7.0

USER root
COPY init-topics.sh /docker-entrypoint-initdb.d/init-topics.sh
RUN chmod +x /docker-entrypoint-initdb.d/init-topics.sh

USER 1001

EXPOSE 9092 9094
