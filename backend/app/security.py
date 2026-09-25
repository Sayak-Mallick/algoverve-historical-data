import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from app.database import get_db
from app.models import User
from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
TOKEN_ENCRYPTION_KEY = os.getenv("TOKEN_ENCRYPTION_KEY")

if not SECRET_KEY or not TOKEN_ENCRYPTION_KEY:
    raise RuntimeError("SECRET_KEY and TOKEN_ENCRYPTION_KEY must be set in .env")

COOKIE_NAME = "av_session"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
SESSION_TTL = timedelta(days=7)
OAUTH_STATE_TTL = timedelta(minutes=10)

_fernet = Fernet(TOKEN_ENCRYPTION_KEY.encode())


# ---------------------------------------------------------------- passwords
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


# ------------------------------------------------------ broker token storage
def encrypt_token(token: str) -> str:
    return _fernet.encrypt(token.encode()).decode()


def decrypt_token(token: str) -> str | None:
    try:
        return _fernet.decrypt(token.encode()).decode()
    except InvalidToken:
        return None


# ------------------------------------------------------------ signed tokens
def _sign(payload: dict, ttl: timedelta) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {**payload, "iat": now, "exp": now + ttl}, SECRET_KEY, algorithm="HS256"
    )


def _read(token: str, kind: str) -> dict | None:
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    return data if data.get("type") == kind else None


# ------------------------------------------------------------ session cookie
def set_session_cookie(response: Response, user_id: int) -> None:
    token = _sign({"sub": str(user_id), "type": "session"}, SESSION_TTL)
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,  # JavaScript can't read it
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    token = request.cookies.get(COOKIE_NAME)
    data = _read(token, "session") if token else None
    if not data:
        return None
    return db.get(User, int(data["sub"]))


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    return user


# --------------------------------------------------------------- OAuth state
def create_oauth_state(user_id: int) -> str:
    return _sign(
        {"sub": str(user_id), "type": "oauth_state", "nonce": secrets.token_urlsafe(8)},
        OAUTH_STATE_TTL,
    )


def read_oauth_state(state: str) -> int | None:
    data = _read(state, "oauth_state")
    return int(data["sub"]) if data else None
