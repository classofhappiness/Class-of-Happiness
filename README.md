# Class of Happiness - Emotional Wellness App

A full-stack mobile application for emotional check-ins, regulation strategies, and home-school connection.

## 🎯 Overview

This app helps students, parents, and teachers track emotional wellness using the "Zones of Regulation" framework:
- **Blue Zone**: Sad, tired, sick, bored
- **Green Zone**: Calm, happy, focused, ready to learn  
- **Yellow Zone**: Anxious, excited, silly, nervous
- **Red Zone**: Angry, terrified, out of control

## 🛠 Tech Stack

- **Frontend**: Expo (React Native) with expo-router
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Authentication**: Google OAuth

## 📁 Project Structure

```
├── backend/
│   ├── server.py          # Main FastAPI server (6000+ lines, all endpoints)
│   ├── requirements.txt   # Python dependencies
│   └── .env              # Environment variables (MONGO_URL, GOOGLE credentials)
│
├── frontend/
│   ├── app/              # Expo Router pages (file-based routing)
│   │   ├── index.tsx     # Home/role selection
│   │   ├── _layout.tsx   # Root layout
│   │   ├── settings.tsx  # Settings page
│   │   ├── admin/        # Admin dashboard
│   │   ├── teacher/      # Teacher pages (dashboard, students, resources)
│   │   ├── parent/       # Parent/Family pages (dashboard, strategies, linked-child)
│   │   ├── student/      # Student check-in pages (zone, strategies, rewards)
│   │   ├── profiles/     # Student profile management
│   │   └── subscription/ # Subscription pages
│   │
│   ├── src/
│   │   ├── components/   # Reusable components (Avatar, Logo, CelebrationOverlay, etc.)
│   │   ├── context/      # AppContext (auth, state, translations)
│   │   └── utils/        # API functions, sounds
│   │
│   ├── assets/           # Images, fonts
│   ├── app.json          # Expo configuration
│   └── package.json      # Node dependencies
```

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+
- Python 3.9+
- MongoDB (local or Atlas)
- Expo CLI (`npm install -g expo-cli`)

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your MongoDB URL and Google OAuth credentials

# Run server
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
yarn install  # or npm install

# Configure environment
# Edit .env with your backend URL:
# EXPO_PUBLIC_BACKEND_URL=http://localhost:8001

# Start Expo
npx expo start
```

## 🔑 Environment Variables

### Backend (.env)
```env
MONGO_URL=mongodb://localhost:27017/class_of_happiness
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### Frontend (.env)
```env
EXPO_PUBLIC_BACKEND_URL=http://your-backend-url
EXPO_PACKAGER_PROXY_URL=...  # Set by Expo
```

## 👥 User Roles

1. **Student**: Check-in emotions, use strategies, earn creature rewards
2. **Parent**: Manage family, track home emotions, link with school
3. **Teacher**: Manage classrooms, view analytics, share student tracking
4. **Admin**: Global resources, analytics dashboard, user management

## 🎮 Key Features

### For Students
- Emotional zone check-ins with emojis
- Regulation strategies selection
- Creature collection rewards system
- Sound effects and celebrations

### For Parents
- Family member management
- Home check-ins for family
- Family strategies (with photo upload)
- Link children from school via teacher codes
- View school strategies and check-ins

### For Teachers  
- Classroom management
- Student tracking with analytics
- Generate link codes for parents
- View home data (with parent permission)
- PDF reports with strategy frequencies
- Upload resources

### For Admins
- Global resource management
- Analytics dashboard with charts
- User/school statistics
- Export data functionality

## 🔗 Home-School Connection

1. Teacher generates a link code for a student
2. Parent enters code to link child
3. Parent can view school check-ins/strategies
4. Parent can share home data with teacher (opt-in)
5. Links auto-expire after 30 days

## 🌐 Multi-Language Support

- English (EN)
- Spanish (ES)
- French (FR)
- German (DE)
- Portuguese (PT)

## 🎫 Test Promo Codes

- **Trial Access**: `HAPPYCLASS2026`, `CLASSOFHAPPINESS2026`
- **Admin Access**: `ADMINCLASS2026`, `HAPPYADMIN2026`

## 📱 Building for Production

```bash
cd frontend

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```
