import os
from urllib.parse import quote

import httpx
from app.database import Base, engine, get_db
from app.models import UpstoxToken
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

# ============================================================================
# ENVIRONMENT
# ============================================================================

load_dotenv()


UPSTOX_API_KEY = os.getenv("UPSTOX_API_KEY")
UPSTOX_API_SECRET = os.getenv("UPSTOX_API_SECRET")

REDIRECT_URI = os.getenv(
    "REDIRECT_URI",
    "http://127.0.0.1:8000/callback",
)

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:5173",
)


# ============================================================================
# FASTAPI APP
# ============================================================================

app = FastAPI(
    title="Algoverve Historical Data Backend",
    description="Algoverve backend for Upstox authentication and market data",
    version="1.0.0",
)


# ============================================================================
# CORS
# ============================================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# DATABASE
# ============================================================================

# Create database tables if they don't already exist.
#
# For development this is fine.
# For production, use Alembic migrations instead.
#
Base.metadata.create_all(bind=engine)


# ============================================================================
# STARTUP
# ============================================================================


@app.on_event("startup")
async def startup_event():
    """
    Runs when FastAPI starts.
    """

    print("=" * 60)
    print("Algoverve Historical Data Backend")
    print("=" * 60)

    print(f"Frontend URL : {FRONTEND_URL}")
    print(f"Redirect URI : {REDIRECT_URI}")

    if UPSTOX_API_KEY:
        print("Upstox API Key : configured")
    else:
        print("Upstox API Key : MISSING")

    if UPSTOX_API_SECRET:
        print("Upstox API Secret : configured")
    else:
        print("Upstox API Secret : MISSING")

    print("=" * 60)


# ============================================================================
# ROOT
# ============================================================================


@app.get("/")
def read_root():
    """
    Basic API status endpoint.
    """

    return {
        "status": "online",
        "message": "Algoverve Historical Data backend is running",
    }


# ============================================================================
# HEALTH CHECK
# ============================================================================


@app.get("/health")
def health_check():
    """
    Health check endpoint.
    """

    return {
        "status": "healthy",
    }


# ============================================================================
# UPSTOX LOGIN
# ============================================================================


@app.get("/login")
def login_upstox():
    """
    Step 1 of OAuth.

    User visits:

        http://127.0.0.1:8000/login

    FastAPI redirects the browser to Upstox.
    """

    # ------------------------------------------------------------------------
    # Validate environment variables
    # ------------------------------------------------------------------------

    if not UPSTOX_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="UPSTOX_API_KEY is not configured",
        )

    if not UPSTOX_API_SECRET:
        raise HTTPException(
            status_code=500,
            detail="UPSTOX_API_SECRET is not configured",
        )

    if not REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="REDIRECT_URI is not configured",
        )

    # ------------------------------------------------------------------------
    # Encode redirect URI
    # ------------------------------------------------------------------------

    encoded_redirect_uri = quote(
        REDIRECT_URI,
        safe="",
    )

    # ------------------------------------------------------------------------
    # Build Upstox authorization URL
    # ------------------------------------------------------------------------

    auth_url = (
        "https://api.upstox.com/v2/login/authorization/dialog"
        "?response_type=code"
        f"&client_id={UPSTOX_API_KEY}"
        f"&redirect_uri={encoded_redirect_uri}"
    )

    # ------------------------------------------------------------------------
    # Redirect browser to Upstox
    # ------------------------------------------------------------------------

    return RedirectResponse(
        url=auth_url,
        status_code=302,
    )


# ============================================================================
# UPSTOX CALLBACK
# ============================================================================


