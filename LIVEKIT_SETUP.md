# LiveKit Cloud Integration Setup Guide

This guide explains how to use the LiveKit Cloud video meetings integration with Nubo.

## Overview

The integration includes:
- LiveKit Cloud (livekit.io) for video/audio streaming
- Meeting creation and management UI
- LiveKit React components for the meeting room
- R2 storage for meeting recordings
- TRPC endpoints for meeting operations

## Prerequisites

1. **LiveKit Cloud Account**: Sign up at https://livekit.io
2. **Cloudflare R2**: For storing meeting recordings
3. **PostgreSQL**: Database for meeting metadata

## 1. LiveKit Cloud Setup

### Create a LiveKit Project

1. Go to https://cloud.livekit.io
2. Sign up or log in
3. Create a new project
4. Navigate to **Settings** → **Keys**
5. Copy your **API Key** and **API Secret**
6. Copy your **WebSocket URL** (format: `wss://your-project.livekit.cloud`)

### Note Your Credentials

You'll need:
- **API Key**: `APIxxxxxxxxxxxxxxx`
- **API Secret**: `xxxxxxxxxxxxxxxxxxxxxxxx`
- **WebSocket URL**: `wss://your-project.livekit.cloud`

## 2. Configure Environment Variables

### Local Development (.env)

Add to your `.env` file:

```bash
LIVEKIT_API_KEY=APIxxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
LIVEKIT_WS_URL=wss://your-project.livekit.cloud
```

### Staging Environment

Update `wrangler.jsonc` in the staging vars section:

```json
"LIVEKIT_API_KEY": "APIxxxxxxxxxxxxxxx",
"LIVEKIT_API_SECRET": "xxxxxxxxxxxxxxxxxxxxxxxx",
"LIVEKIT_WS_URL": "wss://your-project.livekit.cloud",
```

Or use Wrangler secrets:

```bash
echo "APIxxxxxxxxxxxxxxx" | wrangler secret put LIVEKIT_API_KEY --env staging
echo "xxxxxxxxxxxxxxxxxxxxxxxx" | wrangler secret put LIVEKIT_API_SECRET --env staging
```

### Production Environment

Update `wrangler.jsonc` in the production vars section or use secrets:

```bash
echo "APIxxxxxxxxxxxxxxx" | wrangler secret put LIVEKIT_API_KEY --env production
echo "xxxxxxxxxxxxxxxxxxxxxxxx" | wrangler secret put LIVEKIT_API_SECRET --env production
```

**Important**: Use the same LiveKit project for all environments or create separate projects for staging/production.

## 3. Setup R2 Buckets

Create R2 buckets for storing recordings:

```bash
# Create recordings bucket for each environment
wrangler r2 bucket create recordings-local
wrangler r2 bucket create recordings-staging
wrangler r2 bucket create recordings
```

The buckets are already configured in `wrangler.jsonc`:
- **Local**: `recordings-local`
- **Staging**: `recordings-staging`
- **Production**: `recordings`

## 4. Database Migration

Run the database migration to create the LiveKit tables:

```bash
# Local development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/zerodotemail" pnpm db:push

# Or use your database connection string
DATABASE_URL="your-database-url" pnpm db:push
```

This will create three tables:
- `livekit_meeting` - Meeting metadata
- `livekit_participant` - Participant records
- `livekit_recording` - Recording metadata

## 5. Start the Application

```bash
# Install dependencies if not already done
pnpm install

# Start the development server
pnpm dev
```

The app will be available at http://localhost:3000

## 6. Usage

### Creating a Meeting

1. Navigate to http://localhost:3000/meet
2. Click **"New Meeting"** button
3. Fill in the meeting details:
   - **Title** (required)
   - **Description** (optional)
   - **Enable Recording** (toggle)
4. Click **"Create & Join"**
5. Allow browser permissions for camera and microphone
6. You'll be taken to the meeting room

