import os
import re
import joblib


# =========================================================
# CONFIGURATION
# =========================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_FILE = os.path.join(BASE_DIR, "model", "model.pkl")
VECTORIZER_FILE = os.path.join(BASE_DIR, "model", "vectorizer.pkl")

# ML decision threshold
ML_THRESHOLD = 0.65


# =========================================================
# EXPLICIT AGGRESSIVE PHRASES
# =========================================================

AGGRESSIVE_PHRASES = [

    # Direct personal insults
    "you are an idiot",
    "you're an idiot",

    "you are stupid",
    "you're stupid",

    "you are a loser",
    "you're a loser",

    "you are a bitch",
    "you're a bitch",

    "you are an asshole",
    "you're an asshole",

    # Direct abusive phrases
    "fuck you",
    "fuck off",
    "shut up",
    "hate you",
    "go away",

    # Threatening / self-harm directed abuse
    "kill yourself",
    "die yourself",
    "go die",
    "just die",

    # Joined forms
    "fuckoff",
    "shutup",

    # Direct abusive words
    "fucker",
    "motherfucker",
    "asshole",
]


# =========================================================
# LOAD MODEL
# =========================================================

print("Loading CyberGuard ML model...")

model = joblib.load(MODEL_FILE)
vectorizer = joblib.load(VECTORIZER_FILE)

print("CyberGuard ML model loaded successfully.")


# =========================================================
# TEXT NORMALIZATION
# =========================================================
def normalize_text(text):
    """
    Normalize text before explicit phrase matching.
    Handles punctuation, spacing and common obfuscation.
    """

    text = str(text).lower()

    # Remove URLs
    text = re.sub(
        r"https?://\S+|www\.\S+",
        " ",
        text
    )

    # Remove @mentions
    text = re.sub(
        r"@\w+",
        " ",
        text
    )

    # Common character substitutions
    # Used only for explicit phrase matching.
    text = text.replace("@", "a")
    text = text.replace("$", "s")
    text = text.replace("!", "i")
    text = text.replace("1", "i")
    text = text.replace("3", "e")
    text = text.replace("0", "o")

    # Remove punctuation.
    # This turns:
    # f*uck -> fuck
    # f.u.c.k -> fuck
    text = re.sub(
        r"[^a-z0-9\s]",
        "",
        text
    )

    # Normalize common intentional word joining.
    text = re.sub(
        r"\bshut+up\b",
        "shut up",
        text
    )

    text = re.sub(
        r"\bfuck+off\b",
        "fuck off",
        text
    )

    # Handle common spelling variation
    text = re.sub(
        r"\bfc+uk\b",
        "fuck",
        text
    )

    # Normalize repeated letters:
    # stuuupid -> stupid
    # shuuut -> shut
    text = re.sub(
        r"(.)\1{2,}",
        r"\1",
        text
    )

    # Normalize whitespace
    text = re.sub(
        r"\s+",
        " ",
        text
    ).strip()

    return text


# =========================================================
# EXPLICIT PHRASE DETECTION
# =========================================================
def check_aggressive_phrase(text):

    normalized = normalize_text(text)

    # -----------------------------------------------------
    # Exact standalone abusive words
    # -----------------------------------------------------

    standalone_abusive_words = {
        "stupid",
        "idiot",
        "loser",
        "bitch",
        "asshole",
        "fucker",
        "motherfucker",
        "fuck",
        "ass",
        "dick",
        "pussy",
        "cunt",
        "milf",
        "die",
    }

    if normalized in standalone_abusive_words:
        return True, normalized

    # -----------------------------------------------------
    # Explicit phrases
    # -----------------------------------------------------

    for phrase in AGGRESSIVE_PHRASES:

        pattern = r"\b" + re.escape(phrase) + r"\b"

        if re.search(pattern, normalized):
            return True, phrase

    return False, None


# =========================================================
# MAIN AGGRESSION DETECTOR
# =========================================================

def predict_aggression(text, threshold=ML_THRESHOLD):

    # -----------------------------------------------------
    # Empty message
    # -----------------------------------------------------

    if not text or not str(text).strip():

        return {
            "label": "SAFE",
            "blocked": False,
            "confidence": 1.0,
            "method": "empty"
        }


    # -----------------------------------------------------
    # STEP 1
    # Explicit phrase detection
    # -----------------------------------------------------

    found, phrase = check_aggressive_phrase(text)

    if found:

        return {
            "label": "AGGRESSIVE",
            "blocked": True,
            "confidence": 1.0,
            "method": "keyword",
            "matched_phrase": phrase
        }


    # -----------------------------------------------------
    # STEP 2
    # ML prediction
    # -----------------------------------------------------

    text_vector = vectorizer.transform([
        str(text)
    ])

    probabilities = model.predict_proba(
        text_vector
    )[0]

    classes = list(getattr(model, "classes_", range(len(probabilities))))
    aggressive_index = next(
        (i for i, label in enumerate(classes)
         if str(label).strip().upper() in {"1", "AGGRESSIVE"}),
        min(1, len(probabilities) - 1),
    )
    safe_index = next(
        (i for i in range(len(probabilities)) if i != aggressive_index),
        aggressive_index,
    )
    safe_probability = float(probabilities[safe_index])
    aggressive_probability = float(probabilities[aggressive_index])


    # -----------------------------------------------------
    # STEP 3
    # ML threshold
    # -----------------------------------------------------

    if aggressive_probability >= float(threshold):

        return {
            "label": "AGGRESSIVE",
            "blocked": True,
            "confidence": aggressive_probability,
            "method": "ml"
        }


    # -----------------------------------------------------
    # SAFE
    # -----------------------------------------------------

    return {
        "label": "SAFE",
        "blocked": False,
        "confidence": safe_probability,
        "method": "ml"
    }
