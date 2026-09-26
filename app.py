"""
CyberGuard AI - Flask Application
Real-time chat with ML-based cyber aggression detection.

Architecture:
  Flask + Flask-SocketIO (eventlet) + MySQL (XAMPP) + scikit-learn ML
"""

import os
import json
import logging
import datetime
from functools import wraps

from flask import (
    Flask, render_template, request, session, redirect,
    url_for, jsonify, abort
)
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import generate_password_hash, check_password_hash
import mysql.connector
from mysql.connector import pooling

from config import Config
from detection_engine import predict_aggression

# ============================================================
# Logging setup
# ============================================================
os.makedirs(Config.LOG_DIR, exist_ok=True)
os.makedirs(os.path.join(Config.LOG_DIR), exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(os.path.join(Config.LOG_DIR, "user_activity.log")),
        logging.StreamHandler(),
    ]
)
error_logger = logging.getLogger("cyberguard.error")
error_logger.addHandler(logging.FileHandler(os.path.join(Config.LOG_DIR, "error.log")))
blocked_logger = logging.getLogger("cyberguard.blocked")
blocked_logger.addHandler(logging.FileHandler(os.path.join(Config.LOG_DIR, "blocked_messages.log")))

logger = logging.getLogger("cyberguard.app")

# The original schema shipped with a placeholder digest that cannot validate
# the documented bootstrap password. Replace that one known seed on startup.
_INVALID_SCHEMA_ADMIN_HASH = (
    "pbkdf2:sha256:600000$W4CyGuard$"
    "9e8a0c7b3d2f1e6a5c4b3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1"
)

# ============================================================
# Flask + Socket.IO initialization
# ============================================================
app = Flask(__name__)
app.config.from_object(Config)
app.config["SECRET_KEY"] = Config.SECRET_KEY

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="eventlet",
    ping_timeout=60,
    ping_interval=25,
)

# ============================================================
# MySQL connection pool
# ============================================================
_db_pool = None


def get_db():
    """Get a MySQL connection from the pool."""
    global _db_pool
    if _db_pool is None:
        try:
            _db_pool = pooling.MySQLConnectionPool(
                pool_name="cyberguard_pool",
                pool_size=10,
                host=Config.MYSQL_HOST,
                user=Config.MYSQL_USER,
                password=Config.MYSQL_PASSWORD,
                database=Config.MYSQL_DB,
                port=Config.MYSQL_PORT,
                charset="utf8mb4",
                collation="utf8mb4_unicode_ci",
                autocommit=False,
            )
        except Exception as e:
            error_logger.error(f"Database connection pool failed: {e}")
            raise
    return _db_pool.get_connection()


def query_db(sql, params=None, fetch="all", commit=False):
    """
    Execute a parameterized query safely.
    fetch: 'all' | 'one' | None
    """
    conn = None
    cursor = None
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(sql, params or ())

        result = None
        if fetch == "all":
            result = cursor.fetchall()
        elif fetch == "one":
            result = cursor.fetchone()
        elif fetch == "lastrowid":
            result = cursor.lastrowid

        if commit:
            conn.commit()
        return result
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        error_logger.error(f"DB query error: {e} | SQL: {sql[:100]}")
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# ============================================================
# Helpers
# ============================================================
def init_db():
    """Create default admin if not exists."""
    try:
        query_db(
            "ALTER TABLE chat_messages MODIFY message_type ENUM('text','blocked') NOT NULL DEFAULT 'text'",
            fetch=None, commit=True
        )
        query_db(
            """CREATE TABLE IF NOT EXISTS message_deletions (
                   username VARCHAR(50) NOT NULL,
                   message_id INT NOT NULL,
                   deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                   PRIMARY KEY (username, message_id),
                   CONSTRAINT fk_md_user FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
                   CONSTRAINT fk_md_message FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
               ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""",
            fetch=None, commit=True
        )
        query_db(
            """CREATE TABLE IF NOT EXISTS user_preferences (
                   username VARCHAR(50) NOT NULL PRIMARY KEY,
                   preferences_json TEXT NOT NULL,
                   updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                   CONSTRAINT fk_preferences_user FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
               ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci""",
            fetch=None, commit=True
        )
        admin = query_db(
            "SELECT id, password_hash FROM admins WHERE username = %s",
            (Config.ADMIN_USERNAME,), fetch="one"
        )
        if not admin:
            pw_hash = generate_password_hash(Config.ADMIN_PASSWORD)
            query_db(
                "INSERT INTO admins (username, password_hash) VALUES (%s, %s)",
                (Config.ADMIN_USERNAME, pw_hash), commit=True
            )
            logger.info(f"Default admin '{Config.ADMIN_USERNAME}' created.")
        elif admin["password_hash"] == _INVALID_SCHEMA_ADMIN_HASH:
            query_db(
                "UPDATE admins SET password_hash = %s WHERE id = %s",
                (generate_password_hash(Config.ADMIN_PASSWORD), admin["id"]),
                fetch=None, commit=True
            )
            logger.info("Replaced the invalid schema bootstrap admin password hash.")
    except Exception as e:
        error_logger.error(f"init_db admin check failed: {e}")


def log_activity(username, action, ip=None):
    """Log user activity to the database."""
    try:
        query_db(
            "INSERT INTO user_activity (username, action, ip_address) VALUES (%s, %s, %s)",
            (username, action, ip), commit=True
        )
    except Exception as e:
        error_logger.error(f"Activity log failed: {e}")


DEFAULT_USER_PREFERENCES = {
    "warningDisplay": True,
    "notifFriend": True,
    "notifMessage": True,
    "onlineStatus": True,
    "readReceipts": True,
}


def get_user_preferences(username):
    row = query_db(
        "SELECT preferences_json FROM user_preferences WHERE username = %s",
        (username,), fetch="one"
    )
    preferences = dict(DEFAULT_USER_PREFERENCES)
    if row:
        try:
            saved = json.loads(row["preferences_json"] or "{}")
            if isinstance(saved, dict):
                preferences.update({
                    key: bool(saved[key])
                    for key in DEFAULT_USER_PREFERENCES
                    if key in saved
                })
        except (TypeError, ValueError):
            pass
    return preferences


def compute_risk_level(violations):
    """Determine risk level from violation count using config thresholds."""
    thresholds = Config.RISK_THRESHOLDS
    if violations >= thresholds["CRITICAL"]:
        return "CRITICAL"
    elif violations >= thresholds["HIGH"]:
        return "HIGH"
    elif violations >= thresholds["MEDIUM"]:
        return "MEDIUM"
    else:
        return "LOW"


def create_notification(username, ntype, title, message):
    """Insert a notification and return the row id."""
    try:
        return query_db(
            """INSERT INTO notifications (username, type, title, message)
               VALUES (%s, %s, %s, %s)""",
            (username, ntype, title, message), fetch="lastrowid", commit=True
        )
    except Exception as e:
        error_logger.error(f"Notification creation failed: {e}")
        return None