### Joining a Meeting

- Navigate to `/meet/:meetingId` directly
- Or click **"Join Meeting"** from the meetings list at `/meet`
- Grant camera/microphone permissions when prompted

### Meeting Features

The video conference includes:
- 🎥 Camera control (on/off)
- 🎤 Microphone control (mute/unmute)
- 🖥️ Screen sharing
- 👥 Participant grid or spotlight view
- 💬 Chat (built-in LiveKit feature)
- ⚙️ Settings for device selection
- 📹 Recording (if enabled)

### Sharing Meeting Links

Share the meeting URL with participants:
```
https://your-domain.com/meet/:meetingId
```

Participants can join as guests (no login required) or as authenticated users.

## 7. Enable Recording (Optional)

LiveKit Cloud provides built-in recording through Egress. To enable:

### Configure Egress in LiveKit Cloud Dashboard

1. Go to your LiveKit Cloud project
2. Navigate to **Settings** → **Egress**
3. Configure S3-compatible storage (Cloudflare R2):
   - **Endpoint**: `https://[account-id].r2.cloudflarestorage.com`
   - **Bucket**: `recordings` (or your R2 bucket name)
   - **Access Key ID**: Your R2 access key
   - **Secret Access Key**: Your R2 secret key
   - **Region**: `auto`

### Get R2 Credentials

```bash
# Create R2 API token
# Go to Cloudflare Dashboard → R2 → Manage R2 API Tokens
# Create token with "Object Read & Write" permissions
```

### Configure Webhook (Optional)

To receive notifications when recordings complete:

1. In LiveKit Cloud Dashboard → **Settings** → **Webhooks**
2. Add webhook URL:
   - **Local**: `https://your-ngrok-url/webhooks/livekit/egress`
   - **Production**: `https://api.nubo.email/webhooks/livekit/egress`
3. Copy the webhook secret
4. Add to your environment:
   ```bash
   LIVEKIT_WEBHOOK_SECRET=your-webhook-secret
   ```

### Start Recording

When creating a meeting, toggle **"Enable Recording"** on. LiveKit will automatically:
1. Record the meeting when participants join
2. Upload to your R2 bucket when complete
3. Send webhook notification (if configured)

## 8. API Endpoints

### TRPC Routes (Client-side)

Access through `trpc.livekit.*`:

```typescript
// Create a meeting
const { meetingId } = await trpc.livekit.create.mutate({
  title: 'Team Standup',
  description: 'Daily standup meeting',
  recordingEnabled: true,
});

// Get meeting token
const { token, wsUrl } = await trpc.livekit.getToken.mutate({
  meetingId: 'meeting-id',
});

// List meetings
const meetings = await trpc.livekit.list.query({
  status: 'active',
  limit: 50,
});

// End meeting
await trpc.livekit.end.mutate({
  meetingId: 'meeting-id',
});

// Get recordings
const recordings = await trpc.livekit.getRecordings.query({
  meetingId: 'meeting-id',
});
```

### REST Endpoints

- `GET /recordings/:r2Key` - Stream recording from R2
- `POST /webhooks/livekit/egress` - Webhook for recording completion

## 9. Troubleshooting

### "Failed to connect to meeting"

**Check:**
1. Environment variables are set correctly in `.env`
2. LiveKit WebSocket URL is correct (must start with `wss://`)
3. API Key and Secret are valid
4. Your LiveKit Cloud project is active

