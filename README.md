# PersonaSync

**Organize faces with a click.** PersonaSync is a comprehensive face recognition and organization platform that helps users manage, organize, and share photos with intelligent face detection and grouping.

---

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Frontend](#frontend)
- [Backend](#backend)
- [ML Service](#ml-service)
- [Key Features](#key-features)
- [Installation & Setup](#installation--setup)
- [Running the Application](#running-the-application)

---

## 🎯 Project Overview

PersonaSync is a full-stack application designed to:
- **Detect faces** in uploaded images using machine learning
- **Organize photos** by detected individuals
- **Manage groups** of photos with collaborative features
- **Real-time chat** between connected users
- **Share invitations** to connect with other users
- **Persist data** in MongoDB database with GridFS for file storage

The application uses **Clerk** for authentication, **Socket.io** for real-time communication, and a dedicated ML service for face detection and recognition.

---

## 🏗️ Architecture

```
PersonaSync (Root)
├── frontend/          # React + Vite SPA
├── backend/           # Node.js + Express API server
├── ml-service/        # Python Flask ML service
└── README.md          # Project documentation
```

### Data Flow

1. **User uploads image** → Frontend sends to Backend
2. **Backend stores image** in MongoDB GridFS
3. **Backend calls ML Service** with image URL for face detection
4. **ML Service detects faces** and returns results with bounding boxes
5. **Backend processes results**, creates face crops, stores in GridFS
6. **Backend saves metadata** to MongoDB (persons, images, faces)
7. **Frontend fetches** updated gallery with detected faces

---

## 🛠️ Technology Stack

### Frontend
- **React 18** - UI library
- **Vite** - Build tool & dev server
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **Socket.io-client** - Real-time communication
- **Clerk** - Authentication
- **React Router** - Client-side routing

### Backend
- **Node.js** - Runtime
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - MongoDB ODM
- **GridFS** - File storage in MongoDB
- **Socket.io** - Real-time events
- **Multer** - File upload handling
- **Sharp** - Image processing
- **Axios** - HTTP client

### ML Service
- **Python** - Language
- **Flask** - Web framework
- **OpenCV** - Computer vision
- **Face Recognition** - Face detection & recognition library
- **NumPy** - Numerical computing
- **Pillow** - Image processing

---

## 📁 Project Structure

### Frontend (`frontend/`)

```
frontend/
├── public/                 # Static assets
├── src/
│   ├── components/
│   │   └── Layout.jsx     # Main layout with sidebar, header, navigation
│   ├── contexts/
│   │   └── ThemeContext.jsx # Dark/light mode theme management
│   ├── pages/             # Route pages
│   │   ├── Dashboard.jsx    # Home/stats dashboard
│   │   ├── Upload.jsx       # Image upload interface
│   │   ├── Gallery.jsx      # Gallery with face detection overlay
│   │   ├── Chat.jsx         # Real-time messaging interface
│   │   ├── Persons.jsx      # List of detected people
│   │   ├── PersonDetail.jsx # Individual person's photos
│   │   ├── Groups.jsx       # Photo groups management
│   │   ├── GroupDetail.jsx  # Individual group view
│   │   ├── Invite.jsx       # User invitations
│   │   ├── SignInPage.jsx   # Authentication pages
│   │   └── SignUpPage.jsx
│   ├── services/
│   │   └── api.js         # Authenticated API requests
│   ├── App.jsx            # Root component
│   ├── main.jsx           # Entry point
│   └── index.css          # Global styles, custom scrollbar
├── package.json
├── vite.config.js
└── README.md
```

**Key Frontend Features:**
- Responsive design with collapsible sidebar
- Real-time chat with presence indicators
- File/image attachments in messages (5MB limit)
- Unread message badges
- Image gallery with face detection overlays
- Person and group management
- Theme toggle (dark/light mode)
- Search across photos, people, groups
- Contact management with remove/clear functions

---

### Backend (`backend/`)

```
backend/
├── src/
│   ├── app.js             # Express app configuration
│   ├── server.js          # Server startup and MongoDB connection
│   ├── socket.js          # Socket.io event handlers
│   ├── models/            # MongoDB schemas
│   │   ├── Image.js         # Image metadata + face records
│   │   ├── Person.js        # Detected person/individual
│   │   ├── Group.js         # Group of photos
│   │   ├── Message.js       # Chat messages
│   │   ├── Invitation.js    # Connection invitations
│   │   └── FaceIdentity.js  # ML ID to person mapping
│   ├── routes/            # API endpoints (feature-organized)
│   │   ├── upload.routes.js   # POST /api/upload (GridFS storage)
│   │   ├── image.routes.js    # GET/DELETE images, file downloads
│   │   ├── person.routes.js   # GET persons and details
│   │   ├── group.routes.js    # GET/POST/DELETE groups
│   │   ├── invite.routes.js   # Connection invitations
│   │   └── chat.routes.js     # Messages, presence, file sharing
│   └── utils/
│       ├── routeHelpers.js    # Shared utilities
│       └── gridfs.js          # MongoDB GridFS operations
├── package.json
├── test-socket.js         # Socket.io testing utility
└── uploads/               # Legacy: now uses GridFS
```

**Key Backend Responsibilities:**
- **File Storage**: Uses MongoDB GridFS instead of local disk
- **Image Processing**: Sharp for face crops, image resizing
- **ML Integration**: Calls Python ML service for face detection
- **Real-time Events**: Socket.io for presence, messages, notifications
- **Data Persistence**: MongoDB for all application data
- **Authentication**: Validates Clerk tokens on requests
- **File Serving**: Streams files from GridFS to clients

**API Organization by Feature:**
- `/api/upload` - Image uploads with ML processing
- `/api/images` - Gallery and file management
- `/api/persons` - People detection and grouping
- `/api/groups` - Photo group organization
- `/api/invites` - User connections
- `/api/chat` - Messaging system

---

### ML Service (`ml-service/`)

```
ml-service/
├── app/
│   ├── main.py         # Flask app and endpoints
│   ├── ml_core.py      # Face detection logic
│   ├── state.py        # In-memory state management
│   └── utils.py        # Helper functions
├── personasync.py      # Entry point
├── requirements.txt    # Python dependencies
└── .gitignore
```

**ML Service Functionality:**
- **Face Detection**: Uses OpenCV and face_recognition library
- **Image Processing**: Handles various image formats
- **Face Crops**: Extracts face regions with confidence scores
- **Person Tracking**: Maintains per-user face embeddings
- **REST API**: `POST /process-image` endpoint
  - Input: user_id, image_url
  - Output: Array of detected faces with bounding boxes and person IDs
- **Stateful**: Maintains face encodings per user for recognition

---

## ✨ Key Features

### 📸 Image Management
- Upload images (PNG, JPG, WebP)
- Automatic face detection and cropping
- Face-specific overlays with bounding boxes
- Image metadata storage (dimensions, timestamps)
- Batch image display with lazy loading

### 👤 Person Management
- Automatic person detection from faces
- Manual name assignment
- Person thumbnail generation
- Photo count tracking
- Individual person galleries

### 📁 Group Management
- Create photo groups
- Assign images to groups
- Group cover images
- Group descriptions

### 💬 Real-time Chat
- Message persistence in database
- File/image attachments (5MB limit)
- Presence indicators (online/offline)
- Hover-based timestamps
- Auto-expanding message input
- Unread message badges
- Custom scrollbar styling
- Three-dot menu for:
  - Clear all messages
  - Remove contact
- Confirmation modals instead of alert boxes

### 👥 Connection Management
- Send/receive invitations
- Accept/decline connections
- View connected users
- Chat with connections
- Contact removal

### 🔐 Authentication
- Clerk integration
- User-specific data isolation
- Token-based API requests

### 🎨 UI/UX Features
- Dark/light theme toggle
- Responsive design
- Collapsible sidebar (icon-only on resize)
- Mobile navigation drawer
- Global search (photos, people, groups)
- Toast notifications
- Modal dialogs
- Smooth animations

---

## 📦 Installation & Setup

### Prerequisites
- Node.js (v18+)
- Python (v3.8+)
- MongoDB (local or Atlas)
- Clerk account for authentication

### Step 1: Clone Repository
```bash
cd PersonaSync
```

### Step 2: Frontend Setup
```bash
cd frontend
npm install
# Configure Vite if needed (already configured)
```

### Step 3: Backend Setup
```bash
cd backend
npm install
```

**Create `.env` file in `backend/`:**
```env
MONGO_URI=mongodb://127.0.0.1:27017/personasync
PORT=4000
ML_SERVICE_URL=http://localhost:5000
```

### Step 4: ML Service Setup
```bash
cd ml-service
pip install -r requirements.txt
```

**Create `.env` file in `ml-service/`:**
```env
FLASK_ENV=development
FLASK_PORT=5000
```

---

## 🚀 Running the Application

### Terminal 1: Backend Server
```bash
cd backend
npm start
# Or: node src/server.js
# Server runs on http://localhost:4000
```

### Terminal 2: Frontend Dev Server
```bash
cd frontend
npm run dev
# Dev server runs on http://localhost:5173
```

### Terminal 3: ML Service
```bash
cd ml-service
python personasync.py
# Service runs on http://localhost:5000
```

### Terminal 4: (Optional) ML Service with Uvicorn
```bash
cd ml-service
uvicorn app.main:app --reload --port 5000
```

---

## 🔄 Data Flow Examples

### Uploading an Image
1. User selects image in Upload.jsx
2. Frontend sends FormData to `POST /api/upload`
3. Backend receives, stores in GridFS
4. Backend calls ML service with full URL
5. ML service detects faces, returns bounding boxes
6. Backend extracts face crops, stores in GridFS
7. Backend creates Person records, saves Image metadata
8. Backend returns response with detected persons
9. Frontend redirects to gallery
10. Gallery fetches images from `/api/images` (with full URLs)
11. Images display with face overlays

### Sending a Chat Message
1. User types message and optionally attaches file
2. Frontend sends to `POST /api/chat/messages`
3. Backend stores message in MongoDB
4. Backend stores file in GridFS (if attached)
5. Backend emits Socket.io event: `message:received`
6. Recipient receives in real-time
7. Message persists in database
8. Chat history loads from `GET /api/chat/messages`

### Real-time Presence
1. User opens Chat page
2. Frontend registers with Socket.io
3. Backend tracks presence in memory
4. Frontend polls `/api/chat/presence` periodically
5. Backend returns online status for contacts
6. Frontend displays presence indicators

---

## 📊 Database Schema

### Collections

**Images**
- userId, url, fileId (GridFS), width, height
- persons (PersonId array), faces (bbox, faceUrl)

**Persons**
- userId, mlId (from ML service), name, thumbnail, count

**Messages**
- fromEmail, toEmail, text, type (text/image/file)
- fileId (GridFS), fileName, fileSize, mimeType, timestamps

**Invitations**
- senderEmail, targetEmail, status (pending/accepted)

**Groups**
- userId, name, description, imageIds (array)

**FaceIdentity**
- userId, mlId (ML person ID), personId, name

---

## 🔧 Configuration

### Frontend (vite.config.js)
- React plugin configured
- Port: 5173 (default)

### Backend (src/server.js)
- MongoDB connection: `MONGO_URI` env variable
- Port: `PORT` env variable (default 4000)
- GridFS initialization on connect

### ML Service (app/main.py)
- Flask server on port 5000
- Face detection model auto-loads
- Per-user face encoding cache

---

## 📝 Notes

- All file uploads (images, chat attachments, face crops) are stored in **MongoDB GridFS**, not on disk
- Message persistence is enabled - chats survive logout/login
- Face detection happens automatically on image upload
- Person grouping is done by the ML service (mlId)
- URLs in responses are full HTTP URLs from backend
- Socket.io namespace: default (no custom namespace)
- Chat file downloads: `/api/chat/files/:fileId`
- Image file downloads: `/api/images/file/:fileId`

---

## 🎓 Learning Points

This project demonstrates:
- Full-stack architecture with separated concerns
- Real-time communication (Socket.io)
- ML service integration
- File storage in database (GridFS)
- Authentication & authorization
- Responsive UI with Tailwind CSS
- Theme management
- State persistence (localStorage)
- Error handling & user feedback
- RESTful API design
- MongoDB & Mongoose patterns

---

## 📄 License

PersonaSync - Face Recognition and Photo Organization Platform

Created with focus on user experience and modern web technologies.