def get_unread_notification_count(username):
    try:
        row = query_db(
            "SELECT COUNT(*) as cnt FROM notifications WHERE username = %s AND is_read = FALSE",
            (username,), fetch="one"
        )
        return row["cnt"] if row else 0
    except Exception:
        return 0


def get_friend_count(username):
    try:
        row = query_db(
            """SELECT COUNT(*) as cnt FROM friendships
               WHERE user1 = %s OR user2 = %s""",
            (username, username), fetch="one"
        )
        return row["cnt"] if row else 0
    except Exception:
        return 0


def are_friends(user1, user2):
    try:
        row = query_db(
            """SELECT id FROM friendships
               WHERE (user1 = %s AND user2 = %s) OR (user1 = %s AND user2 = %s)""",
            (user1, user2, user2, user1), fetch="one"
        )
        return row is not None
    except Exception:
        return False


# ============================================================
# Auth decorators
# ============================================================
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            if request.is_json or request.path.startswith("/api/"):
                return jsonify({"success": False, "message": "Authentication required."}), 401
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "admin_id" not in session:
            if request.is_json or request.path.startswith("/api/"):
                return jsonify({"success": False, "message": "Admin authentication required."}), 401
            return redirect(url_for("admin_login"))
        return f(*args, **kwargs)
    return decorated


# ============================================================
# Page routes
# ============================================================
@app.route("/")
def index():
    if "user_id" in session:
        return redirect(url_for("dashboard"))
    return render_template("index.html")


@app.route("/login")
def login():
    if "user_id" in session:
        return redirect(url_for("dashboard"))
    return render_template("login.html")


@app.route("/register")
def register():
    if "user_id" in session:
        return redirect(url_for("dashboard"))
    return render_template("register.html")


@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html", username=session.get("username"))


@app.route("/profile")
@login_required
def profile():
    return render_template("profile.html")


@app.route("/settings")
@login_required
def settings():
    return render_template(
        "settings.html",
        detection_threshold=Config.AGGRESSION_THRESHOLD
    )


@app.route("/admin_login")
def admin_login():
    if "admin_id" in session:
        return redirect(url_for("admin"))
    return render_template("admin_login.html")


@app.route("/admin")
@admin_required
def admin():
    return render_template("admin.html", admin_username=session.get("admin_username"))


@app.route("/logout", methods=["GET", "POST"])
def logout():
    # Browser back/forward navigation must not invalidate a signed-in session.
    if request.method == "GET":
        return redirect(url_for("dashboard" if "user_id" in session else "login"))

    username = session.get("username")
    if username:
        try:
            query_db(
                "UPDATE users SET status = 'offline', last_seen = NOW() WHERE username = %s",
                (username,), commit=True
            )
            log_activity(username, "logout", request.remote_addr)
            socketio.emit("user_offline", {"username": username})
        except Exception as e:
            error_logger.error(f"Logout error: {e}")
    session.clear()
    return redirect(url_for("login"))


@app.route("/admin_logout", methods=["GET", "POST"])
def admin_logout():
    if request.method == "GET":
        return redirect(url_for("admin" if "admin_id" in session else "admin_login"))
    session.pop("admin_id", None)
    session.pop("admin_username", None)
    return redirect(url_for("admin_login"))


# ============================================================
# Auth API
# ============================================================
@app.route("/api/auth/register", methods=["POST"])
def api_register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    confirm = data.get("confirm_password") or ""

    # Validation
    if not username or len(username) < 3 or len(username) > 50:
        return jsonify({"success": False, "message": "Username must be 3-50 characters."}), 400
    if not username.replace("_", "").replace(".", "").isalnum():
        return jsonify({"success": False, "message": "Username can only contain letters, numbers, underscores and dots."}), 400
    if "@" not in email or "." not in email:
        return jsonify({"success": False, "message": "Please enter a valid email address."}), 400
    if len(password) < 8:
        return jsonify({"success": False, "message": "Password must be at least 8 characters."}), 400
    if not any(c.isupper() for c in password) or not any(c.isdigit() for c in password):
        return jsonify({"success": False, "message": "Password must contain at least one uppercase letter and one number."}), 400
    if password != confirm:
        return jsonify({"success": False, "message": "Passwords do not match."}), 400

    try:
        existing = query_db(
            "SELECT id FROM users WHERE username = %s OR email = %s",
            (username, email), fetch="one"
        )
        if existing:
            return jsonify({"success": False, "message": "Username or email already registered."}), 409

        pw_hash = generate_password_hash(password)
        query_db(
            """INSERT INTO users (username, email, password_hash, display_name)
               VALUES (%s, %s, %s, %s)""",
            (username, email, pw_hash, username), commit=True
        )
        log_activity(username, "register", request.remote_addr)
        logger.info(f"New user registered: {username}")
        return jsonify({"success": True, "message": "Account created successfully. Please log in."}), 201
    except Exception as e:
        error_logger.error(f"Register error: {e}")
        return jsonify({"success": False, "message": "Registration failed. Please try again."}), 500


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"success": False, "message": "Username and password are required."}), 400

    try:
        user = query_db(
            "SELECT id, username, password_hash FROM users WHERE username = %s",
            (username,), fetch="one"
        )
        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"success": False, "message": "Invalid username or password."}), 401

        is_visible = get_user_preferences(user["username"])["onlineStatus"]
        query_db(
            "UPDATE users SET status = %s, last_seen = NOW() WHERE id = %s",
            ("online" if is_visible else "offline", user["id"]), commit=True
        )
        session.permanent = True
        session["user_id"] = user["id"]
        session["username"] = user["username"]
        log_activity(user["username"], "login", request.remote_addr)

        if is_visible:
            socketio.emit("user_online", {"username": user["username"]})
        return jsonify({
            "success": True, "message": "Login successful.",
            "data": {"username": user["username"]}
        }), 200
    except Exception as e:
        error_logger.error(f"Login error: {e}")
        return jsonify({"success": False, "message": "Login failed. Please try again."}), 500


@app.route("/api/auth/logout", methods=["POST"])
@login_required
def api_logout():
    username = session.get("username")
    try:
        if username:
            query_db(
                "UPDATE users SET status = 'offline', last_seen = NOW() WHERE username = %s",
                (username,), commit=True
            )
            log_activity(username, "logout", request.remote_addr)
            socketio.emit("user_offline", {"username": username})
    except Exception as e:
        error_logger.error(f"Logout API error: {e}")
    session.clear()
    return jsonify({"success": True, "message": "Logged out."}), 200


@app.route("/api/auth/me")
@login_required
def api_me():
    try:
        user = query_db(
            """SELECT id, username, email, display_name, profile_picture, bio,
                      status, last_seen, created_at
               FROM users WHERE id = %s""",
            (session["user_id"],), fetch="one"
        )
        if not user:
            return jsonify({"success": False, "message": "User not found."}), 404
        abuse = query_db(
            "SELECT violations FROM abusers WHERE username = %s",
            (user["username"],), fetch="one"
        )
        violations = int(abuse["violations"] or 0) if abuse else 0
        return jsonify({
            "success": True, "data": {
                "id": user["id"],
                "username": user["username"],
                "email": user["email"],
                "display_name": user["display_name"],
                "profile_picture": user["profile_picture"],
                "bio": user["bio"],
                "status": user["status"],
                "last_seen": user["last_seen"].isoformat() if user["last_seen"] else None,
                "created_at": user["created_at"].isoformat() if user["created_at"] else None,
                "violations": violations,
                "is_flagged": violations >= Config.ABUSIVE_USER_FLAG_THRESHOLD,
            }
        }), 200
    except Exception as e:
        error_logger.error(f"Me error: {e}")
        return jsonify({"success": False, "message": "Failed to fetch profile."}), 500


