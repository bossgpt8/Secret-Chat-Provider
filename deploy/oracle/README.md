# Vox API on an Oracle VM

This setup runs the Vox Node API in a container and Caddy in front of it for HTTPS. AI, speech, search, and image-generation providers stay external. PostgreSQL is expected to be hosted by Neon.

## Database starts fresh on Neon

The Vox Neon project has been created with the current Vox schema (`conversations`, `messages`, and `memory_facts`). It starts with no imported Replit data. The Replit-managed database and its app connection were left unchanged.

The Oracle API reads `DATABASE_URL`, so configure that variable with the Vox Neon connection URL on the Oracle VM only. Do not replace Replit's managed `DATABASE_URL`.

## Prepare Neon and DNS

1. Use the existing Neon project named `Vox`, on its `main` branch and `neondb` database.
2. Copy that project's pooled connection URL from Neon and keep it private.
3. Create an `A` record for your API hostname pointing to the VM’s public IP.
4. Allow inbound TCP ports 80 and 443 in both the Oracle network security rules and the VM firewall. Do not expose port 8080 or PostgreSQL port 5432 publicly.

Do not create another Neon project for this deployment.

## Configure the VM

Install Docker Engine with the Docker Compose plugin for the VM's Linux distribution. The container image supports both common Oracle VM architectures (`x86_64` and `aarch64`).

Run these commands on the Oracle VM, not inside Replit. Replit injects its own `DATABASE_URL`; running the schema setup from that environment could target the wrong database.

From the repository root on the VM:

```sh
cp deploy/oracle/.env.example deploy/oracle/.env
chmod 600 deploy/oracle/.env
```

Edit `deploy/oracle/.env`:

- Replace `DATABASE_URL` with the Neon pooled connection URL.
- Replace `API_DOMAIN` with the DNS hostname pointing to the VM.
- Add the external provider keys Vox uses. Use the provider’s current values; Replit secrets are not automatically copied to the VM.
- Set external service URLs to addresses reachable from the VM. In a container, `localhost` refers to the API container itself, not another server.

The `.env` file is ignored by Git and Docker. Never commit or paste its contents into chat.

## Run the API

From `deploy/oracle`:

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs -f api
```

The Vox schema has already been initialized and the chat and memory read/write routes have been tested against Neon. If the schema changes later, run the Drizzle push command only after confirming `DATABASE_URL` points to the Vox Neon database, never Replit.

After DNS and Caddy certificate setup, verify:

```sh
curl -fsS https://YOUR_API_HOSTNAME/api/healthz
```

The API is only reachable inside the Docker network; Caddy is the only service exposing public HTTP/HTTPS ports.

## Mobile cutover

The EAS profiles still point to the current Replit API. Keep them unchanged until the Oracle API is online and the user approves the mobile cutover:

1. Confirm the Oracle API is using the Vox Neon connection URL and its database-backed endpoints work.
2. Change the `EXPO_PUBLIC_API_URL` in each build profile in `artifacts/mobile/eas.json` to `https://YOUR_API_HOSTNAME/api`, then rebuild the mobile app.

The Replit database remains separate and unchanged; no Replit data was copied into Neon.
