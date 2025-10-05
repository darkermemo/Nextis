# NextisApp (iOS)

SwiftUI iOS app wired to the Nextis backend.

## Open
- Open `ios/NextisApp/NextisApp.xcodeproj` in Xcode 15+

## Configure backend URL
- Edit `NextisApp.swift` and set:
```swift
private let client = APIClient(config: NextisConfig(baseURL: URL(string: "https://YOUR-BACKEND")!))
```
- If using HTTP (not HTTPS) during development, add ATS exceptions in `Info.plist` or use a tunnel (e.g., Cloudflare, ngrok) with HTTPS.

## Run
- Select an iOS Simulator (iOS 16+)
- Build and run

## What’s included
- Today view with grouped tasks
- Toggle completion
- “Why here?” explainer & move

Extend by pulling in additional API endpoints from the server.