# ============================================================
# Profile API
# ============================================================
@app.route("/api/profile", methods=["GET"])
@login_required
def api_get_profile():
    try:
        user = query_db(
            """SELECT id, username, email, display_name, profile_picture, bio,
                      status, last_seen, created_at
               FROM users WHERE id = %s""",
            (session["user_id"],), fetch="one"
        )
        if not user:
            return jsonify({"success": False, "message": "User not found."}), 404
        return jsonify({
            "success": True, "data": {
                "id": user["id"],
                "username": user["username"],
                "email": user["email"],
                "display_name": user["display_name"] or user["username"],
                "profile_picture": user["profile_picture"],
                "bio": user["bio"],
                "status": user["status"],
                "last_seen": user["last_seen"].isoformat() if user["last_seen"] else None,
                "created_at": user["created_at"].isoformat() if user["created_at"] else None,
            }
        }), 200
    except Exception as e:
        error_logger.error(f"Profile GET error: {e}")
        return jsonify({"success": False, "message": "Failed to fetch profile."}), 500


@app.route("/api/profile", methods=["PUT"])
@login_required
def api_update_profile():
    data = request.get_json(silent=True) or {}
    display_name = (data.get("display_name") or "").strip()

    if display_name and len(display_name) > 100:
        return jsonify({"success": False, "message": "Display name must be under 100 characters."}), 400
    try:
        query_db(
            "UPDATE users SET display_name = %s, updated_at = NOW() WHERE id = %s",
            (display_name or None, session["user_id"]), commit=True
        )
        return jsonify({"success": True, "message": "Profile updated successfully."}), 200
    except Exception as e:
        error_logger.error(f"Profile PUT error: {e}")
        return jsonify({"success": False, "message": "Failed to update profile."}), 500


@app.route("/api/settings", methods=["GET", "PUT"])
@login_required
def api_settings():
    username = session["username"]
    try:
        if request.method == "GET":
            return jsonify({"success": True, "data": get_user_preferences(username)}), 200

        data = request.get_json(silent=True) or {}
        if any(key not in DEFAULT_USER_PREFERENCES or not isinstance(value, bool)
               for key, value in data.items()):
            return jsonify({"success": False, "message": "Invalid settings values."}), 400

        preferences = get_user_preferences(username)
        preferences.update(data)
        query_db(
            """INSERT INTO user_preferences (username, preferences_json)
               VALUES (%s, %s)
               ON DUPLICATE KEY UPDATE preferences_json = VALUES(preferences_json)""",
            (username, json.dumps(preferences)), commit=True
        )

        if "onlineStatus" in data:
            status = "online" if preferences["onlineStatus"] else "offline"
            query_db(
                "UPDATE users SET status = %s, last_seen = NOW() WHERE username = %s",
                (status, username), commit=True
            )
            socketio.emit("user_" + status, {"username": username})

        return jsonify({"success": True, "data": preferences}), 200
    except Exception as e:
        error_logger.error(f"Settings API error: {e}")
        return jsonify({"success": False, "message": "Failed to save settings."}), 500


# ============================================================
# Users API
# ============================================================
@app.route("/api/users")
@login_required
def api_users():
    """Get all friends + pending requests for the current user."""
    try:
        username = session["username"]
        friends = query_db(
            """SELECT u.username, u.display_name, u.status, u.last_seen,
                      COALESCE(a.violations, 0) AS violations
               FROM friendships f
               JOIN users u ON u.username = CASE WHEN f.user1 = %s THEN f.user2 ELSE f.user1 END
               LEFT JOIN abusers a ON a.username = u.username
               WHERE f.user1 = %s OR f.user2 = %s
               ORDER BY u.display_name""",
            (username, username, username), fetch="all"
        )
        for friend in (friends or []):
            friend["violations"] = int(friend["violations"] or 0)
            friend["is_flagged"] = friend["violations"] >= Config.ABUSIVE_USER_FLAG_THRESHOLD
            friend["last_seen"] = friend["last_seen"].isoformat() if friend["last_seen"] else None
        return jsonify({"success": True, "data": friends or []}), 200
    except Exception as e:
        error_logger.error(f"Users list error: {e}")
        return jsonify({"success": False, "message": "Failed to load users."}), 500


@app.route("/api/users/search")
@login_required
def api_search_users():
    q = (request.args.get("q") or "").strip()
    if len(q) < 2:
        return jsonify({"success": True, "data": []}), 200

    try:
        username = session["username"]
        pattern = f"%{q}%"
        users = query_db(
            """SELECT u.username, u.display_name, u.status, u.last_seen,
                      COALESCE(a.violations, 0) AS violations
               FROM users u
               LEFT JOIN abusers a ON a.username = u.username
               WHERE u.username LIKE %s AND u.username != %s
               LIMIT 20""",
            (pattern, username), fetch="all"
        )

        # Enrich with friendship status
        results = []
        for u in (users or []):
            status = "none"
            if are_friends(username, u["username"]):
                status = "friend"
            else:
                pending = query_db(
                    """SELECT id, status FROM friend_requests
                       WHERE ((sender = %s AND receiver = %s) OR (sender = %s AND receiver = %s))
                       AND status = 'pending'""",
                    (username, u["username"], u["username"], username), fetch="one"
                )
                if pending:
                    status = "pending"
            results.append({
                "username": u["username"],
                "display_name": u["display_name"],
                "online": u["status"] == "online",
                "last_seen": u["last_seen"].isoformat() if u["last_seen"] else None,
                "friendship_status": status,
                "violations": int(u["violations"] or 0),
                "is_flagged": int(u["violations"] or 0) >= Config.ABUSIVE_USER_FLAG_THRESHOLD,
            })
        return jsonify({"success": True, "data": results}), 200
    except Exception as e:
        error_logger.error(f"Search error: {e}")
        return jsonify({"success": False, "message": "Search failed."}), 500


@app.route("/api/users/<username>")
@login_required
def api_get_user(username):
    try:
        user = query_db(
            """SELECT username, display_name, bio, status, last_seen, created_at
               FROM users WHERE username = %s""",
            (username,), fetch="one"
        )
        if not user:
            return jsonify({"success": False, "message": "User not found."}), 404
        is_friend = are_friends(session["username"], username)
        return jsonify({
            "success": True, "data": {
                "username": user["username"],
                "display_name": user["display_name"] or user["username"],
                "bio": user["bio"],
                "status": user["status"],
                "online": user["status"] == "online",
                "last_seen": user["last_seen"].isoformat() if user["last_seen"] else None,
                "is_friend": is_friend,
            }
        }), 200
    except Exception as e:
        error_logger.error(f"Get user error: {e}")
        return jsonify({"success": False, "message": "Failed to fetch user."}), 500


