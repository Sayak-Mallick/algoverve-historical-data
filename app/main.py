import os
from urllib.parse import quote

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import RedirectResponse

# Load environment variables from .env file
load_dotenv()

UPSTOX_API_KEY = os.getenv("UPSTOX_API_KEY")
UPSTOX_API_SECRET = os.getenv("UPSTOX_API_SECRET")
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://127.0.0.1:8000/callback")

app = FastAPI(title="Algoverve Historical Data backend")

# In-memory storage for active sessions (use Redis or a DB in production)
tokens_db = {}


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

    # URL-encode the redirect URI to prevent special character matching issues (UDAPI100068)
    encoded_redirect_uri = quote(REDIRECT_URI, safe="")
    auth_url = (
        f"https://api.upstox.com/v2/login/authorization/dialog"
        f"?response_type=code&client_id={UPSTOX_API_KEY}&redirect_uri={encoded_redirect_uri}"
    )
    return RedirectResponse(url=auth_url)


@app.get("/callback")
async def callback_upstox(code: str = Query(...)):
    """Step 2: Receive auth code from Upstox redirect and exchange for Access Token"""
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

    # Store token in memory
    tokens_db["access_token"] = access_token

    return {
        "status": "success",
        "message": "Authentication successful",
        "access_token": access_token,
        "user_details": token_data,
    }


@app.get("/user/profile")
async def get_user_profile():
    """Example endpoint making an authenticated call using the stored token"""
    access_token = tokens_db.get("access_token")
    if not access_token:
        raise HTTPException(
            status_code=401, detail="User not authenticated with Upstox"
        )

    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {access_token}",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.upstox.com/v2/user/profile", headers=headers
        )

    return response.json()
