# LiveKit Quick Start Guide

Since you've already added your LiveKit Cloud credentials to `.env`, here's what you need to do next:

## ✅ Credentials Added

Your `.env` file should have:
```bash
LIVEKIT_API_KEY=APIxxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
LIVEKIT_WS_URL=wss://your-project.livekit.cloud
```

## Next Steps

### 1. Create R2 Buckets (5 minutes)

```bash
# Create recordings bucket
wrangler r2 bucket create recordings-local
```

### 2. Run Database Migration (2 minutes)

```bash
# This creates the meeting tables
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zerodotemail" pnpm db:push
```

### 3. Start the Application (1 minute)

```bash
pnpm dev
```

### 4. Test Your First Meeting (2 minutes)

1. Open http://localhost:3000/meet
2. Click **"New Meeting"**
3. Enter a title like "Test Meeting"
4. Click **"Create & Join"**
5. Allow camera/microphone permissions
6. You're in! 🎉

## What Was Integrated

### Backend (`apps/server/`)
- ✅ TRPC routes for meeting operations
- ✅ Token generation for secure access
- ✅ Database schema for meetings, participants, recordings
- ✅ R2 endpoints for recording playback
- ✅ Webhook handler for recording completion

### Frontend (`apps/mail/`)
- ✅ Meeting list page at `/meet`
- ✅ Video conference room at `/meet/:meetingId`
- ✅ Create meeting dialog
- ✅ LiveKit React components integrated
- ✅ Full video/audio/screen share controls

### Features Included

**Meeting Management:**
- Create meetings with title and description
- List all your meetings
- Join active meetings
- End meetings
- Schedule meetings for later

**Video Conference:**
- HD video and audio
- Screen sharing
- Grid and spotlight layouts
- Participant management
- Chat functionality
- Device settings

**Recording (Optional):**
- Toggle recording on/off per meeting
- Automatic upload to R2
- Playback from secure endpoints
- Recording metadata tracking

## URLs

- **Meetings List**: http://localhost:3000/meet
- **Join Meeting**: http://localhost:3000/meet/:meetingId

## Common Operations

### Create a Meeting

```typescript
const { meetingId } = await trpc.livekit.create.mutate({
  title: 'Team Standup',
  description: 'Daily standup meeting',
  recordingEnabled: false,
});
```

### Get Meeting Token

```typescript
const { token, wsUrl } = await trpc.livekit.getToken.mutate({
  meetingId: 'your-meeting-id',
});
```

### End a Meeting

```typescript
await trpc.livekit.end.mutate({
  meetingId: 'your-meeting-id',
});
```

## Enabling Recording

If you want to enable recording:

1. **Create R2 API Token**:
   - Go to Cloudflare Dashboard → R2 → Manage R2 API Tokens
   - Create token with "Object Read & Write" permissions
   - Copy Access Key ID and Secret Access Key

2. **Configure in LiveKit Cloud**:
   - Go to https://cloud.livekit.io
   - Your Project → Settings → Egress
   - Add S3 Storage:
     - **Endpoint**: `https://[your-account-id].r2.cloudflarestorage.com`
     - **Bucket**: `recordings-local`
     - **Access Key**: Your R2 access key
     - **Secret**: Your R2 secret
     - **Region**: `auto`

3. **Enable When Creating Meeting**:
   - Toggle "Enable Recording" when creating a meeting
   - Recordings will automatically upload to R2

## Troubleshooting

### "Failed to connect"
- Verify your LiveKit credentials are correct in `.env`
- Ensure WebSocket URL starts with `wss://`
- Check your LiveKit project is active at cloud.livekit.io

### Camera/Mic not working
- Grant browser permissions
- Check HTTPS is being used (required for WebRTC)
- Try a different browser (Chrome/Firefox recommended)

### Database errors
- Make sure PostgreSQL is running
- Run the migration: `pnpm db:push`
- Check DATABASE_URL is correct

## Production Deployment

### Update Staging/Production Variables

In `wrangler.jsonc`, update the vars for staging and production environments:

```json
"LIVEKIT_API_KEY": "your-api-key",
"LIVEKIT_API_SECRET": "your-api-secret",
"LIVEKIT_WS_URL": "wss://your-project.livekit.cloud"
```

Or use Wrangler secrets:

```bash
# For staging
echo "your-api-key" | wrangler secret put LIVEKIT_API_KEY --env staging
echo "your-api-secret" | wrangler secret put LIVEKIT_API_SECRET --env staging

# For production
echo "your-api-key" | wrangler secret put LIVEKIT_API_KEY --env production
echo "your-api-secret" | wrangler secret put LIVEKIT_API_SECRET --env production
```

### Create Production R2 Buckets

```bash
wrangler r2 bucket create recordings-staging
wrangler r2 bucket create recordings
```

### Deploy

```bash
# Deploy backend
cd apps/server
pnpm deploy:backend:production

# Deploy frontend (if separate)
cd ../mail
pnpm deploy
```

## Support

- **Full Documentation**: See `LIVEKIT_SETUP.md`
- **LiveKit Docs**: https://docs.livekit.io/
- **LiveKit Dashboard**: https://cloud.livekit.io
- **Issues**: File in your repository

---

**You're all set! 🚀**

Create your first meeting at http://localhost:3000/meet