# ============================================================
# Friends API
# ============================================================
@app.route("/api/friends/request", methods=["POST"])
@login_required
def api_send_friend_request():
    data = request.get_json(silent=True) or {}
    receiver = (data.get("receiver") or "").strip()

    if not receiver:
        return jsonify({"success": False, "message": "Username is required."}), 400
    if receiver == session["username"]:
        return jsonify({"success": False, "message": "You cannot send a friend request to yourself."}), 400

    try:
        # Check receiver exists
        target = query_db("SELECT id FROM users WHERE username = %s", (receiver,), fetch="one")
        if not target:
            return jsonify({"success": False, "message": "User not found."}), 404

        # Check if already friends
        if are_friends(session["username"], receiver):
            return jsonify({"success": False, "message": "You are already friends with this user."}), 409

        # Check for existing pending request
        existing = query_db(
            """SELECT id, sender, receiver, status FROM friend_requests
               WHERE (sender = %s AND receiver = %s) OR (sender = %s AND receiver = %s)
               ORDER BY id DESC LIMIT 1""",
            (session["username"], receiver, receiver, session["username"]), fetch="one"
        )
        reused_request = False
        if existing:
            if existing["status"] == "pending":
                return jsonify({"success": False, "message": "A friend request is already pending."}), 409
            elif (existing["sender"], existing["receiver"]) == (session["username"], receiver):
                # Reuse the same-direction row to respect uq_friend_pair.
                query_db(
                    "UPDATE friend_requests SET status = 'pending', updated_at = NOW() WHERE id = %s",
                    (existing["id"],), commit=True
                )
                reused_request = True

        if not reused_request:
            query_db(
                "INSERT INTO friend_requests (sender, receiver, status) VALUES (%s, %s, 'pending')",
                (session["username"], receiver), commit=True
            )

        # Real-time notification
        notif_id = create_notification(
            receiver, "friend_request",
            "New Friend Request",
            f"{session['username']} sent you a friend request."
        )
        socketio.emit(
            "new_friend_request",
            {
                "from": session["username"],
                "to": receiver,
                "notification_id": notif_id,
                "message": f"{session['username']} sent you a friend request.",
            },
            room=receiver,
        )

        logger.info(f"Friend request: {session['username']} -> {receiver}")
        return jsonify({"success": True, "message": "Friend request sent."}), 201
    except Exception as e:
        error_logger.error(f"Friend request error: {e}")
        return jsonify({"success": False, "message": "Failed to send friend request."}), 500


@app.route("/api/friends/requests")
@login_required
def api_get_friend_requests():
    try:
        requests = query_db(
            """SELECT fr.id, fr.sender, fr.receiver, fr.status, fr.created_at,
                      u.display_name as sender_display,
                      COALESCE(a.violations, 0) AS sender_violations
               FROM friend_requests fr
               JOIN users u ON u.username = fr.sender
               LEFT JOIN abusers a ON a.username = fr.sender
               WHERE fr.receiver = %s AND fr.status = 'pending'
               ORDER BY fr.created_at DESC""",
            (session["username"],), fetch="all"
        )
        for item in (requests or []):
            item["sender_violations"] = int(item["sender_violations"] or 0)
            item["sender_flagged"] = item["sender_violations"] >= Config.ABUSIVE_USER_FLAG_THRESHOLD
            item["created_at"] = item["created_at"].isoformat() if item["created_at"] else None
        return jsonify({"success": True, "data": requests or []}), 200
    except Exception as e:
        error_logger.error(f"Get requests error: {e}")
        return jsonify({"success": False, "message": "Failed to load requests."}), 500


@app.route("/api/friends/request/<int:req_id>/accept", methods=["POST"])
@login_required
def api_accept_friend_request(req_id):
    try:
        req = query_db(
            "SELECT id, sender, receiver, status FROM friend_requests WHERE id = %s",
            (req_id,), fetch="one"
        )
        if not req:
            return jsonify({"success": False, "message": "Request not found."}), 404
        if req["receiver"] != session["username"]:
            return jsonify({"success": False, "message": "Not authorized."}), 403
        if req["status"] != "pending":
            return jsonify({"success": False, "message": "Request already processed."}), 409

        query_db(
            "UPDATE friend_requests SET status = 'accepted', updated_at = NOW() WHERE id = %s",
            (req_id,), commit=True
        )

        # Create friendship (ensure user1 < user2 for uniqueness)
        u1, u2 = sorted([req["sender"], req["receiver"]])
        query_db(
            "INSERT IGNORE INTO friendships (user1, user2) VALUES (%s, %s)",
            (u1, u2), commit=True
        )

        # Notify sender
        create_notification(
            req["sender"], "friend_accepted",
            "Friend Request Accepted",
            f"{session['username']} accepted your friend request."
        )
        socketio.emit(
            "friend_request_accepted",
            {"from": session["username"], "to": req["sender"]},
            room=req["sender"],
        )

        return jsonify({"success": True, "message": "Friend request accepted."}), 200
    except Exception as e:
        error_logger.error(f"Accept request error: {e}")
        return jsonify({"success": False, "message": "Failed to accept request."}), 500


@app.route("/api/friends/request/<int:req_id>/reject", methods=["POST"])
@login_required
def api_reject_friend_request(req_id):
    try:
        req = query_db(
            "SELECT id, sender, receiver, status FROM friend_requests WHERE id = %s",
            (req_id,), fetch="one"
        )
        if not req:
            return jsonify({"success": False, "message": "Request not found."}), 404
        if req["receiver"] != session["username"]:
            return jsonify({"success": False, "message": "Not authorized."}), 403
        if req["status"] != "pending":
            return jsonify({"success": False, "message": "Request already processed."}), 409

        query_db(
            "UPDATE friend_requests SET status = 'rejected', updated_at = NOW() WHERE id = %s",
            (req_id,), commit=True
        )

        socketio.emit(
            "friend_request_rejected",
            {"from": session["username"], "to": req["sender"]},
            room=req["sender"],
        )

        return jsonify({"success": True, "message": "Friend request rejected."}), 200
    except Exception as e:
        error_logger.error(f"Reject request error: {e}")
        return jsonify({"success": False, "message": "Failed to reject request."}), 500


