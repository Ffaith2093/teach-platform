# ECS production deployment

This deployment keeps PostgreSQL and Redis on a private Docker network, binds the Next.js server only to host loopback, and uses host Nginx as the public entry point.

## 1. Host prerequisites

Use a current Linux ECS image with Docker Engine, Docker Compose v2, Git, and Nginx. In the Alibaba Cloud security group, expose only TCP 80/443 to students and restrict TCP 22 to administrator addresses. Never expose 3000, 5432, 6379, 8080, or the Docker API.

For a normal class, start with at least 4 vCPU and 8 GB RAM. Set `JUDGE_CONCURRENCY=4` initially; the application enforces a maximum worker concurrency of 6.

## 2. Create production secrets

From the repository root:

```bash
cp deploy/env.production.example deploy/.env.production
chmod 600 deploy/.env.production
openssl rand -hex 24
openssl rand -hex 24
openssl rand -base64 32
openssl rand -hex 32
```

Put the generated values into `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `AUTH_SECRET`, and `CRON_SECRET`. Set `NEXTAUTH_URL` to the public ECS IP for initial HTTP testing, or the final HTTPS domain. Password values should use the generated hexadecimal strings so they are safe inside connection URLs. Set `DOCKER_GID` to the numeric group ID printed by `getent group docker | cut -d: -f3`; this grants the non-root Web and Worker processes access to the Docker socket.

Create the shared judge staging directory and validate the configuration:

```bash
sudo install -d -o 10001 -g 10001 -m 0700 /var/lib/pylearn/judge-tmp
./scripts/check-production-env.sh
```

## 3. Build and initialize

All production commands use the explicit production Compose file and env file:

```bash
docker pull python:3.11-slim
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml build
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml up -d postgres redis
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml run --rm web npx prisma migrate deploy
```

For an empty database, create the first administrator once. Do not run the demo seed in production.

```bash
read -r -p "Admin email: " BOOTSTRAP_ADMIN_EMAIL
read -r -s -p "Admin password: " BOOTSTRAP_ADMIN_PASSWORD
printf '\n'
export BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL -e BOOTSTRAP_ADMIN_PASSWORD web npm run db:bootstrap-admin
unset BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD
```

If an existing database is being moved, restore its reviewed backup instead. Do not run migrations against an unverified legacy database, and do not start `cron` until expired exam attempts have been checked.

## 4. Start Web and Worker

```bash
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml up -d web worker
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml ps
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml logs --tail=100 web worker
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml run --rm web npm run judge:smoke
```

The production file does not include Adminer. PostgreSQL and Redis have no host port mappings. The Web port is bound to `127.0.0.1` and must be reached through Nginx.

After checking exam data and automatic-submission behavior, enable the optional cron profile:

```bash
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml --profile cron up -d cron
```

## 5. Configure Nginx

```bash
sudo cp deploy/nginx/pylearn.conf /etc/nginx/sites-available/pylearn
sudo ln -s /etc/nginx/sites-available/pylearn /etc/nginx/sites-enabled/pylearn
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Verify `http://ECS_PUBLIC_IP/login`, then configure a domain and TLS before normal use. When switching to HTTPS, update `NEXTAUTH_URL`, validate the environment again, and recreate Web:

```bash
./scripts/check-production-env.sh
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml up -d --force-recreate web
```

## 6. Backups and updates

Back up both PostgreSQL and uploaded course resources. Docker volumes are persistent but are not backups. Store copies outside the ECS instance, such as Alibaba Cloud OSS, and enable ECS disk snapshots.

Example PostgreSQL backup:

```bash
mkdir -p backups
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U pylearn -d pylearn -Fc > "backups/pylearn-$(date +%F-%H%M%S).dump"
```

For an update, back up first, build the new image, apply reviewed migrations, then recreate the application services:

```bash
git pull --ff-only
./scripts/check-production-env.sh
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml build
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml run --rm web npx prisma migrate deploy
docker compose --env-file deploy/.env.production -f docker-compose.prod.yml up -d --force-recreate web worker
```

The application containers run as UID/GID `10001:10001`; Web and Worker receive only the host Docker group as a supplementary group. They can still access the Docker socket to launch judge containers, which is equivalent to high host privilege despite the non-root container user. Keep SSH access restricted, never expose the Docker API, and move judging to a separate host if the installation later becomes multi-tenant.
