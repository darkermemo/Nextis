# Deployment Configuration

## Current Deployment

### Railway Backend
- **URL**: `https://nextis-production.up.railway.app`
- **Project ID**: `fdd7b305-6196-4c38-8ab9-626259d1d64f`
- **Service**: astonishing-analysis
- **Status**: ✅ Live and Running

### Database
- **Provider**: Supabase (PostgreSQL)
- **Connection**: Via `DATABASE_URL` environment variable in Railway

### iOS App
- **Backend URL**: Configured in `ios/NextisApp/NextisApp/Info.plist`
- **Current**: `https://nextis-production.up.railway.app`
- **iOS Version**: iOS 17.0+

## Environment Variables

### Required Variables (Set in Railway Dashboard)
```bash
DATABASE_URL=postgresql://...           # Supabase connection string
OPENAI_API_KEY=sk-...                   # OpenAI API key
OPENAI_MODEL=gpt-4o                     # AI model to use
PORT=3000                                # Server port (Railway sets this)
NODE_ENV=production                      # Environment mode
TZ=Asia/Riyadh                          # Default timezone
```

### Optional Variables
```bash
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview
SESSION_SECRET=...                       # Random string for sessions
```

## Deployment Commands

### Deploy to Railway
```bash
# Link to Railway project
railway link -p astonishing-analysis

# Check status
railway status

# View logs
railway logs

# Deploy latest changes
git push  # Railway auto-deploys from main branch

# Or use Railway CLI
railway up
```

### Update iOS App Backend URL
If you change the Railway URL, update:
1. `ios/NextisApp/NextisApp/Info.plist` - Change `API_BASE_URL`
2. `.env.example` - Update `RAILWAY_URL` for documentation
3. This file (DEPLOYMENT.md) - Update the URL above

### Local Development
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials
# For local development, use:
# RAILWAY_URL=http://localhost:3000

# Run locally
npm run dev
```

## Project Structure

```
nextis/
├── server/              # Express backend
├── client/              # React frontend
├── ios/NextisApp/       # iOS native app
├── shared/              # Shared types/schemas
├── railway.toml         # Railway configuration
└── .env.example         # Environment template
```

## URLs and Endpoints

### Production
- **Backend API**: https://nextis-production.up.railway.app
- **API Endpoints**:
  - `/api/tasks` - Task management
  - `/api/calendar` - Calendar/schedule
  - `/api/chat/parse` - Natural language processing
  - `/api/next` - Next actions
  - `/api/mood` - Mood tracking
  - `/api/learning/*` - Learning preferences and insights
  - `/api/health/*` - Health tracking
  - `/api/workout/*` - Gym planning
  - `/api/gmail/*` - Gmail integration
  - `/api/weekly/*` - Weekly summaries

### Test API
```bash
# Test backend is running
curl https://nextis-production.up.railway.app/api/tasks

# Should return JSON with tasks data
```

## iOS App Configuration

### Update Backend URL
1. Open `ios/NextisApp/NextisApp/Info.plist`
2. Find `API_BASE_URL` key
3. Update the value:
```xml
<key>API_BASE_URL</key>
<string>https://nextis-production.up.railway.app</string>
```

### Build iOS App
```bash
cd ios/NextisApp
open NextisApp.xcodeproj
# Build and run (Cmd+R)
```

## Troubleshooting

### Backend Not Responding
1. Check Railway dashboard: https://railway.com/project/fdd7b305-6196-4c38-8ab9-626259d1d64f
2. View logs: `railway logs`
3. Verify environment variables are set
4. Check database connection

### iOS App Can't Connect
1. Verify Railway URL in `Info.plist`
2. Check backend is running: `curl https://nextis-production.up.railway.app/api/tasks`
3. Review Xcode console for errors
4. Ensure Railway backend has CORS configured

### Database Connection Failed
1. Verify `DATABASE_URL` in Railway environment variables
2. Check Supabase dashboard for database status
3. Ensure IP restrictions allow Railway connections

## Maintenance

### View Logs
```bash
railway logs
railway logs --tail 100
```

### Check Status
```bash
railway status
railway domain
```

### Environment Variables
```bash
# View all variables
railway variables

# Set a variable
railway variables set KEY=value
```

## Security Notes

- Never commit `.env` file (it's in `.gitignore`)
- Keep `OPENAI_API_KEY` and `DATABASE_URL` secret
- Use environment variables for all sensitive data
- Railway automatically provides HTTPS

## Last Updated
- Date: 2025-10-05
- Railway URL: `https://nextis-production.up.railway.app`
- iOS Backend URL: Configured ✅
- Status: Production Ready ✅
