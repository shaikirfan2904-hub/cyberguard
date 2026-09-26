# CyberGuard AI

**Real-time communication. Intelligent protection.**

CyberGuard AI is an industry-grade real-time private messaging platform with an integrated Machine Learning-based cyber aggression detection system. It combines the UX patterns of modern messaging apps (WhatsApp, Telegram, Discord) with AI-powered content safety — all built on Flask, Socket.IO, MySQL, and scikit-learn.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Technology Stack](#technology-stack)
5. [Project Structure](#project-structure)
6. [Prerequisites](#prerequisites)
7. [Installation](#installation)
8. [Database Setup (XAMPP + phpMyAdmin)](#database-setup-xampp--phpmyadmin)
9. [ML Model Training](#ml-model-training)
10. [Running the Application](#running-the-application)
11. [Default Admin Setup](#default-admin-setup)
12. [Configuration](#configuration)
13. [API Reference](#api-reference)
14. [Socket.IO Events](#socketio-events)
15. [Security Notes](#security-notes)
16. [Troubleshooting](#troubleshooting)
17. [Testing Checklist](#testing-checklist)

---

## Project Overview

CyberGuard AI detects and blocks aggressive or harmful messages in real time using a trained ML classifier (TF-IDF + Logistic Regression). When a message is flagged as aggressive, it is **not delivered** to the recipient — the sender receives an AI Safety Alert, a violation is recorded, and the event is logged for admin monitoring.

The ML model uses **contextual classification** — not simple keyword matching. For example:

- "That concert was fucking incredible" → **SAFE** (profanity in positive context)
- "You are a fucking waste of oxygen" → **AGGRESSIVE** (directed attack)

---

## Features

### Messaging
- Real-time 1-to-1 messaging via Flask-SocketIO
- Persistent chat history (MySQL)
- Offline message delivery with unread counts
- "New Messages" divider for unread messages
- Typing indicators
- Message delivery & read receipts (single/double check marks)
- Date separators
- Message deletion (for me / for everyone)
- Conversation clearing
- Infinite scroll pagination
- In-conversation message search

### Social
- User registration with strong password validation
- Secure login/logout with hashed passwords (Werkzeug)
- User profiles (display name, bio, avatar initials)
- Friend request system (send, accept, reject, remove)
- User search by username
- Online/offline presence with real-time updates

### AI Safety
- Real-time ML aggression detection on every outgoing message
- TF-IDF word + character n-gram features
- Logistic Regression classifier with class balancing
- Configurable detection threshold (default 0.65)
- AI Safety Alert modal with confidence, category, and reason
- Violation tracking with risk levels (LOW → MEDIUM → HIGH → CRITICAL)
- Blocked message storage for admin review

### Admin Dashboard
- Separate admin login (`/admin_login`)
- Dashboard cards: total users, online users, messages, blocked messages, flagged users, violations
- Bar charts: messages over time, blocked messages over time
- Abusive users table with risk badges
- Blocked messages table with confidence bars
- All users table with status indicators
- Search and filter across all tables

### UI/UX
- Dark cybersecurity theme with electric blue accents
- Glassmorphism, subtle gradients, glow effects
- Skeleton loaders, toast notifications, modals
- Responsive: mobile (320px), tablet (768px), desktop (1280px+)
- Accessible: semantic HTML, ARIA labels, keyboard navigation, focus states
- Connection status indicator
- Empty states for all views

---

## Architecture

```
Browser
  │  HTTP / REST + WebSocket / Socket.IO
  ▼
Flask Application
  ├── Flask Routes (REST API + page rendering)
  ├── Flask-SocketIO (real-time events)
  ├── Authentication / Sessions
  ├── Chat Logic
  ├── ML Detection Engine (detection_engine.py)
  └── MySQL Database (via XAMPP)
```

**ML Pipeline:**

```
Message → Text Preprocessing → TF-IDF Vectorizer → ML Model → Probability
                                                                    │
                                                         ┌──────────┴──────────┐
                                                         ▼                     ▼
                                                       SAFE                AGGRESSIVE
                                                         │                     │
                                                    Deliver              Block + Warn
                                                                         + Violation
                                                                         + Store
                                                                         + Admin Log
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Python 3.11+, Flask 3.0 |
| Real-time | Flask-SocketIO 5.3, Eventlet, Socket.IO 4.8.3 |
| Database | MySQL (XAMPP), phpMyAdmin |
| DB Driver | mysql-connector-python, Flask-MySQLdb |
| ML | scikit-learn, pandas, NumPy, NLTK, TF-IDF |
| Config | python-dotenv |

---

## Project Structure

```
cyberguard-ai/
├── app.py                    # Flask application (routes, API, Socket.IO)
├── config.py                 # Configuration from environment variables
├── detection_engine.py       # ML inference engine (predict_aggression)
├── requirements.txt          # Python dependencies
├── .env.example              # Environment configuration template
├── README.md
│
├── train_model.py            # Model training pipeline
├── evaluate_model.py         # Model evaluation script
├── preprocess.py             # Text preprocessing (NLTK, normalization)
├── merge_datasets.py         # Dataset merger + seed data
│
├── model/
│   ├── model.pkl             # Trained classifier
│   ├── vectorizer.pkl        # TF-IDF vectorizer
│   └── model_metadata.json   # Model evaluation metadata
│
├── datasets/
│   ├── raw/                  # Place raw CSV datasets here
│   ├── processed/
│   └── cleaned_dataset.csv   # Merged training dataset
│
├── logs/
│   ├── blocked_messages.log
│   ├── user_activity.log
│   └── error.log
│
├── templates/
│   ├── base.html             # Base template
│   ├── index.html            # Landing page
│   ├── login.html            # User login
│   ├── register.html         # User registration
│   ├── dashboard.html        # Main chat interface
│   ├── profile.html          # User profile
│   ├── settings.html         # User settings
│   ├── admin_login.html      # Admin login
│   └── admin.html            # Admin dashboard
│
├── static/
│   ├── css/
│   │   ├── main.css          # Design system, components
│   │   ├── auth.css          # Landing & auth pages
│   │   ├── dashboard.css     # Sidebar, layout, profile, settings
│   │   ├── chat.css          # Chat area, messages, composer
│   │   ├── admin.css         # Admin dashboard
│   │   └── responsive.css    # Responsive breakpoints
│   ├── js/
│   │   ├── app.js            # Core utilities (API, toast, modal)
│   │   ├── auth.js           # Login, register, admin login
│   │   ├── socket.js         # Socket.IO connection manager
│   │   ├── dashboard.js      # Sidebar, chat list, friend requests
│   │   ├── chat.js           # Message display, sending, typing
│   │   ├── notifications.js  # Notification panel & badges
│   │   └── admin.js          # Admin dashboard logic
│   └── images/
│
└── database/
    └── schema.sql            # MySQL schema (import to phpMyAdmin)
```

---

## Prerequisites

- **Windows 10/11** (or macOS/Linux)
- **XAMPP** with Apache and MySQL
- **Python 3.11+**
- **VS Code** (recommended) or any code editor

---

## Installation

### 1. Download / Clone the Project

Place the project folder in your desired location, e.g. `C:\cyberguard-ai`

### 2. Create a Python Virtual Environment

Open a terminal in the project folder:

```bash
python -m venv venv
```

**Activate:**

- **Windows:** `venv\Scripts\activate`
- **macOS/Linux:** `source venv/bin/activate`

### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment

Copy the example config and edit:

```bash
copy .env.example .env      # Windows
cp .env.example .env        # macOS/Linux
```

Edit `.env` with your settings (MySQL password, secret key, threshold).

---

## Database Setup (XAMPP + phpMyAdmin)

### 1. Start XAMPP

Open **XAMPP Control Panel** and start:
- **Apache**
- **MySQL**

### 2. Import the Schema

1. Open **phpMyAdmin** in your browser: `http://localhost/phpmyadmin`
2. Click **Import** in the top menu
3. Choose file: `database/schema.sql` from the project folder
4. Click **Go** to execute

This creates the `cyber_aggression` database with all tables, indexes, and constraints.

### 3. Verify

In phpMyAdmin, confirm the `cyber_aggression` database exists with these tables:
- `users`, `admins`, `friend_requests`, `friendships`, `chat_messages`
- `abusers`, `blocked_messages`, `chat_read_status`, `notifications`, `user_activity`

### 4. Set Up the Default Admin

The schema includes a placeholder admin row. To create a properly hashed admin password, run:

```bash
python -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('admin123'))"
```

Then in phpMyAdmin, update the admin's `password_hash`:

```sql
UPDATE admins SET password_hash = '<hash_from_above>' WHERE username = 'admin';
```

Alternatively, the Flask app will auto-create the default admin (from `.env` settings) on first startup if it doesn't exist.

---

## ML Model Training

The project ships with a pre-trained model in `model/`. To retrain from scratch or with additional data:

### 1. Add Datasets (Optional)

Place CSV files with `text` and `label` columns (0 = safe, 1 = aggressive) in `datasets/raw/`. The system supports Kaggle aggression datasets, Twitter data, TRAC datasets, etc.

If no raw datasets are found, a built-in seed dataset is used.

### 2. Merge Datasets

```bash
python merge_datasets.py
```

This merges all raw CSVs + seed data into `datasets/cleaned_dataset.csv`.

### 3. Train the Model

```bash
python train_model.py
```

This:
- Builds TF-IDF features (word 1-2 grams + character 2-5 grams)
- Compares Logistic Regression, Linear SVM, Naive Bayes, and Random Forest
- Selects the best model by F1 score
- Saves `model/model.pkl`, `model/vectorizer.pkl`, and `model/model_metadata.json`

### 4. Evaluate the Model

```bash
python evaluate_model.py
```

Outputs accuracy, precision, recall, F1, confusion matrix, and cross-model comparison.

---

## Running the Application

### 1. Ensure XAMPP MySQL is Running

Verify MySQL is started in XAMPP Control Panel (green indicator).

### 2. Start the Flask Server

```bash
python app.py
```

### 3. Open the Application

Navigate to: **http://localhost:5000**

---

## Default Admin Setup

Default admin credentials (configured in `.env`):

- **Username:** `admin`
- **Password:** `admin123`

**Change these immediately after first login** by updating `.env`:

```
ADMIN_USERNAME=your_admin_name
ADMIN_PASSWORD=your_secure_password
```

Admin login page: **http://localhost:5000/admin_login**

---

## Configuration

All settings are in `.env` (copy from `.env.example`):

| Setting | Default | Description |
|---------|---------|-------------|
| `SECRET_KEY` | change-this | Flask session secret key |
| `MYSQL_HOST` | 127.0.0.1 | MySQL host |
| `MYSQL_USER` | root | MySQL username |
| `MYSQL_PASSWORD` | (empty) | MySQL password |
| `MYSQL_DB` | cyber_aggression | Database name |
| `MYSQL_PORT` | 3306 | MySQL port |
| `AGGRESSION_THRESHOLD` | 0.65 | ML blocking threshold (0-1) |
| `SESSION_EXPIRY_HOURS` | 24 | Session lifetime |
| `ADMIN_USERNAME` | admin | Default admin username |
| `ADMIN_PASSWORD` | admin123 | Default admin password |

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/logout` | User logout |
| GET | `/api/auth/me` | Current user info |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List friends |
| GET | `/api/users/search?q=` | Search users |
| GET | `/api/users/<username>` | Get user profile |

### Friends
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/friends/request` | Send friend request |
| GET | `/api/friends/requests` | List pending requests |
| POST | `/api/friends/request/<id>/accept` | Accept request |
| POST | `/api/friends/request/<id>/reject` | Reject request |
| DELETE | `/api/friends/<username>` | Remove friend |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/messages/<username>` | Get chat history |
| GET | `/api/messages/<username>/unread-count` | Unread count |
| GET | `/api/messages/search?q=` | Search messages |
| DELETE | `/api/messages/<id>` | Delete message |
| DELETE | `/api/messages/<username>/clear` | Clear conversation |

### Profile
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/profile` | Get profile |
| PUT | `/api/profile` | Update profile |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | List notifications |
| POST | `/api/notifications/<id>/read` | Mark as read |
| POST | `/api/notifications/read-all` | Mark all read |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/stats` | Dashboard statistics |
| GET | `/api/admin/abusers` | Abusive users list |
| GET | `/api/admin/blocked-messages` | Blocked messages list |
| GET | `/api/admin/users` | All users list |

---

## Socket.IO Events

### Client → Server
| Event | Data | Description |
|-------|------|-------------|
| `join_chat` | `{username}` | Join conversation room |
| `leave_chat` | `{username}` | Leave conversation room |
| `send_message` | `{receiver, message}` | Send a message (ML-checked) |
| `typing_start` | `{receiver}` | Typing indicator start |
| `typing_stop` | `{receiver}` | Typing indicator stop |
| `message_read` | `{username}` | Mark messages as read |

### Server → Client
| Event | Data | Description |
|-------|------|-------------|
| `receive_message` | Message object | Incoming message |
| `message_sent` | Message object | Send confirmation |
| `message_blocked` | Alert data | AI blocked the message |
| `user_online` | `{username}` | User came online |
| `user_offline` | `{username}` | User went offline |
| `typing_start` | `{sender}` | Contact is typing |
| `typing_stop` | `{sender}` | Contact stopped typing |
| `message_read_receipt` | `{reader}` | Messages were read |
| `new_friend_request` | Request data | Incoming friend request |
| `friend_request_accepted` | `{from}` | Request accepted |
| `friend_request_rejected` | `{from}` | Request rejected |
| `error` | `{message}` | Error occurred |

---

## Security Notes

- **Passwords** are hashed using Werkzeug's `generate_password_hash` (PBKDF2-SHA256). Plaintext passwords are never stored or returned in API responses.
- **SQL Injection** prevention: all database queries use parameterized queries via `mysql.connector`. No string concatenation in SQL.
- **XSS** prevention: all user-generated content is HTML-escaped in the frontend via `escapeHtml()`.
- **Session security**: Flask sessions with configurable expiry, `PERMANENT_SESSION_LIFETIME`.
- **Authentication decorators**: `@login_required` and `@admin_required` protect all endpoints.
- **Authorization checks**: users can only access their own data; message deletion verifies ownership.
- **ML is authoritative**: the backend always runs aggression detection. Client-side results are never trusted.
- **Input validation**: username format, email format, password strength, message length limits.
- **Error handling**: Python stack traces are never exposed to users. Errors are logged server-side.

---

## Troubleshooting

### MySQL Connection Failed
- Ensure XAMPP MySQL is running (green in Control Panel)
- Check `.env` MySQL credentials match your XAMPP setup
- Default XAMPP MySQL has no password (empty `MYSQL_PASSWORD`)
- Verify the `cyber_aggression` database was imported

### Socket.IO Not Connecting
- Ensure you're accessing via `http://localhost:5000` (not the file directly)
- Check browser console for connection errors
- The Flask server must be running with `python app.py`

### Model Not Loading
- Ensure `model/model.pkl` and `model/vectorizer.pkl` exist
- If missing, run `python train_model.py` to train
- The app will fall back to keyword-based detection if model files are missing (with a warning in logs)

### Eventlet Installation Issues (Windows)
```bash
pip install eventlet==0.36.1
```
If eventlet fails, you can temporarily change `async_mode` in `app.py` to `threading`:
```python
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
```

### NLTK Data Download Issues
NLTK data is downloaded automatically on first run. If it fails:
```bash
python -c "import nltk; nltk.download('stopwords'); nltk.download('wordnet')"
```

### Port 5000 Already in Use
Change the port in `app.py`:
```python
socketio.run(app, host="0.0.0.0", port=5001, debug=True)
```

---

## Testing Checklist

- [ ] Registration works (validates username, email, strong password)
- [ ] Login works
- [ ] Logout works
- [ ] Session protection works (redirects to login when not authenticated)
- [ ] MySQL connection works
- [ ] Friend request sent successfully
- [ ] Friend request accepted successfully
- [ ] Friend request rejected successfully
- [ ] Remove friend works
- [ ] Real-time messaging works (messages appear instantly)
- [ ] Offline delivery works (messages received on next login)
- [ ] Unread counts display correctly
- [ ] "New Messages" divider appears for unread messages
- [ ] Typing indicator works
- [ ] Online/offline status updates in real time
- [ ] Read receipts work (double check marks)
- [ ] Message deletion works (for me and for everyone)
- [ ] AI detection blocks aggressive messages
- [ ] Blocked messages are stored in database
- [ ] Violations increment per blocked message
- [ ] AI Safety Alert modal appears for blocked messages
- [ ] Admin login works
- [ ] Admin dashboard shows correct stats
- [ ] Admin can search users and blocked messages
- [ ] Responsive UI works on mobile/tablet/desktop
- [ ] Database schema imports into phpMyAdmin
- [ ] No plaintext passwords stored
- [ ] No SQL injection vulnerabilities
- [ ] No mock data or fake functionality
- [ ] No console-breaking JavaScript errors

---

## License

This project is built for educational and research purposes.

© 2025 CyberGuard AI. Built for safer digital communication.
