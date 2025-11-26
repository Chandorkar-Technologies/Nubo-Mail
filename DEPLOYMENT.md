# Nubo Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Cloudflare                               │
├─────────────────────────────────────────────────────────────────┤
│  Cloudflare Pages         │  Cloudflare Workers                  │
│  (Frontend - React)       │  (Backend API - Hono)                │
│                           │                                      │
│  apps/mail                │  apps/server                         │
├───────────────────────────┴──────────────────────────────────────┤
│                    Cloudflare R2 (Storage)                       │
│  - Email bodies (threads)                                        │
│  - Attachments                                                   │
│  - Drive files                                                   │
│  - Meeting recordings                                            │
├─────────────────────────────────────────────────────────────────┤
│                    Cloudflare Durable Objects                    │
│  - Per-user database shards                                      │
│  - WebSocket connections                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ PostgreSQL (Neon.tech)
                              │ - User accounts
                              │ - Connections
                              │ - Settings
                              │ - IMAP emails
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         VM (Railway/Render/EC2)                  │
│                                                                  │
│  IMAP Sync Service (Node.js)                                     │
│  - Polls IMAP servers every 60s                                  │
│  - Stores email metadata in PostgreSQL                           │
│  - Stores email bodies in R2                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **Cloudflare Account** with:
   - Pages (for frontend)
   - Workers (for backend)
   - R2 bucket
   - Durable Objects enabled
   - Hyperdrive (for PostgreSQL connection pooling)

2. **Neon.tech Account** for PostgreSQL database

3. **VM/Container Service** for IMAP service (Railway, Render, EC2, etc.)

---

## Step 1: Database Setup (Neon.tech)

1. Create a new project in Neon.tech
2. Copy the connection string (looks like `postgresql://user:pass@host/dbname`)
3. Run the schema SQL:
   ```bash
   psql "YOUR_NEON_CONNECTION_STRING" < nubo_full_schema.sql
   ```
   Or paste the contents of `nubo_full_schema.sql` into Neon's SQL Editor.

---

## Step 2: Cloudflare R2 Setup

1. Create an R2 bucket named `nubo-threads` (or your preferred name)
2. Create R2 API credentials:
   - Go to R2 > Manage R2 API Tokens
   - Create a token with read/write access
   - Save the Access Key ID and Secret Access Key

---

## Step 3: Cloudflare Hyperdrive Setup

1. Create a Hyperdrive config:
   ```bash
   npx wrangler hyperdrive create nubo-db --connection-string="YOUR_NEON_CONNECTION_STRING"
   ```
2. Note the Hyperdrive ID returned

---

## Step 4: Environment Variables

### For Cloudflare Workers (apps/server)

Create/update `apps/server/wrangler.toml`:

```toml
name = "nubo-api"
main = "src/main.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "YOUR_HYPERDRIVE_ID"

[[r2_buckets]]
binding = "THREADS_BUCKET"
bucket_name = "nubo-threads"

[[r2_buckets]]
binding = "RECORDINGS_BUCKET"
bucket_name = "nubo-recordings"

[[durable_objects.bindings]]
name = "ZERO_DB"
class_name = "ZeroDB"

[[durable_objects.bindings]]
name = "ZERO_AGENT"
class_name = "ZeroAgent"

[[durable_objects.bindings]]
name = "ZERO_DRIVER"
class_name = "ZeroDriver"

[[durable_objects.bindings]]
name = "SHARD_REGISTRY"
class_name = "ShardRegistry"

[vars]
BETTER_AUTH_URL = "https://api.nubo.email"
NEXT_PUBLIC_APP_URL = "https://nubo.email"

# Add secrets via wrangler:
# wrangler secret put GOOGLE_CLIENT_ID
# wrangler secret put GOOGLE_CLIENT_SECRET
# wrangler secret put MICROSOFT_CLIENT_ID
# wrangler secret put MICROSOFT_CLIENT_SECRET
# wrangler secret put OPENAI_API_KEY
# wrangler secret put LIVEKIT_API_KEY
# wrangler secret put LIVEKIT_API_SECRET
```

### For Cloudflare Pages (apps/mail)

Set these in Cloudflare Pages dashboard:

```
VITE_PUBLIC_APP_URL=https://nubo.email
VITE_API_URL=https://api.nubo.email
```

### For IMAP Service (VM)

Create `.env` file:

```env
# Database
DATABASE_URL=postgresql://user:pass@host/dbname

# R2 Storage
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=nubo-threads

# Logging
LOG_LEVEL=info
```

---

