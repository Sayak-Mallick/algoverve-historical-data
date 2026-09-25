import os
from urllib.parse import quote

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app import models
from app.database import Base, engine, get_db
from app.models import UpstoxToken

# Load environment variables
load_dotenv()

UPSTOX_API_KEY = os.getenv("UPSTOX_API_KEY")
UPSTOX_API_SECRET = os.getenv("UPSTOX_API_SECRET")
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://127.0.0.1:8000/callback")

app = FastAPI(title="Algoverve Historical Data backend")

# Automatically create tables in Neon database on startup
Base.metadata.create_all(bind=engine)


@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Algoverve Historical Data backend is running",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/login")
def login_upstox():
    """Step 1: Redirect user to Upstox Authorization URL"""
    if not UPSTOX_API_KEY or not REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="Missing UPSTOX_API_KEY or REDIRECT_URI environment variables",
        )

    # URL-encode the redirect URI to prevent character matching issues (UDAPI100068)
    encoded_redirect_uri = quote(REDIRECT_URI, safe="")
    auth_url = (
        f"https://api.upstox.com/v2/login/authorization/dialog"
        f"?response_type=code&client_id={UPSTOX_API_KEY}&redirect_uri={encoded_redirect_uri}"
    )
    return RedirectResponse(url=auth_url)


@app.get("/callback")
async def callback_upstox(
    code: str = Query(...),
    db: Session = Depends(get_db),
):
    """Step 2: Receive auth code from Upstox redirect, exchange for Access Token, and save to Neon DB"""
    token_url = "https://api.upstox.com/v2/login/authorization/token"

    headers = {
        "accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    payload = {
        "code": code,
        "client_id": UPSTOX_API_KEY,
        "client_secret": UPSTOX_API_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(token_url, headers=headers, data=payload)

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Token exchange failed: {response.text}",
        )

    token_data = response.json()
    access_token = token_data.get("access_token")

    if not access_token:
        raise HTTPException(
            status_code=500,
            detail="Access token not found in response from Upstox",
        )

    # Save access token to Neon database
    token_entry = UpstoxToken(access_token=access_token)
    db.add(token_entry)
    db.commit()
    db.refresh(token_entry)

    return {
        "status": "success",
        "message": "Authentication successful and token saved to database",
        "token_id": token_entry.id,
    }


@app.get("/user/profile")
async def get_user_profile(db: Session = Depends(get_db)):
    """Fetch profile of authenticated user using the latest token stored in Neon DB"""
    token_entry = db.query(UpstoxToken).order_by(UpstoxToken.created_at.desc()).first()

    if not token_entry:
        raise HTTPException(
            status_code=401,
            detail="User not authenticated with Upstox",
        )

    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token_entry.access_token}",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.upstox.com/v2/user/profile", headers=headers
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"Failed to retrieve profile: {response.text}",
        )

    return response.json()
