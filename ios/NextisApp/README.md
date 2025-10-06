# NextisApp - iOS Application

## Overview
NextisApp is a native iOS application for the Nextis (WeekMind) intelligent planning assistant. It provides a beautiful, native iOS interface to manage tasks, schedule events, and optimize your time.

## Requirements
- iOS 17.0 or later
- Xcode 16.0 or later
- macOS with Apple Silicon or Intel processor

## Setup & Building

### 1. Open the Project
```bash
cd ios/NextisApp
open NextisApp.xcodeproj
```

### 2. Configure Backend URL (REQUIRED)
The app needs to connect to your Railway backend.

**You MUST update the backend URL before running the app:**

1. Get your Railway deployment URL:
   - Go to https://railway.app/dashboard
   - Find your project and copy the public URL
   - It should look like: `https://your-app-name.up.railway.app`

2. Update `NextisApp/Info.plist`:
   - Open the file in Xcode or a text editor
   - Find the `API_BASE_URL` key
   - Replace `YOUR-RAILWAY-APP` with your actual app name
   
   Example:
   ```xml
   <key>API_BASE_URL</key>
   <string>https://nextis-production.up.railway.app</string>
   ```

See `CONFIGURATION.md` for detailed setup instructions

### 3. Build from Command Line
```bash
# Build for simulator
xcodebuild -scheme NextisApp -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' build

# Clean build
xcodebuild -scheme NextisApp -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17' clean build
```

### 4. Run from Xcode
1. Open `NextisApp.xcodeproj` in Xcode
2. **Important**: Make sure you've configured the Railway URL in Info.plist first
3. Select a simulator (iPhone 17, iPhone 17 Pro, etc.)
4. Press Cmd+R to build and run

## Features

### Main Screens
- **Chat View**: Natural language interface to add tasks and events
- **Tasks View**: Organize tasks by Today, This Week, and Later
- **Calendar View**: Visual weekly calendar with time slots
- **Learning Dashboard**: AI-powered insights and habit patterns
- **Insights**: Weekly summaries and productivity trends

### Key Components
- **Plan Explainer**: Understand why tasks are scheduled at specific times
- **Next 3 Actions**: Quick view of top priority items
- **Mood Check-in**: Daily mood tracking for better planning
- **Notifications**: Smart reminders and suggestions

## Architecture

### Core Files
- `NextisApp.swift` - App entry point
- `AllScreens.swift` - Main tab-based navigation
- `CompleteViews.swift` - Full-featured views (Chat, Calendar, Learning, Insights)
- `Screens.swift` - Individual screen implementations
- `APIClient.swift` - Network layer for backend communication
- `Models.swift` - Data models and types

### API Client
The `APIClient` class handles all communication with the backend server:
- Task management (get, update, toggle)
- Calendar and scheduling
- Learning preferences and insights
- Health tracking
- Gym planning
- Gmail integration
- Weekly summaries

## Configuration

### Backend Connection (Railway)
The app is designed to connect to your Railway backend deployment:

**Required Setup:**
1. Get your Railway URL from https://railway.app/dashboard
2. Update `API_BASE_URL` in `Info.plist`
3. Ensure your Railway backend is deployed and running

**Database (Supabase):**
- The iOS app doesn't connect directly to Supabase
- It connects to your Railway backend, which handles database operations
- Make sure `DATABASE_URL` is configured in your Railway environment variables

**Local Development:**
If you want to test with a local backend:
1. Uncomment the `NSAllowsLocalNetworking` setting in `Info.plist`
2. Uncomment the localhost exception domain
3. Change `API_BASE_URL` to `http://localhost:3000`

### Timezone
The app automatically uses the device's timezone for all operations via `TimeZone.current.identifier`.

## Troubleshooting

### Build Errors
If you encounter build errors:
1. Clean the build folder: Product → Clean Build Folder (Cmd+Shift+K)
2. Delete derived data: `rm -rf ~/Library/Developer/Xcode/DerivedData/NextisApp-*`
3. Restart Xcode

### Connection Issues
If the app can't connect to the backend:

**For Railway Deployment:**
1. Verify your Railway app is deployed and running
   - Check status at https://railway.app/dashboard
   - Test the URL in a browser: `https://your-app.up.railway.app/api/tasks`
2. Confirm `API_BASE_URL` in `Info.plist` matches your Railway URL exactly
3. Check Railway logs for any backend errors
4. Ensure CORS is configured to allow requests from iOS app

**For Local Development:**
1. Ensure the backend server is running at `http://localhost:3000`
2. Uncomment the ATS exceptions in `Info.plist`
3. Change `API_BASE_URL` to `http://localhost:3000`

### Simulator Issues
If the simulator doesn't work:
1. List available simulators: `xcrun simctl list devices`
2. Update the destination in build commands to match an available device
3. Try a different simulator model

## Development Notes

### iOS 17.0+ Required
The app uses modern SwiftUI APIs that require iOS 17.0 or later:
- `.onChange(of:initial:_:)` modifier
- `.formatted()` for date formatting
- Latest SwiftUI improvements

### Code Organization
- Views are organized by feature/screen
- Shared components are marked as `private struct`
- API client uses extensions for logical grouping
- Models are centralized for easy reuse

## Next Steps

1. **Configure Railway URL**: 
   - Get your Railway deployment URL
   - Update `Info.plist` with the correct URL
   - See `CONFIGURATION.md` for detailed instructions

2. **Verify Backend**: 
   - Ensure Railway deployment is running
   - Test API endpoints in browser
   - Check Supabase database connection

3. **Test iOS App**: 
   - Build and run in simulator
   - Test core features (chat, tasks, calendar)
   - Check Xcode console for any errors

4. **Production Preparation**:
   - Test on physical iOS devices
   - Configure signing certificates
   - Prepare App Store metadata and screenshots

## Support

For issues or questions:
1. Check the console logs in Xcode for detailed error messages
2. Verify the backend API is responding correctly
3. Review the Info.plist configuration

---

Built with ❤️ using SwiftUI