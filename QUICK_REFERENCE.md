# Quick Reference

## 🔗 Important URLs

### Production
- **Backend API**: https://nextis-production.up.railway.app
- **Railway Dashboard**: https://railway.com/project/fdd7b305-6196-4c38-8ab9-626259d1d64f

### Test API
```bash
curl https://nextis-production.up.railway.app/api/tasks
```

## 🚀 Common Commands

### Railway
```bash
# Check status
railway status

# View logs
railway logs

# View live logs
railway logs --tail

# List environment variables
railway variables

# Deploy (auto-deploys on git push)
git push origin main
```

### Local Development
```bash
# Run dev server
npm run dev

# Build production
npm run build

# Start production server
npm start

# Database push
npm run db:push
```

### iOS App
```bash
# Open Xcode
cd ios/NextisApp && open NextisApp.xcodeproj

# Build from terminal
cd ios/NextisApp
xcodebuild -scheme NextisApp -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17' build
```

## 📝 Quick Updates

### Update iOS Backend URL
File: `ios/NextisApp/NextisApp/Info.plist`
```xml
<key>API_BASE_URL</key>
<string>https://nextis-production.up.railway.app</string>
```

### Environment Variables
File: `.env` (create from `.env.example`)
```bash
RAILWAY_URL=https://nextis-production.up.railway.app
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
```

## 🔍 Troubleshooting

### Backend Not Responding
```bash
# Check Railway status
railway status

# View logs for errors
railway logs --tail 50

# Test API endpoint
curl https://nextis-production.up.railway.app/api/tasks
```

### iOS App Connection Issues
1. Check `Info.plist` has correct URL
2. Verify backend is running
3. Check Xcode console for errors
4. Test API in browser

### Database Issues
```bash
# Check Railway environment variables
railway variables

# Verify DATABASE_URL is set
# Check Supabase dashboard
```

## 📦 Files to Update When Changing Backend URL

1. `ios/NextisApp/NextisApp/Info.plist` - iOS app backend URL
2. `.env.example` - Documentation
3. `DEPLOYMENT.md` - Deployment documentation
4. `railway.toml` - Railway configuration comments
5. `README.md` - Project documentation

## 🎯 Project Structure

```
nextis/
├── .env.example          # Environment template ⭐
├── DEPLOYMENT.md         # Deployment guide ⭐
├── README.md             # Main documentation ⭐
├── railway.toml          # Railway config ⭐
├── server/               # Backend code
├── client/               # Frontend code
└── ios/NextisApp/        # iOS app
    ├── NextisApp/
    │   └── Info.plist    # iOS backend URL ⭐
    ├── README.md         # iOS docs
    └── CONFIGURATION.md  # iOS config guide
```

⭐ = Contains Railway URL references

## 💡 Pro Tips

1. **Always test after URL changes**:
   ```bash
   curl https://nextis-production.up.railway.app/api/tasks
   ```

2. **Check Railway logs if issues**:
   ```bash
   railway logs --tail
   ```

3. **iOS app builds but can't connect?**
   - Double-check `Info.plist` URL
   - Ensure no typos
   - Test backend in browser first

4. **Keep .env.example updated**:
   - Update it whenever you add new environment variables
   - Never commit actual `.env` file

## 🔒 Security Reminders

- ❌ Never commit `.env` file (it's in `.gitignore`)
- ✅ Use `.env.example` for documentation
- ❌ Don't share API keys publicly
- ✅ Set secrets in Railway dashboard
- ✅ Railway provides automatic HTTPS

## 📞 Quick Links

| Resource | URL |
|----------|-----|
| Backend API | https://nextis-production.up.railway.app |
| Railway Dashboard | https://railway.com/project/fdd7b305-6196-4c38-8ab9-626259d1d64f |
| Supabase Dashboard | https://supabase.com/dashboard |
| OpenAI Platform | https://platform.openai.com |

---

**Current Configuration**: ✅ All set  
**Backend URL**: `https://nextis-production.up.railway.app`  
**iOS App**: Configured ✅  
**Last Updated**: 2025-10-05