## Step 5: Deploy Cloudflare Workers (Backend)

```bash
cd apps/server

# Install dependencies
pnpm install

# Deploy
pnpm run deploy
# or
npx wrangler deploy
```

---

## Step 6: Deploy Cloudflare Pages (Frontend)

Option A: Via Cloudflare Dashboard
1. Connect your GitHub repo
2. Set build command: `pnpm build`
3. Set output directory: `apps/mail/dist`
4. Set root directory: `/`

Option B: Via CLI
```bash
cd apps/mail
pnpm build
npx wrangler pages deploy dist --project-name=nubo
```

---

## Step 7: Deploy IMAP Service on VM

### Option A: Railway (Recommended for simplicity)

1. Create new project on Railway
2. Connect your GitHub repo
3. Set root directory to `apps/imap-service`
4. Add environment variables from Step 4
5. Railway will auto-detect Node.js and deploy

### Option B: Render

1. Create new Web Service
2. Connect GitHub repo
3. Set:
   - Root Directory: `apps/imap-service`
   - Build Command: `pnpm install && pnpm build`
   - Start Command: `pnpm start`
4. Add environment variables

### Option C: Self-hosted VM (EC2/DigitalOcean/etc.)

```bash
# SSH into your VM
ssh user@your-vm-ip

# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Clone repo
git clone https://github.com/Chandorkar-Technologies/Zero.git
cd Zero

# Install dependencies
pnpm install --filter @zero/imap-service

# Build
cd apps/imap-service
pnpm build

# Create .env file
cat > .env << 'EOF'
DATABASE_URL=postgresql://user:pass@host/dbname
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=nubo-threads
LOG_LEVEL=info
EOF

# Run with PM2 (recommended for production)
npm install -g pm2
pm2 start dist/index.js --name imap-service
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

### Docker Deployment (Alternative)

Create `apps/imap-service/Dockerfile`:

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm build

# Run
CMD ["node", "dist/index.js"]
```

Build and run:
```bash
docker build -t nubo-imap-service .
docker run -d \
  --name imap-service \
  --env-file .env \
  --restart unless-stopped \
  nubo-imap-service
```

---

## Step 8: DNS Configuration

Point your domains to Cloudflare:

| Record | Type | Name | Content |
|--------|------|------|---------|
| A/CNAME | CNAME | nubo.email | your-pages-project.pages.dev |
| A/CNAME | CNAME | api.nubo.email | your-worker.workers.dev |

---

## Step 9: OAuth Setup

### Google OAuth
1. Go to Google Cloud Console
2. Create OAuth 2.0 credentials
3. Add authorized redirect URIs:
   - `https://api.nubo.email/api/auth/callback/google`
4. Add to Cloudflare Worker secrets

### Microsoft OAuth
1. Go to Azure Portal > App Registrations
2. Create new registration
3. Add redirect URIs:
   - `https://api.nubo.email/api/auth/callback/microsoft`
4. Add to Cloudflare Worker secrets

---

## Troubleshooting

### Google Account Not Syncing
This happens because Google/Microsoft use Durable Objects for sync, while IMAP uses the separate IMAP service. Check:

1. **Verify Durable Objects are working:**
   ```bash
   wrangler tail  # Watch worker logs
   ```

2. **Check if connection has valid tokens:**
   - Look in `mail0_connection` table
   - `access_token` and `refresh_token` should not be null

3. **Force resync:**
   The app should have a sync button, or you can call the API endpoint.

### IMAP Service Not Syncing
1. Check VM logs:
   ```bash
   pm2 logs imap-service
   ```

2. Verify database connection:
   ```bash
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM mail0_connection WHERE provider_id = 'imap';"
   ```

3. Check R2 credentials are correct

### Connection Errors
- Ensure Hyperdrive is configured correctly
- Check Neon.tech connection limits (free tier has limits)
- Verify the database URL in environment variables

---

## Monitoring

### Cloudflare Workers
- Use Cloudflare dashboard > Workers > Analytics
- Enable `wrangler tail` for real-time logs

### IMAP Service
- PM2: `pm2 monit`
- Docker: `docker logs -f imap-service`

### Database
- Neon.tech dashboard shows queries and performance

---

## Scaling Considerations

1. **IMAP Service**: Can run multiple instances if needed, but ensure they don't process the same connections simultaneously (use distributed locking or partition by connection ID)

2. **Database**: Neon.tech auto-scales, but monitor connection limits

3. **R2**: Unlimited storage, no scaling needed

4. **Durable Objects**: Auto-scale per user
