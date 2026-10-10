FROM valkey/valkey:8-alpine

# Copy industry-grade production configuration
COPY valkey.conf /usr/local/etc/valkey/valkey.conf

EXPOSE 6379

CMD ["valkey-server", "/usr/local/etc/valkey/valkey.conf"]