**Test connection:**
```bash
# Check if credentials work
curl -X POST https://your-project.livekit.cloud/twirp/livekit.RoomService/ListRooms \
  -H "Authorization: Bearer $(echo -n 'APIkey:APIsecret' | base64)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Camera/Microphone Not Working

1. **Grant browser permissions** for camera and microphone
2. **Check browser compatibility** (Chrome, Firefox, Safari, Edge supported)
3. **Verify HTTPS** - WebRTC requires HTTPS in production
4. **Check device availability** in browser settings

### Recordings Not Saving

1. **Verify R2 credentials** in LiveKit Cloud Dashboard
2. **Check R2 bucket exists** and has correct permissions
3. **Review LiveKit Egress logs** in Cloud Dashboard
4. **Ensure webhook endpoint** is accessible (if configured)

### Token Generation Fails

1. **Verify API credentials** in environment variables
2. **Check meeting exists** and is not ended
3. **Review server logs** for detailed error messages

### WebSocket Connection Issues

**For HTTPS sites:**
- LiveKit WS URL must use `wss://` (not `ws://`)
- SSL certificate must be valid
- No mixed content errors

**For local development:**
- Can use `ws://` but some features may be limited
- Consider using ngrok for testing with HTTPS

## 10. LiveKit Cloud Features

### Room Limits

- **Free Tier**: Up to 20 participants
- **Paid Plans**: Check https://livekit.io/pricing for current limits

### Recording Storage

- LiveKit automatically uploads to your R2 bucket
- Files are stored as MP4 format
- Recordings include all participants and screen shares

### Network Quality

LiveKit Cloud provides:
- Global edge network for low latency
- Automatic bandwidth adaptation
- TURN server for restrictive networks
- End-to-end encryption

### Analytics

Access in LiveKit Cloud Dashboard:
- Participant join/leave events
- Connection quality metrics
- Recording status
- Error logs

## 11. Production Considerations

### Security

- ✅ **API Keys secured** - Never exposed to client
- ✅ **Short-lived tokens** - Generated server-side
- ✅ **Access control** - Participant verification
- ✅ **HTTPS enforced** - Required for production

### Performance

- Use LiveKit's global edge network
- Enable recording only when needed
- Monitor participant limits
- Set appropriate max participants per meeting

### Monitoring

Monitor through:
- LiveKit Cloud Dashboard
- Application logs
- TRPC error handling
- Webhook events

### Scaling

LiveKit Cloud automatically scales:
- No infrastructure management
- Global distribution
- Pay-as-you-go pricing

## 12. Resources

- **LiveKit Documentation**: https://docs.livekit.io/
- **Cloud Dashboard**: https://cloud.livekit.io
- **React SDK**: https://docs.livekit.io/client-sdk-js/
- **Pricing**: https://livekit.io/pricing
- **Support**: https://livekit.io/support

## 13. Common Use Cases

### Quick Meeting

```typescript
// Create and immediately join
const { meetingId } = await trpc.livekit.create.mutate({
  title: 'Quick Chat',
});
navigate(`/meet/${meetingId}`);
```

### Scheduled Meeting

```typescript
// Create for later
const { meetingId } = await trpc.livekit.create.mutate({
  title: 'Weekly Review',
  scheduledFor: new Date('2024-12-20T10:00:00Z'),
});
```

### Guest Access

```typescript
// Let guests join without login
const { token } = await trpc.livekit.getGuestToken.mutate({
  meetingId: 'meeting-id',
  name: 'Guest User',
});
```

### Recording Management

```typescript
// List all recordings for a meeting
const recordings = await trpc.livekit.getRecordings.query({
  meetingId: 'meeting-id',
});

// Get playback URL
const { url } = await trpc.livekit.getRecordingUrl.query({
  recordingId: 'recording-id',
});
```

## Support

For issues specific to this integration, please file an issue in the repository.
For LiveKit Cloud issues, contact LiveKit support through your dashboard.

---

**Quick Start Checklist:**

- [ ] Created LiveKit Cloud account
- [ ] Created project and copied credentials
- [ ] Added credentials to `.env` file
- [ ] Created R2 buckets
- [ ] Ran database migration
- [ ] Started application
- [ ] Created test meeting
- [ ] Verified video/audio works
- [ ] (Optional) Configured recording with R2
- [ ] (Optional) Set up webhook endpoint
