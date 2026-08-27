#!/bin/sh
set -e

PROXY_FILE=/etc/nginx/ollama-proxy.conf

if [ -n "$OLLAMA_UPSTREAM" ]; then
  cat > "$PROXY_FILE" <<EOF
location /ollama/ {
    proxy_pass ${OLLAMA_UPSTREAM}/;
    proxy_http_version 1.1;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
    client_max_body_size 64m;
}
EOF
else
  cat > "$PROXY_FILE" <<'EOF'
# Ollama-Proxy deaktiviert – OLLAMA_UPSTREAM setzen und Container neu starten.
EOF
fi

exec "$@"
