# R2 Storage Setup for IMAP Service

## Problem
The IMAP service needs R2 credentials to store email bodies. Without valid credentials, emails won't sync.

## Solution: Get R2 API Tokens from Cloudflare

### Step 1: Get Your Cloudflare Account ID
1. Log in to Cloudflare Dashboard: https://dash.cloudflare.com
2. Click on "R2" in the left sidebar
3. Your **Account ID** is in the URL: `https://dash.cloudflare.com/[THIS-IS-YOUR-ACCOUNT-ID]/r2`
4. Or find it in the sidebar under your account name

### Step 2: Create R2 API Token
1. Go to R2 → Overview → Manage R2 API Tokens
2. Or visit: https://dash.cloudflare.com/[account-id]/r2/overview/api-tokens
3. Click "Create API token"
4. Set permissions: **Read & Write** for bucket `threads-staging`
5. Click "Create API Token"
6. **Copy the credentials immediately** (they won't be shown again):
   - Access Key ID
   - Secret Access Key

### Step 3: Update .env File
Edit `apps/imap-service/.env` and replace the placeholder values:

```bash
# Replace these with your actual credentials
R2_ACCOUNT_ID=your_actual_account_id_from_step_1
R2_ACCESS_KEY_ID=your_actual_access_key_from_step_2
R2_SECRET_ACCESS_KEY=your_actual_secret_key_from_step_2
R2_BUCKET_NAME=threads-staging
```

### Step 4: Restart IMAP Service
After updating the .env file, restart the IMAP service for changes to take effect:
```bash
cd apps/imap-service
# Stop the current process (Ctrl+C)
# Start it again
pnpm dev
```

## Verification
Once configured, watch the logs when the service runs. You should see:
```
Starting sync pass...
Found X IMAP connections
Syncing connection [id] ([email])
Connected to IMAP server
Saved email [uid]
```

If you see R2-related errors, double-check your credentials.

## Alternative: Local Development with File Storage
If you don't want to use R2 for local development, you could modify the Store class to use local file storage instead. This would require code changes to `apps/imap-service/src/store.ts`.
