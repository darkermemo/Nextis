# iOS App Configuration Guide

## Backend URL Setup

The iOS app needs to connect to your Railway backend. You must configure the correct URL before running the app.

### Finding Your Railway URL

1. **Log in to Railway Dashboard**: https://railway.app/dashboard
2. **Find Your Project**: Look for your "nextis" or "weekmind" project
3. **Get the Public URL**: 
   - Click on your project
   - Click on the service (usually named "web" or similar)
   - Look for "Settings" → "Public Networking"
   - Copy the generated domain (e.g., `your-app-name.up.railway.app`)

### Configuring the iOS App

#### Option 1: Update Info.plist (Recommended)
1. Open `NextisApp/Info.plist` in Xcode or a text editor
2. Find the `API_BASE_URL` key
3. Replace the value with your Railway URL:
   ```xml
   <key>API_BASE_URL</key>
   <string>https://your-app-name.up.railway.app</string>
   ```

#### Option 2: Environment-based Configuration
For different environments (dev/staging/prod), you can:

1. **Development (Local Backend)**:
   ```xml
   <string>http://localhost:3000</string>
   ```

2. **Production (Railway)**:
   ```xml
   <string>https://your-app-name.up.railway.app</string>
   ```

### App Transport Security

The app is already configured to allow HTTPS connections to Railway domains. If you're using HTTP (not recommended for production), you'll need to add an exception:

```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
    <key>NSExceptionDomains</key>
    <dict>
        <key>your-app-name.up.railway.app</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

## Database (Supabase)

The iOS app doesn't connect directly to Supabase. It connects to your Railway backend, which then connects to Supabase. Make sure your Railway deployment has the correct `DATABASE_URL` environment variable set:

1. In Railway Dashboard, go to your project
2. Click "Variables" tab
3. Verify `DATABASE_URL` is set to your Supabase connection string:
   ```
   DATABASE_URL=postgresql://[user]:[password]@[host]/[database]
   ```

## Testing the Connection

### 1. Verify Backend is Running
Open your Railway URL in a browser:
```
https://your-app-name.up.railway.app/api/tasks
```

You should see a response (might be unauthorized if you don't have a session, but it should load).

### 2. Test from iOS Simulator
1. Update `Info.plist` with your Railway URL
2. Build and run the app in Xcode
3. Check the Xcode console for any connection errors
4. Try using the chat interface to create a task

## Common Issues

### Issue: "Cannot connect to backend"
**Solution**: 
- Verify the Railway URL is correct
- Ensure Railway deployment is running
- Check Railway logs for errors

### Issue: "SSL/TLS error"
**Solution**: 
- Make sure you're using `https://` not `http://`
- Railway provides HTTPS by default

### Issue: "Authentication failed"
**Solution**: 
- The app may need authentication implemented
- Check the backend CORS settings allow your iOS app
- Verify session cookies are being set correctly

## Quick Setup Checklist

- [ ] Get Railway deployment URL
- [ ] Update `Info.plist` with Railway URL
- [ ] Verify Railway backend is running
- [ ] Check `DATABASE_URL` is set in Railway
- [ ] Build and test iOS app
- [ ] Verify API requests work in Xcode console

## Need Your Railway URL?

Run this command in your Railway project to get the URL:
```bash
railway status
```

Or check the Railway dashboard at: https://railway.app/dashboard
