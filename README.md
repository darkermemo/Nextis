# Nextis (WeekMind) - Intelligent Planning Assistant

A full-stack AI-powered planning and productivity system with natural language processing, adaptive scheduling, and cross-platform support.

## 🚀 Quick Links

- **Backend API**: https://nextis-production.up.railway.app
- **Railway Dashboard**: https://railway.com/project/fdd7b305-6196-4c38-8ab9-626259d1d64f
- **Documentation**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **iOS Setup**: [ios/NextisApp/README.md](ios/NextisApp/README.md)

## 🏗️ Architecture

### Backend (Node.js + Express)
- **Hosting**: Railway
- **Database**: Supabase (PostgreSQL)
- **AI**: OpenAI GPT-4o
- **Features**: Natural language task parsing, adaptive scheduling, learning system

### Frontend (React + Vite)
- Modern React with TypeScript
- TanStack Query for state management
- Tailwind CSS + Radix UI components
- Real-time updates

### iOS App (SwiftUI)
- Native iOS 17+ app
- Full API integration
- Beautiful, modern UI
- See [ios/NextisApp/README.md](ios/NextisApp/README.md)

## 📦 Project Structure

```
nextis/
├── server/              # Express backend
│   ├── routes.ts        # API endpoints
│   ├── services/        # Business logic
│   └── db.ts           # Database connection
├── client/              # React frontend
│   └── src/
│       ├── components/  # UI components
│       ├── pages/       # App pages
│       └── lib/         # API client
├── ios/NextisApp/       # iOS native app
│   ├── NextisApp/       # Main app code
│   └── README.md        # iOS setup guide
├── shared/              # Shared TypeScript types
├── railway.toml         # Railway config
├── DEPLOYMENT.md        # Deployment guide
└── .env.example         # Environment template
```

## 🛠️ Setup

### 1. Clone and Install
```bash
git clone <your-repo>
cd nextis
npm install
```

### 2. Configure Environment
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials:
# - DATABASE_URL (from Supabase)
# - OPENAI_API_KEY (from OpenAI)
```

### 3. Run Locally
```bash
# Development mode (frontend + backend)
npm run dev

# Backend only
npm run dev

# Build for production
npm run build
npm start
```

### 4. iOS App Setup
See [ios/NextisApp/README.md](ios/NextisApp/README.md) for detailed iOS setup instructions.

Quick start:
```bash
cd ios/NextisApp
open NextisApp.xcodeproj
# Press Cmd+R to build and run
```

## 🌐 Deployment

### Current Production
- **URL**: https://nextis-production.up.railway.app
- **Status**: ✅ Live
- **Auto-deploy**: Enabled on `main` branch

### Deploy to Railway
```bash
# Link to project
railway link -p astonishing-analysis

# Check status
railway status

# View logs
railway logs

# Deploy (auto-deploys via git push)
git push origin main
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## 🔑 Key Features

### AI-Powered Planning
- Natural language task input
- Intelligent scheduling based on habits
- Adaptive learning from user behavior
- Context-aware suggestions

### Cross-Platform
- Web app (React)
- iOS native app (SwiftUI)
- Consistent experience across devices

### Comprehensive Features
- ✅ Task management with priorities
- 📅 Calendar view with time slots
- 🧠 Learning and habit tracking
- 💪 Gym/workout planning
- 💧 Health tracking (water, sleep, activity)
- 📧 Gmail integration
- 📊 Weekly insights and analytics
- 🎯 Mood tracking

## 📱 API Endpoints

### Core
- `GET /api/tasks` - Get all tasks
- `PATCH /api/tasks/:id` - Update task
- `GET /api/calendar` - Get weekly calendar
- `GET /api/next` - Get next actions
- `POST /api/chat/parse` - Natural language input

### Features
- `POST /api/mood` - Update mood
- `GET /api/learning/*` - Learning preferences
- `GET /api/health/*` - Health tracking
- `POST /api/workout/*` - Gym planning
- `GET /api/weekly/*` - Weekly summaries
- `GET /api/gmail/*` - Gmail integration

Full API documentation: See `server/routes.ts`

## 🔧 Environment Variables

### Required
```bash
DATABASE_URL=postgresql://...    # Supabase connection
OPENAI_API_KEY=sk-...           # OpenAI API key
OPENAI_MODEL=gpt-4o             # AI model
PORT=3000                        # Server port
NODE_ENV=production              # Environment
TZ=Asia/Riyadh                   # Timezone
```

### Optional
```bash
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview
SESSION_SECRET=...               # Session encryption
```

See `.env.example` for complete list.

## 🧪 Testing

### Test Backend
```bash
# Test API is running
curl https://nextis-production.up.railway.app/api/tasks

# Should return JSON with tasks
```

### Test iOS App
1. Open Xcode project
2. Build and run (Cmd+R)
3. Check console for any errors
4. Test core features

## 📚 Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment and configuration
- [ios/NextisApp/README.md](ios/NextisApp/README.md) - iOS app setup
- [ios/NextisApp/CONFIGURATION.md](ios/NextisApp/CONFIGURATION.md) - iOS configuration details
- [replit.md](replit.md) - Original Replit documentation

## 🐛 Troubleshooting

### Backend Issues
```bash
# Check Railway logs
railway logs

# Check status
railway status

# Test locally
npm run dev
```

### iOS App Issues
- Verify `Info.plist` has correct Railway URL
- Check Xcode console for errors
- Ensure backend is running
- See [ios/NextisApp/README.md](ios/NextisApp/README.md)

### Database Issues
- Verify `DATABASE_URL` in Railway
- Check Supabase dashboard
- Run migrations if needed: `npm run db:push`

## 🤝 Contributing

1. Create a feature branch
2. Make changes
3. Test locally
4. Push and create PR
5. Railway auto-deploys on merge to main

## 📄 License

MIT

## 🙏 Credits

Built with:
- Express.js
- React + Vite
- SwiftUI
- PostgreSQL (Supabase)
- OpenAI GPT-4o
- Railway

---

**Status**: ✅ Production Ready  
**Last Updated**: 2025-10-05  
**Backend**: https://nextis-production.up.railway.app