@app.get("/callback")
async def callback_upstox(
    code: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Step 2 of OAuth.

    Upstox redirects the user here after successful authorization.

    Example:

        /callback?code=xxxxxxxx

    We exchange that temporary authorization code
    for an Upstox access token.
    """

    # ------------------------------------------------------------------------
    # Validate credentials
    # ------------------------------------------------------------------------

    if not UPSTOX_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="UPSTOX_API_KEY is not configured",
        )

    if not UPSTOX_API_SECRET:
        raise HTTPException(
            status_code=500,
            detail="UPSTOX_API_SECRET is not configured",
        )

    # ------------------------------------------------------------------------
    # Upstox token endpoint
    # ------------------------------------------------------------------------

    token_url = "https://api.upstox.com/v2/login/authorization/token"

    # ------------------------------------------------------------------------
    # Request headers
    # ------------------------------------------------------------------------

    headers = {
        "accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    # ------------------------------------------------------------------------
    # Request body
    # ------------------------------------------------------------------------

    payload = {
        "code": code,
        "client_id": UPSTOX_API_KEY,
        "client_secret": UPSTOX_API_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }

    # ------------------------------------------------------------------------
    # Exchange authorization code for access token
    # ------------------------------------------------------------------------

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                token_url,
                headers=headers,
                data=payload,
            )

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Unable to connect to Upstox: {str(exc)}",
        ) from exc

    # ------------------------------------------------------------------------
    # Check Upstox response
    # ------------------------------------------------------------------------

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail={
                "message": "Token exchange failed",
                "upstox_response": response.text,
            },
        )

    # ------------------------------------------------------------------------
    # Parse response
    # ------------------------------------------------------------------------

    try:
        token_data = response.json()

    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="Upstox returned an invalid JSON response",
        ) from exc

    # ------------------------------------------------------------------------
    # Get access token
    # ------------------------------------------------------------------------

    access_token = token_data.get("access_token")

    if not access_token:
        raise HTTPException(
            status_code=502,
            detail="Upstox did not return an access token",
        )

    # =========================================================================
    # SAVE TOKEN TO NEON
    # =========================================================================

    try:
        token_record = UpstoxToken(
            access_token=access_token,
        )

        db.add(token_record)

        db.commit()

        db.refresh(token_record)

    except Exception as exc:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"Failed to save Upstox token: {str(exc)}",
        ) from exc

    # ------------------------------------------------------------------------
    # IMPORTANT
    #
    # Do NOT return the access token to React.
    #
    # React doesn't need it.
    #
    # React will call:
    #
    #     GET /user/profile
    #
    # and the backend will retrieve the token from Neon.
    # ------------------------------------------------------------------------

    # ------------------------------------------------------------------------
    # Redirect back to React
    # ------------------------------------------------------------------------

    frontend_redirect = f"{FRONTEND_URL}/?auth=success"

    return RedirectResponse(
        url=frontend_redirect,
        status_code=302,
    )


# ============================================================================
# GET USER PROFILE
# ============================================================================


@app.get("/user/profile")
async def get_user_profile(
    db: Session = Depends(get_db),
):
    """
    Fetch the authenticated Upstox user's profile.

    Flow:

        React
          ↓
        GET /user/profile
          ↓
        Neon
          ↓
        access_token
          ↓
        Upstox
          ↓
        profile
          ↓
        React
    """

    # =========================================================================
    # GET LATEST TOKEN FROM DATABASE
    # =========================================================================

    token_record = db.query(UpstoxToken).order_by(UpstoxToken.created_at.desc()).first()

    # ------------------------------------------------------------------------
    # No token
    # ------------------------------------------------------------------------

    if not token_record:
        raise HTTPException(
            status_code=401,
            detail="User is not authenticated with Upstox",
        )

    access_token = token_record.access_token

    if not access_token:
        raise HTTPException(
            status_code=401,
            detail="Invalid Upstox access token",
        )

    # =========================================================================
    # CALL UPSTOX PROFILE API
    # =========================================================================

    profile_url = "https://api.upstox.com/v2/user/profile"

    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {access_token}",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                profile_url,
                headers=headers,
            )

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Unable to connect to Upstox: {str(exc)}",
        ) from exc

    # =========================================================================
    # HANDLE TOKEN EXPIRATION
    # =========================================================================

    if response.status_code == 401:
        raise HTTPException(
            status_code=401,
            detail="Upstox access token is expired or invalid",
        )

    # =========================================================================
    # OTHER UPSTOX ERRORS
    # =========================================================================

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail={
                "message": "Failed to fetch Upstox profile",
                "upstox_response": response.text,
            },
        )

    # =========================================================================
    # RETURN PROFILE
    # =========================================================================

    try:
        profile_data = response.json()

    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="Upstox returned invalid profile data",
        ) from exc

    return profile_data