@app.route("/api/friends/<username>", methods=["DELETE"])
@login_required
def api_remove_friend(username):
    try:
        if not are_friends(session["username"], username):
            return jsonify({"success": False, "message": "Not friends with this user."}), 404

        current_user = session["username"]
        conn = get_db()
        cursor = conn.cursor()
        try:
            cursor.execute(
                """DELETE FROM friendships
                   WHERE (user1 = %s AND user2 = %s) OR (user1 = %s AND user2 = %s)""",
                (current_user, username, username, current_user)
            )
            cursor.execute(
                """DELETE FROM chat_messages
                   WHERE (sender = %s AND receiver = %s) OR (sender = %s AND receiver = %s)""",
                (current_user, username, username, current_user)
            )
            cursor.execute(
                """DELETE FROM chat_read_status
                   WHERE (username = %s AND friend = %s) OR (username = %s AND friend = %s)""",
                (current_user, username, username, current_user)
            )
            cursor.execute(
                """DELETE FROM conversation_clears
                   WHERE (username = %s AND other_username = %s)
                      OR (username = %s AND other_username = %s)""",
                (current_user, username, username, current_user)
            )
            cursor.execute(
                """UPDATE friend_requests SET status = 'rejected', updated_at = NOW()
                   WHERE status = 'accepted'
                     AND ((sender = %s AND receiver = %s) OR (sender = %s AND receiver = %s))""",
                (current_user, username, username, current_user)
            )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()
            conn.close()

        message = f"You and @{username} are no longer friends."
        current_notification_id = create_notification(
            current_user, "friend_removed", "Friend removed", message
        )
        other_message = f"You and @{current_user} are no longer friends."
        other_notification_id = create_notification(
            username, "friend_removed", "Friend removed", other_message
        )
        socketio.emit(
            "friend_removed",
            {"removed_user": username, "notification_id": current_notification_id,
             "message": message},
            room=current_user
        )
        socketio.emit(
            "friend_removed",
            {"removed_user": current_user, "notification_id": other_notification_id,
             "message": other_message},
            room=username
        )
        logger.info(f"Friend removed: {session['username']} x {username}")
        return jsonify({
            "success": True,
            "message": "Friend removed and conversation deleted.",
            "removed_user": username,
            "notification_id": current_notification_id,
            "notification_message": message,
        }), 200
    except Exception as e:
        error_logger.error(f"Remove friend error: {e}")
        return jsonify({"success": False, "message": "Failed to remove friend."}), 500


# ============================================================
# Messages API
# ============================================================
@app.route("/api/messages/<username>")
@login_required
def api_get_messages(username):
    """Get paginated chat history with a specific user."""
    try:
        if not are_friends(session["username"], username):
            return jsonify({"success": False, "message": "You can only chat with friends."}), 403

        try:
            page = max(1, int(request.args.get("page", "1")))
        except (TypeError, ValueError):
            return jsonify({"success": False, "message": "Page must be a positive integer."}), 400
        per_page = Config.MESSAGES_PER_PAGE
        offset = (page - 1) * per_page

        messages = query_db(
            """SELECT id, sender, receiver, message, message_type, created_at, delivered_at,
                    read_at, is_deleted, deleted_for_everyone
            FROM chat_messages
            WHERE (
                (sender = %s AND receiver = %s)
                OR
                (sender = %s AND receiver = %s)
            )
            AND created_at > COALESCE(
                (
                    SELECT cleared_at
                    FROM conversation_clears
                    WHERE username = %s
                        AND other_username = %s
                    LIMIT 1
                ),
                '1970-01-01 00:00:00'
            )
            AND NOT EXISTS (
                SELECT 1 FROM message_deletions md
                WHERE md.message_id = chat_messages.id AND md.username = %s
            )
            ORDER BY created_at DESC, id DESC
            LIMIT %s OFFSET %s""",
            (
                session["username"],
                username,
                username,
                session["username"],
                session["username"],
                username,
                session["username"],
                per_page,
                offset
            ),
            fetch="all"
        )

        # Reverse to chronological order
        messages = list(reversed(messages or []))

        # Format datetime
        for m in messages:
            m["created_at"] = m["created_at"].isoformat() if m["created_at"] else None
            m["delivered_at"] = m["delivered_at"].isoformat() if m["delivered_at"] else None
            m["read_at"] = m["read_at"].isoformat() if m["read_at"] else None

        return jsonify({"success": True, "data": messages, "page": page}), 200
    except Exception as e:
        error_logger.error(f"Get messages error: {e}")
        return jsonify({"success": False, "message": "Failed to load messages."}), 500


@app.route("/api/messages/<username>/unread-count")
@login_required
def api_get_unread_count(username):
    """Get unread message count from a specific user."""
    try:
        row = query_db(
            """
            SELECT COUNT(*) as cnt
            FROM chat_messages
            WHERE sender = %s
            AND receiver = %s
            AND read_at IS NULL
            AND is_deleted = FALSE
            AND created_at > COALESCE(
                (
                    SELECT cleared_at
                    FROM conversation_clears
                    WHERE username = %s
                        AND other_username = %s
                    LIMIT 1
                ),
                '1970-01-01 00:00:00'
            )
            AND NOT EXISTS (
                SELECT 1 FROM message_deletions md
                WHERE md.message_id = chat_messages.id AND md.username = %s
            )
            """,
            (
                username,
                session["username"],
                session["username"],
                username,
                session["username"]
            ),
            fetch="one"
        )
        return jsonify({"success": True, "data": {"count": row["cnt"] if row else 0}}), 200
    except Exception as e:
        error_logger.error(f"Unread count error: {e}")
        return jsonify({"success": False, "message": "Failed to get unread count."}), 500


@app.route("/api/messages/<int:msg_id>", methods=["DELETE"])
@login_required
def api_delete_message(msg_id):
    """Delete a message (for me or for everyone)."""
    try:
        msg = query_db(
            "SELECT id, sender, receiver FROM chat_messages WHERE id = %s",
            (msg_id,), fetch="one"
        )
        if not msg:
            return jsonify({"success": False, "message": "Message not found."}), 404

        delete_everyone = request.args.get("everyone", "false").lower() == "true"

        if delete_everyone:
            if msg["sender"] != session["username"]:
                return jsonify({
                    "success": False,
                    "message": "You can only delete your own messages for everyone."
                }), 403

            query_db(
                """
                UPDATE chat_messages
                SET deleted_for_everyone = TRUE,
                    message = 'This message was deleted.',
                    is_deleted = TRUE
                WHERE id = %s
                """,
                (msg_id,),
                commit=True
            )

            # Send one real-time deletion event to the receiver.
            socketio.emit(
                "message_deleted",
                {
                    "message_id": msg_id,
                    "sender": msg["sender"],
                    "receiver": msg["receiver"],
                    "message": "This message was deleted.",
                    "deleted_for_everyone": True
                },
                room=msg["receiver"]
            )

        else:
            # Delete for me: check if user is sender or receiver
            if msg["sender"] != session["username"] and msg["receiver"] != session["username"]:
                return jsonify({"success": False, "message": "Not authorized."}), 403
            query_db(
                "INSERT IGNORE INTO message_deletions (username, message_id) VALUES (%s, %s)",
                (session["username"], msg_id), commit=True
            )

        return jsonify({"success": True, "message": "Message deleted."}), 200
    except Exception as e:
        error_logger.error(f"Delete message error: {e}")
        return jsonify({"success": False, "message": "Failed to delete message."}), 500


