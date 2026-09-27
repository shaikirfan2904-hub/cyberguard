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
11. [Configuration](#configuration)
12. [API Reference](#api-reference)
13. [Socket.IO Events](#socketio-events)
14. [Security Notes](#security-notes)
15. [Troubleshooting](#troubleshooting)
16. [Testing Checklist](#testing-checklist)

---

## Project Overview

CyberGuard AI detects and blocks aggressive or harmful messages in real time using a trained ML classifier (TF-IDF + Logistic Regression). When a message is flagged as aggressive, it is **not delivered** to the recipient — the sender receives an AI Safety Alert, a violation is recorded, and the event is logged for safety auditing.

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

### Social
- User registration with strong password validation
- Secure login/logout with hashed passwords (Werkzeug)
- User profiles (display name, avatar initials)
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
- Blocked message storage for safety auditing

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
├── evaluate_model.py         # Holdout and qualitative smoke evaluation
│
├── model/
│   ├── model.pkl             # Trained classifier
│   ├── vectorizer.pkl        # TF-IDF vectorizer
│   └── model_metadata.json   # Model evaluation metadata
│
├── datasets/
│   └── cleaned_dataset.csv   # Labeled training dataset
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
│
├── static/
│   ├── css/
│   │   ├── main.css          # Design system, components
│   │   ├── auth.css          # Landing & auth pages
│   │   ├── dashboard.css     # Sidebar, layout, profile, settings
│   │   ├── chat.css          # Chat area, messages, composer
│   │   └── responsive.css    # Responsive breakpoints
│   ├── js/
│   │   ├── app.js            # Core utilities (API, toast, modal)
│   │   ├── auth.js           # Login and registration
│   │   ├── socket.js         # Socket.IO connection manager
│   │   ├── dashboard.js      # Sidebar, chat list, friend requests
│   │   ├── chat.js           # Message display, sending, typing
│   │   ├── notifications.js  # Notification panel & badges
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
- `users`, `friend_requests`, `friendships`, `chat_messages`
- `abusers`, `blocked_messages`, `chat_read_status`, `notifications`, `user_activity`

---

## ML Model Training

The project ships with a pre-trained model in `model/`. The reproducible training script reads `datasets/cleaned_dataset.csv`, which must have `text` and `label` columns (`0` = safe, `1` = aggressive). It removes blank rows, non-binary labels, duplicate texts, and normalized text duplicates with conflicting labels.

Run training and evaluation with the project's virtual environment:

```bash
venv/Scripts/python.exe train_model.py
```

The script trains a class-balanced Logistic Regression classifier on word and character TF-IDF features. It keeps a stratified test set out of fitting and threshold selection, then selects a threshold on a separate validation set to maximize aggressive-message recall while keeping the safe-message false-positive rate at or below 5%.

By default, the trained model is saved under `model/candidate/` and the live model remains unchanged. To promote only if the candidate improves held-out F1 and recall while preserving precision and false-positive limits, run:

```bash
venv/Scripts/python.exe train_model.py --promote-if-better
```

The model metadata records the split sizes, threshold, confusion matrix, precision, recall, F1, and false-positive rate. Promotion saves the previous live model files in a timestamped `model/backups/` folder. An `AGGRESSION_THRESHOLD` in `.env` overrides the validated metadata value; otherwise the app uses the model's recorded threshold. The training data currently combines general user-generated text sources; it should not be treated as a British-English-specific or independently sourced benchmark without further data collection and evaluation.

Reproduce the held-out metrics and run the small qualitative behavior suite with:

```bash
venv/Scripts/python.exe evaluate_model.py
```

The hand-written cases are diagnostic examples only, not a replacement for a representative, independently labeled benchmark.

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

## Configuration

All settings are in `.env` (copy from `.env.example`):

| Setting | Default | Description |
|---------|---------|-------------|
| `SECRET_KEY` | change-this | Flask session secret key |
| `MYSQL_HOST` | 127.0.0.1 | MySQL host |
| `MYSQL_USER` | root | MySQL username |
| `MYSQL_PASSWORD` | (empty) | MySQL password |
| `MYSQL_DB` | cyber_aggression_copy | Database name (must match `database/schema.sql`) |
| `MYSQL_PORT` | 3306 | MySQL port |
| `AGGRESSION_THRESHOLD` | 0.65 | ML blocking threshold (0-1) |
| `SESSION_EXPIRY_HOURS` | 24 | Session lifetime |

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
- **Authentication decorators**: `@login_required` protect all endpoints.
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
- If missing, run `venv/Scripts/python.exe train_model.py --promote-if-better` to train and install a candidate that meets the safety gate
- The app reads the validated model threshold from metadata unless `AGGRESSION_THRESHOLD` is explicitly set in `.env`

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
