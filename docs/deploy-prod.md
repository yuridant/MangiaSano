# Deploy produzione

## Deploy standard

```bash
./scripts/deploy-prod.sh --pull
```

Fa `git pull --ff-only` e poi:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## Deploy con migrazione Prisma SQL

```bash
./scripts/deploy-prod-with-prisma-migration.sh --pull
```

Per default usa l'ultima `migration.sql` presente in `apps/backend/prisma/migrations`.

Se vuoi forzarne una specifica:

```bash
./scripts/deploy-prod-with-prisma-migration.sh --pull apps/backend/prisma/migrations/<timestamp>/migration.sql
```

## Note

- Lo script con migrazione applica il file SQL direttamente su Postgres prima del rebuild dei container.
- Usalo solo quando la release contiene una migration SQL che deve modificare o trasformare dati esistenti.
- Gli script leggono `.env.prod` di default. Puoi sovrascrivere con `ENV_FILE=/percorso/.env.prod`.