@app.route("/api/messages/<username>/clear", methods=["DELETE"])
@login_required
def api_clear_chat(username):
    """Clear conversation only for the currently logged-in user."""
    try:
        current_user = session["username"]

        if not are_friends(current_user, username):
            return jsonify({
                "success": False,
                "message": "Not friends with this user."
            }), 403

        # Store a user-specific clear timestamp.
        # Messages themselves are NOT deleted.
        query_db(
            """
            INSERT INTO conversation_clears
                (username, other_username, cleared_at)
            VALUES (%s, %s, NOW())
            ON DUPLICATE KEY UPDATE
                cleared_at = NOW()
            """,
            (current_user, username),
            commit=True
        )

        return jsonify({
            "success": True,
            "message": "Conversation cleared for you."
        }), 200

    except Exception as e:
        error_logger.error(f"Clear chat error: {e}")

        return jsonify({
            "success": False,
            "message": "Failed to clear conversation."
        }), 500


# ============================================================
# Notifications API
# ============================================================
@app.route("/api/notifications")
@login_required
def api_get_notifications():
    try:
        notifs = query_db(
            """SELECT id, type, title, message, is_read, created_at
               FROM notifications WHERE username = %s
               ORDER BY created_at DESC LIMIT 50""",
            (session["username"],), fetch="all"
        )
        for n in (notifs or []):
            n["created_at"] = n["created_at"].isoformat() if n["created_at"] else None
        return jsonify({"success": True, "data": notifs or []}), 200
    except Exception as e:
        error_logger.error(f"Notifications error: {e}")
        return jsonify({"success": False, "message": "Failed to load notifications."}), 500


@app.route("/api/notifications", methods=["DELETE"])
@login_required
def api_clear_notifications():
    try:
        query_db(
            "DELETE FROM notifications WHERE username = %s",
            (session["username"],), fetch=None, commit=True
        )
        return jsonify({"success": True, "message": "Notifications cleared."}), 200
    except Exception as e:
        error_logger.error(f"Clear notifications error: {e}")
        return jsonify({"success": False, "message": "Failed to clear notifications."}), 500


@app.route("/api/notifications/<int:notif_id>/read", methods=["POST"])
@login_required
def api_mark_notification_read(notif_id):
    try:
        query_db(
            "UPDATE notifications SET is_read = TRUE WHERE id = %s AND username = %s",
            (notif_id, session["username"]), commit=True
        )
        return jsonify({"success": True, "message": "Notification marked as read."}), 200
    except Exception as e:
        error_logger.error(f"Mark notification error: {e}")
        return jsonify({"success": False, "message": "Failed to update notification."}), 500


@app.route("/api/notifications/read-all", methods=["POST"])
@login_required
def api_mark_all_notifications_read():
    try:
        query_db(
            "UPDATE notifications SET is_read = TRUE WHERE username = %s",
            (session["username"],), commit=True
        )
        return jsonify({"success": True, "message": "All notifications marked as read."}), 200
    except Exception as e:
        error_logger.error(f"Mark all notifications error: {e}")
        return jsonify({"success": False, "message": "Failed to update notifications."}), 500


# ============================================================
# Admin API
# ============================================================
@app.route("/api/admin/login", methods=["POST"])
def api_admin_login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"success": False, "message": "Username and password are required."}), 400

    try:
        admin = query_db(
            "SELECT id, username, password_hash FROM admins WHERE username = %s",
            (username,), fetch="one"
        )
        if not admin or not check_password_hash(admin["password_hash"], password):
            return jsonify({"success": False, "message": "Invalid admin credentials."}), 401

        session["admin_id"] = admin["id"]
        session["admin_username"] = admin["username"]
        return jsonify({
            "success": True, "message": "Admin login successful.",
            "data": {"username": admin["username"]}
        }), 200
    except Exception as e:
        error_logger.error(f"Admin login error: {e}")
        return jsonify({"success": False, "message": "Admin login failed."}), 500


@app.route("/api/admin/stats")
@admin_required
def api_admin_stats():
    try:
        total_users = query_db("SELECT COUNT(*) as cnt FROM users", fetch="one")["cnt"]
        online_users = query_db("SELECT COUNT(*) as cnt FROM users WHERE status = 'online'", fetch="one")["cnt"]
        total_messages = query_db("SELECT COUNT(*) as cnt FROM chat_messages WHERE is_deleted = FALSE", fetch="one")["cnt"]
        blocked_messages = query_db("SELECT COUNT(*) as cnt FROM blocked_messages", fetch="one")["cnt"]
        flagged_users = query_db(
            "SELECT COUNT(*) as cnt FROM abusers WHERE violations >= %s",
            (Config.ABUSIVE_USER_FLAG_THRESHOLD,), fetch="one"
        )["cnt"]
        total_violations = query_db("SELECT COALESCE(SUM(violations), 0) as cnt FROM abusers", fetch="one")["cnt"]

        # Messages over time (last 7 days)
        msg_timeline = query_db(
            """SELECT DATE(created_at) as date, COUNT(*) as count
               FROM chat_messages WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
               GROUP BY DATE(created_at) ORDER BY date""",
            fetch="all"
        )
        # Blocked messages over time (last 7 days)
        blocked_timeline = query_db(
            """SELECT DATE(created_at) as date, COUNT(*) as count
               FROM blocked_messages WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
               GROUP BY DATE(created_at) ORDER BY date""",
            fetch="all"
        )

        return jsonify({
            "success": True, "data": {
                "total_users": total_users,
                "online_users": online_users,
                "total_messages": total_messages,
                "blocked_messages": blocked_messages,
                "flagged_users": flagged_users,
                "total_violations": total_violations,
                "messages_timeline": msg_timeline or [],
                "blocked_timeline": blocked_timeline or [],
            }
        }), 200
    except Exception as e:
        error_logger.error(f"Admin stats error: {e}")
        return jsonify({"success": False, "message": "Failed to load stats."}), 500


@app.route("/api/admin/abusers")
@admin_required
def api_admin_abusers():
    try:
        search = (request.args.get("q") or "").strip()
        if search:
            abusers = query_db(
                """SELECT a.id, a.username, a.violations, a.risk_level,
                          a.last_violation, a.created_at, u.display_name
                   FROM abusers a JOIN users u ON u.username = a.username
                   WHERE a.username LIKE %s OR u.display_name LIKE %s
                   ORDER BY a.violations DESC""",
                (f"%{search}%", f"%{search}%"), fetch="all"
            )
        else:
            abusers = query_db(
                """SELECT a.id, a.username, a.violations, a.risk_level,
                          a.last_violation, a.created_at, u.display_name
                   FROM abusers a JOIN users u ON u.username = a.username
                   ORDER BY a.violations DESC""",
                fetch="all"
            )
        for a in (abusers or []):
            a["last_violation"] = a["last_violation"].isoformat() if a["last_violation"] else None
            a["created_at"] = a["created_at"].isoformat() if a["created_at"] else None
        return jsonify({"success": True, "data": abusers or []}), 200
    except Exception as e:
        error_logger.error(f"Admin abusers error: {e}")
        return jsonify({"success": False, "message": "Failed to load abusers."}), 500


