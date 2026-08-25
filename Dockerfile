FROM nginx:1.27-alpine

RUN apk add --no-cache gettext openssl

COPY index.html /usr/share/nginx/html/index.html
COPY icon-favicon.png /usr/share/nginx/html/icon-favicon.png
COPY assets/ /usr/share/nginx/html/assets/
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY entrypoint.sh /entrypoint.sh

RUN chmod 0555 /entrypoint.sh \
    && find /usr/share/nginx/html -type d -exec chmod 0755 {} + \
    && find /usr/share/nginx/html -type f -exec chmod 0644 {} +

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
