import os
from urllib.parse import urlencode

import httpx
from app.database import Base, engine, get_db
from app.models import BrokerAccount, User
from app.security import (
    clear_session_cookie,
    create_oauth_state,
    decrypt_token,
    encrypt_token,
    get_current_user,
    get_optional_user,
    hash_password,
    read_oauth_state,
    set_session_cookie,
    verify_password,
)
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session

load_dotenv()

UPSTOX_API_KEY = os.getenv("UPSTOX_API_KEY")
UPSTOX_API_SECRET = os.getenv("UPSTOX_API_SECRET")
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8000/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

UPSTOX = "upstox"
UPSTOX_BASE = "https://api.upstox.com/v2"

app = FastAPI(title="Algoverve Backend", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=list({FRONTEND_URL, "http://localhost:5173"}),
    allow_credentials=True,  # lets the browser send the session cookie
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dev only. Use Alembic migrations in production.
Base.metadata.create_all(bind=engine)


# =============================================================== SCHEMAS
class SignUpIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def bcrypt_limit(cls, v: str) -> str:
        if len(v.encode()) > 72:
            raise ValueError("Password must be 72 bytes or fewer")
        return v


class SignInIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str

    model_config = {"from_attributes": True}


# ================================================================ HEALTH
@app.get("/health")
def health():
    return {"status": "healthy"}


# ============================================================ APP AUTH
@app.post("/auth/signup", response_model=UserOut, status_code=201)
def sign_up(body: SignUpIn, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=409, detail="An account with this email already exists"
        )

    user = User(
        email=email, name=body.name.strip(), password_hash=hash_password(body.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    set_session_cookie(response, user.id)
    return user


@app.post("/auth/login", response_model=UserOut)
def sign_in(body: SignInIn, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    set_session_cookie(response, user.id)
    return user


@app.post("/auth/logout", status_code=204)
def sign_out(response: Response):
    clear_session_cookie(response)


@app.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


# ========================================================= UPSTOX CONNECT
def _frontend(result: str) -> RedirectResponse:
    return RedirectResponse(f"{FRONTEND_URL}/?broker={result}", status_code=302)


@app.get("/brokers/upstox/connect")
def upstox_connect(user: User | None = Depends(get_optional_user)):
    """Browser navigates here. We send it to Upstox with a signed `state`."""
    if not user:
        return _frontend("signin_required")
    if not UPSTOX_API_KEY or not UPSTOX_API_SECRET:
        raise HTTPException(
            status_code=500, detail="Upstox credentials are not configured"
        )

    query = urlencode(
        {
            "response_type": "code",
            "client_id": UPSTOX_API_KEY,
            "redirect_uri": REDIRECT_URI,
            "state": create_oauth_state(user.id),
        }
    )
    return RedirectResponse(
        f"{UPSTOX_BASE}/login/authorization/dialog?{query}", status_code=302
    )


@app.get("/callback")
async def upstox_callback(
    code: str | None = Query(None),
    state: str | None = Query(None),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Upstox sends the browser back here with ?code=...&state=..."""
    # State proves this callback belongs to the signed-in user (blocks CSRF).
    if not code or not state or not user or read_oauth_state(state) != user.id:
        return _frontend("error")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"{UPSTOX_BASE}/login/authorization/token",
                headers={
                    "accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={
                    "code": code,
                    "client_id": UPSTOX_API_KEY,
                    "client_secret": UPSTOX_API_SECRET,
                    "redirect_uri": REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
            )
        token_data = res.json() if res.status_code == 200 else {}
    except (httpx.RequestError, ValueError):
        token_data = {}

    access_token = token_data.get("access_token")
    if not access_token:
        return _frontend("error")

    # One Upstox account per user: update if it exists, else create.
    account = (
        db.query(BrokerAccount)
        .filter(BrokerAccount.user_id == user.id, BrokerAccount.broker == UPSTOX)
        .first()
    )
    if not account:
        account = BrokerAccount(user_id=user.id, broker=UPSTOX)
        db.add(account)

    account.broker_user_id = token_data.get("user_id")
    account.access_token = encrypt_token(access_token)
    account.refresh_token = None  # Upstox v2 doesn't issue refresh tokens

    db.commit()
    return _frontend("connected")


# ========================================================= UPSTOX DATA
def _upstox_account(db: Session, user: User) -> BrokerAccount:
    account = (
        db.query(BrokerAccount)
        .filter(BrokerAccount.user_id == user.id, BrokerAccount.broker == UPSTOX)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Upstox is not connected")
    return account


@app.get("/brokers/upstox/profile")
async def upstox_profile(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = _upstox_account(db, user)
    token = decrypt_token(account.access_token)
    if not token:
        raise HTTPException(
            status_code=403, detail="Upstox session is invalid. Connect again."
        )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(
                f"{UPSTOX_BASE}/user/profile",
                headers={
                    "accept": "application/json",
                    "Authorization": f"Bearer {token}",
                },
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="Couldn’t reach Upstox") from exc

    if res.status_code == 401:
        # Upstox tokens expire daily. 403 = "your broker session", not "your Algoverve login".
        raise HTTPException(
            status_code=403, detail="Upstox session expired. Connect again."
        )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail="Upstox returned an error")

    return res.json()


@app.delete("/brokers/upstox", status_code=200)
async def upstox_disconnect(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = (
        db.query(BrokerAccount)
        .filter(BrokerAccount.user_id == user.id, BrokerAccount.broker == UPSTOX)
        .first()
    )
    if not account:
        return {"status": "success", "data": {"upstox_revoked": True}}

    revoked = True
    token = decrypt_token(account.access_token)
    if token:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.delete(
                    f"{UPSTOX_BASE}/logout",
                    headers={
                        "Accept": "application/json",
                        "Authorization": f"Bearer {token}",
                    },
                )
            revoked = res.status_code in (200, 401)
        except httpx.RequestError:
            revoked = False

    db.delete(account)  # always remove our copy
    db.commit()
    return {"status": "success", "data": {"upstox_revoked": revoked}}