@app.route("/api/admin/blocked-messages")
@admin_required
def api_admin_blocked_messages():
    try:
        search = (request.args.get("q") or "").strip()
        if search:
            messages = query_db(
                """SELECT id, username, message, classification, confidence, reason, created_at
                   FROM blocked_messages
                   WHERE username LIKE %s OR message LIKE %s
                   ORDER BY created_at DESC LIMIT 200""",
                (f"%{search}%", f"%{search}%"), fetch="all"
            )
        else:
            messages = query_db(
                """SELECT id, username, message, classification, confidence, reason, created_at
                   FROM blocked_messages ORDER BY created_at DESC LIMIT 200""",
                fetch="all"
            )
        for m in (messages or []):
            m["created_at"] = m["created_at"].isoformat() if m["created_at"] else None
        return jsonify({"success": True, "data": messages or []}), 200
    except Exception as e:
        error_logger.error(f"Admin blocked messages error: {e}")
        return jsonify({"success": False, "message": "Failed to load blocked messages."}), 500


@app.route("/api/admin/users")
@admin_required
def api_admin_users():
    try:
        search = (request.args.get("q") or "").strip()
        if search:
            users = query_db(
                """SELECT id, username, email, display_name, status, last_seen, created_at
                   FROM users WHERE username LIKE %s OR email LIKE %s
                   ORDER BY created_at DESC""",
                (f"%{search}%", f"%{search}%"), fetch="all"
            )
        else:
            users = query_db(
                """SELECT id, username, email, display_name, status, last_seen, created_at
                   FROM users ORDER BY created_at DESC""",
                fetch="all"
            )
        for u in (users or []):
            u["last_seen"] = u["last_seen"].isoformat() if u["last_seen"] else None
            u["created_at"] = u["created_at"].isoformat() if u["created_at"] else None
        return jsonify({"success": True, "data": users or []}), 200
    except Exception as e:
        error_logger.error(f"Admin users error: {e}")
        return jsonify({"success": False, "message": "Failed to load users."}), 500


# ============================================================
# Socket.IO event handlers
# ============================================================
connected_users = {}  # sid -> username


@socketio.on("connect")
def handle_connect():
    if "user_id" not in session:
        return False  # reject connection
    username = session["username"]
    connected_users[request.sid] = username
    join_room(username)

    is_visible = True
    try:
        is_visible = get_user_preferences(username)["onlineStatus"]
        query_db(
            "UPDATE users SET status = %s, last_seen = NOW() WHERE username = %s",
            ("online" if is_visible else "offline", username), commit=True
        )
    except Exception as e:
        error_logger.error(f"Socket connect DB error: {e}")

    if is_visible:
        emit("user_online", {"username": username})
    logger.info(f"Socket connected: {username}")


@socketio.on("disconnect")
def handle_disconnect():
    username = connected_users.pop(request.sid, None)
    if username:
        leave_room(username)
        # Check if user has other active connections
        still_connected = username in connected_users.values()
        if not still_connected:
            try:
                query_db(
                    "UPDATE users SET status = 'offline', last_seen = NOW() WHERE username = %s",
                    (username,), commit=True
                )
                emit("user_offline", {"username": username})
            except Exception as e:
                error_logger.error(f"Socket disconnect DB error: {e}")
        logger.info(f"Socket disconnected: {username}")


@socketio.on("join_chat")
def handle_join_chat(data):
    """Join a personal room for receiving messages from a specific user."""
    other_user = (data or {}).get("username")
    if not other_user:
        return
    # Create a deterministic room name for the conversation pair
    room = "_".join(sorted([session["username"], other_user]))
    join_room(room)
    logger.info(f"{session['username']} joined chat room: {room}")


@socketio.on("leave_chat")
def handle_leave_chat(data):
    other_user = (data or {}).get("username")
    if not other_user:
        return
    room = "_".join(sorted([session["username"], other_user]))
    leave_room(room)


@socketio.on("typing_start")
def handle_typing_start(data):
    receiver = (data or {}).get("receiver")
    if not receiver:
        return
    emit("typing_start", {"sender": session["username"]}, room=receiver)


@socketio.on("typing_stop")
def handle_typing_stop(data):
    receiver = (data or {}).get("receiver")
    if not receiver:
        return
    emit("typing_stop", {"sender": session["username"]}, room=receiver)


