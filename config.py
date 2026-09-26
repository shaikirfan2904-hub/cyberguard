"""
CyberGuard AI - Application Configuration
Loads settings from environment variables via python-dotenv.
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Central configuration loaded from environment variables."""

    SECRET_KEY = os.getenv("SECRET_KEY", "cyberguard-default-secret")

    # MySQL / XAMPP
    MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
    MYSQL_USER = os.getenv("MYSQL_USER", "root")
    MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
    MYSQL_DB = os.getenv("MYSQL_DB", "cyber_aggression_copy")
    MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))

    # ML detection
    AGGRESSION_THRESHOLD = float(os.getenv("AGGRESSION_THRESHOLD", "0.65"))

    # Session
    SESSION_EXPIRY_HOURS = int(os.getenv("SESSION_EXPIRY_HOURS", "24"))
    PERMANENT_SESSION_LIFETIME = 3600 * SESSION_EXPIRY_HOURS

    # Admin defaults
    ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

    # File paths
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    MODEL_DIR = os.path.join(BASE_DIR, "model")
    MODEL_PATH = os.path.join(MODEL_DIR, "model.pkl")
    VECTORIZER_PATH = os.path.join(MODEL_DIR, "vectorizer.pkl")
    METADATA_PATH = os.path.join(MODEL_DIR, "model_metadata.json")
    LOG_DIR = os.path.join(BASE_DIR, "logs")

    # Chat limits
    MAX_MESSAGE_LENGTH = 2000
    MESSAGES_PER_PAGE = 50

    # Violation risk thresholds
    RISK_THRESHOLDS = {
        "LOW": 1,
        "MEDIUM": 3,
        "HIGH": 6,
        "CRITICAL": 10,
    }
