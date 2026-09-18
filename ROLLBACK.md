# Rollback (if Laravel breaks)

1. Restore nginx:
   cp /etc/nginx/sites-available/chataura.bak.20260918_051848 /etc/nginx/sites-available/chataura
   nginx -t && systemctl reload nginx

2. Stop v2 Docker stack (volumes kept):
   cd /var/www/chataura_backend_next
   COMPOSE_PROFILES=full docker compose down

Laravel at /var/www/chataura is untouched by this deploy.