@socketio.on("send_message")
def handle_send_message(data):
    """Validate, classify, store, and deliver a chat message safely."""

    data = data or {}

    receiver = (data.get("receiver") or "").strip()
    message_text = (data.get("message") or "").strip()

    # ------------------------------------------------------------
    # Basic validation
    # ------------------------------------------------------------
    if not receiver or not message_text:
        emit("error", {"message": "Invalid message data."})
        return

    if len(message_text) > Config.MAX_MESSAGE_LENGTH:
        emit("error", {"message": "Message too long."})
        return

    sender = session.get("username")
    if not sender:
        emit("error", {"message": "Authentication required."})
        return

    # ------------------------------------------------------------
    # Verify friendship
    # ------------------------------------------------------------
    if not are_friends(sender, receiver):
        emit("error", {"message": "You can only message friends."})
        return

    # ------------------------------------------------------------
    # ML detection
    #
    # The current detection_engine.py can return only:
    #   {"label": "...", "blocked": True/False}
    #
    # Older versions may also return confidence/category/reason.
    # Normalize both formats here.
    # ------------------------------------------------------------
    try:
        result = predict_aggression(
            message_text,
            threshold=Config.AGGRESSION_THRESHOLD
        )

        if not isinstance(result, dict):
            raise ValueError("Detection engine returned an invalid result.")

        blocked = bool(result.get("blocked", False))

        label = result.get(
            "label",
            "AGGRESSIVE" if blocked else "SAFE"
        )

        confidence = float(
            result.get(
                "confidence",
                1.0 if blocked else 0.0
            )
        )
        confidence = max(0.0, min(1.0, confidence))

        category = result.get(
            "category",
            "AGGRESSIVE" if blocked else "SAFE"
        )

        reason = result.get(
            "reason",
            "aggressive_detection" if blocked else "ml_model"
        )

        logger.info(
            f"[ML DETECTION] sender={sender} receiver={receiver} "
            f"label={label} blocked={blocked} "
            f"confidence={confidence:.4f} reason={reason}"
        )

    except Exception as e:
        error_logger.exception(
            f"ML detection error | sender={sender} receiver={receiver} "
            f"message='{message_text[:80]}' | error={e}"
        )

        emit(
            "error",
            {
                "message": (
                    "Message could not be checked for safety. "
                    "Please try again."
                )
            }
        )
        return

    # ------------------------------------------------------------
    # BLOCKED / AGGRESSIVE MESSAGE
    # ------------------------------------------------------------
    if blocked:
        try:
            # Store the ORIGINAL aggressive text only in blocked_messages.
            query_db(
                """INSERT INTO blocked_messages
                   (username, receiver, message, classification, confidence, reason)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (
                    sender,
                    receiver,
                    message_text,
                    label,
                    confidence,
                    reason
                ),
                commit=True
            )

            # Increment violation count.
            abuser = query_db(
                "SELECT id, violations FROM abusers WHERE username = %s",
                (sender,),
                fetch="one"
            )

            if abuser:
                new_count = int(abuser["violations"] or 0) + 1
                risk = compute_risk_level(new_count)

                query_db(
                    """UPDATE abusers
                       SET violations = %s,
                           last_violation = NOW(),
                           risk_level = %s,
                           updated_at = NOW()
                       WHERE username = %s""",
                    (new_count, risk, sender),
                    commit=True
                )
            else:
                new_count = 1

                query_db(
                    """INSERT INTO abusers
                       (username, violations, last_violation, risk_level)
                       VALUES (%s, 1, NOW(), %s)""",
                    (sender, compute_risk_level(1)),
                    commit=True
                )

            blocked_logger.info(
                f"BLOCKED | sender={sender} receiver={receiver} "
                f"confidence={confidence:.4f} "
                f"message='{message_text[:80]}'"
            )

            # Only this privacy-safe placeholder enters chat history.
            blocked_placeholder = "Message blocked due to privacy."

            blocked_message_id = query_db(
                """INSERT INTO chat_messages
                   (sender, receiver, message, message_type, delivered_at)
                   VALUES (%s, %s, %s, 'blocked', NOW())""",
                (sender, receiver, blocked_placeholder),
                fetch="lastrowid", commit=True
            )

            blocked_msg = query_db(
                """SELECT id, sender, receiver, message, message_type,
                          created_at, delivered_at, read_at
                   FROM chat_messages
                   WHERE id = %s""",
                (blocked_message_id,),
                fetch="one"
            )

            if blocked_msg:
                blocked_msg_data = {
                    "id": blocked_msg["id"],
                    "sender": blocked_msg["sender"],
                    "receiver": blocked_msg["receiver"],
                    "message": blocked_msg["message"],
                    "message_type": "blocked",
                    "created_at": (
                        blocked_msg["created_at"].isoformat()
                        if blocked_msg["created_at"] else None
                    ),
                    "delivered_at": (
                        blocked_msg["delivered_at"].isoformat()
                        if blocked_msg["delivered_at"] else None
                    ),
                    "read_at": (
                        blocked_msg["read_at"].isoformat()
                        if blocked_msg["read_at"] else None
                    ),
                }

                # Receiver sees only the privacy placeholder.
                socketio.emit(
                    "receive_blocked_message",
                    blocked_msg_data,
                    room=receiver
                )

                # Sender sees the same placeholder.
                emit("blocked_message_sent", blocked_msg_data)

            emit(
                "message_blocked",
                {
                    "to": receiver,
                    "message": blocked_placeholder,
                    "classification": label,
                    "violations": new_count,
                }
            )

            # Admin receives the original text for moderation.
            emit(
                "admin_blocked_message",
                {
                    "username": sender,
                    "message": message_text[:100],
                    "classification": label,
                    "confidence": confidence,
                }
            )

            logger.info(
                f"Message blocked from {sender} to {receiver} "
                f"(conf={confidence:.4f})"
            )

        except Exception as e:
            error_logger.exception(
                f"Block handling error | sender={sender} "
                f"receiver={receiver} | error={e}"
            )
            emit(
                "error",
                {"message": "Failed to process the blocked message."}
            )

        return

    # ------------------------------------------------------------
    # SAFE MESSAGE — store and deliver
    # ------------------------------------------------------------
    try:
        message_id = query_db(
            """INSERT INTO chat_messages
               (sender, receiver, message, message_type, delivered_at)
               VALUES (%s, %s, %s, 'text', NOW())""",
            (sender, receiver, message_text),
            fetch="lastrowid", commit=True
        )

        msg = query_db(
            """SELECT id, sender, receiver, message, message_type,
                      created_at, delivered_at, read_at
               FROM chat_messages
               WHERE id = %s""",
            (message_id,),
            fetch="one"
        )

        if not msg:
            emit(
                "error",
                {"message": "Message was saved but could not be loaded."}
            )
            return

        msg_data = {
            "id": msg["id"],
            "sender": msg["sender"],
            "receiver": msg["receiver"],
            "message": msg["message"],
            "message_type": msg["message_type"],
            "created_at": (
                msg["created_at"].isoformat()
                if msg["created_at"] else None
            ),
            "delivered_at": (
                msg["delivered_at"].isoformat()
                if msg["delivered_at"] else None
            ),
            "read_at": (
                msg["read_at"].isoformat()
                if msg["read_at"] else None
            ),
        }

        # Receiver gets the message in real time.
        socketio.emit(
            "receive_message",
            msg_data,
            room=receiver
        )

        # Sender gets confirmation.
        emit("message_sent", msg_data)

        logger.info(
            f"Message: {sender} -> {receiver} "
            f"(id={msg['id']})"
        )

    except Exception as e:
        error_logger.exception(
            f"Message store error | sender={sender} "
            f"receiver={receiver} | error={e}"
        )
        emit(
            "error",
            {"message": "Failed to send message."}
        )


@socketio.on("message_read")
def handle_message_read(data):
    """Mark messages as read when user opens a chat."""
    other_user = (data or {}).get("username")
    if not other_user:
        return

    try:
        if not get_user_preferences(session["username"])["readReceipts"]:
            return
        # Mark all messages from other_user to me as read
        query_db(
            """UPDATE chat_messages SET read_at = NOW()
               WHERE sender = %s AND receiver = %s AND read_at IS NULL""",
            (other_user, session["username"]), commit=True
        )

        # Update read status
        query_db(
            """INSERT INTO chat_read_status (username, friend, last_read_message_id, updated_at)
               VALUES (%s, %s, 0, NOW())
               ON DUPLICATE KEY UPDATE last_read_message_id = 0, updated_at = NOW()""",
            (session["username"], other_user), commit=True
        )

        # Notify sender that messages were read
        emit("message_read_receipt", {"reader": session["username"]}, room=other_user)
    except Exception as e:
        error_logger.error(f"Message read error: {e}")


@socketio.on("get_online_users")
def handle_get_online_users():
    """Return list of currently online users."""
    try:
        online = query_db(
            "SELECT username FROM users WHERE status = 'online'",
            fetch="all"
        )
        emit("online_users", {"users": [u["username"] for u in (online or [])]})
    except Exception as e:
        error_logger.error(f"Online users error: {e}")


# ============================================================
# Error handlers
# ============================================================
@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return jsonify({"success": False, "message": "Endpoint not found."}), 404
    return render_template("index.html"), 404


@app.errorhandler(500)
def server_error(e):
    error_logger.error(f"500 error: {e}")
    if request.path.startswith("/api/"):
        return jsonify({"success": False, "message": "Internal server error."}), 500
    return render_template("index.html"), 500


# ============================================================
# Main
# ============================================================
if __name__ == "__main__":
    try:
        init_db()
    except Exception as e:
        logger.warning(f"Database not available yet: {e}")
        logger.warning("Start MySQL via XAMPP and import database/schema.sql")

    logger.info("Starting CyberGuard AI...")
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, allow_unsafe_werkzeug=True)
