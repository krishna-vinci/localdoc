# LocalDocs Hub - OAuth2 Integration Guide

## Overview

This guide explains how to configure and implement OAuth2 authentication in LocalDocs Hub. OAuth2 allows users to sign in with third-party identity providers like Google, GitHub, Microsoft, and custom OIDC providers.

---

## OAuth2 Configuration

### Environment Variables

**File:** `backend/.env`

```env
# OAuth2 Provider Configurations
# Format: provider_name.client_id, provider_name.client_secret, etc.

# Google OAuth2
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret

# GitHub OAuth2 (optional)
GITHUB_CLIENT_ID=Iv1.your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Microsoft Entra ID (optional)
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
```

### OAuth2 Settings Model

**File:** `backend/app/models/oauth_config.py`

```python
from datetime import datetime
from uuid import uuid4
from sqlalchemy import String, DateTime, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.core.database import Base


class OAuth2Config(Base):
    __tablename__ = "oauth2_configs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    provider: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    client_id: Mapped[str] = mapped_column(String(255), nullable=False)
    client_secret_encrypted: Mapped[str] = mapped_column(String(512), nullable=False)  # Encrypted
    auth_url: Mapped[str] = mapped_column(String(512), nullable=False)
    token_url: Mapped[str] = mapped_column(String(512), nullable=False)
    user_info_url: Mapped[str] = mapped_column(String(512), nullable=False)
    scopes: Mapped[list] = mapped_column(JSONB, default=list)
    field_mapping: Mapped[dict] = mapped_column(JSONB, default=dict)
    # field_mapping example:
    # {
    #   "identifier": "sub",      # Required: unique identifier field
    #   "email": "email",         # Optional
    #   "display_name": "name",   # Optional
    #   "avatar_url": "picture"   # Optional
    # }
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class OAuth2State(Base):
    __tablename__ = "oauth2_states"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    state: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    code_verifier: Mapped[str] = mapped_column(String(128), nullable=True)  # PKCE
    return_url: Mapped[str] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = nullable=False  # State expires in 10 minutes
```

---

## Provider-Specific Configuration

### Google OAuth2 Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Google+ API" or use Firebase
4. Go to **Credentials** → **OAuth consent screen**
5. Set application name and scopes: `email`, `profile`, `openid`
6. Create **OAuth 2.0 Client ID** credentials
7. Add authorized redirect URI: `https://your-domain.com/api/v1/auth/oauth/google/callback`

**Scopes:** `openid email profile`

**Field Mapping:**
```json
{
  "identifier": "sub",
  "email": "email",
  "display_name": "name",
  "avatar_url": "picture"
}
```

### GitHub OAuth2 Setup

1. Go to GitHub **Settings** → **Developer settings** → **OAuth Apps**
2. Create new OAuth App
3. Set:
   - Application name: `LocalDocs Hub`
   - Homepage URL: `https://your-domain.com`
   - Authorization callback URL: `https://your-domain.com/api/v1/auth/oauth/github/callback`
4. Generate client secret

**Scopes:** `read:user user:email`

**Field Mapping:**
```json
{
  "identifier": "id",
  "email": "email",
  "display_name": "name",
  "avatar_url": "avatar_url"
}
```

**Note:** GitHub may not return email in the user info endpoint if the user has not made their email public. You may need to also call the emails endpoint.

### Microsoft Entra ID (Azure AD) Setup

1. Go to [Azure Portal](https://portal.azure.com/) → **Azure Active Directory**
2. Go to **App registrations** → **New registration**
3. Set:
   - Name: `LocalDocs Hub`
   - Supported account types: Multi-tenant
   - Redirect URI: Web → `https://your-domain.com/api/v1/auth/oauth/microsoft/callback`
4. Go to **Certificates & secrets** → **New client secret**
5. Go to **API permissions** → Add `User.Read` (for profile)

**Scopes:** `openid email profile User.Read`

**Field Mapping:**
```json
{
  "identifier": "sub",
  "email": "email",
  "display_name": "name",
  "avatar_url": "picture"
}
```

---

## OAuth2 API Endpoints

### Initiate OAuth Flow

```
GET /api/v1/auth/oauth/{provider}?return_url=/dashboard

Response 302: Redirects to provider's auth page

Query Parameters:
- return_url: Where to redirect after successful login (optional)
```

### OAuth Callback

```
GET /api/v1/auth/oauth/{provider}/callback?code=xxx&state=yyy

Response 302: Redirects to return_url with tokens
- Sets refresh token cookie
- Returns access_token in query string or fragment
```

### Link OAuth to Existing Account

```
POST /api/v1/auth/oauth/{provider}/link

Headers: Authorization: Bearer <access_token>

Response 200:
{
  "message": "OAuth account linked successfully"
}
```

### Unlink OAuth from Account

```
DELETE /api/v1/auth/oauth/{provider}/link

Headers: Authorization: Bearer <access_token>

Response 200:
{
  "message": "OAuth account unlinked successfully"
}
```

---

## PKCE Implementation

### Why PKCE?

PKCE (Proof Key for Code Exchange) is required for public clients (like SPAs) to prevent authorization code interception attacks.

### Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PKCE FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. CLIENT GENERATES                                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  code_verifier = random(32 bytes)  // 43-128 chars base64url        │   │
│  │  code_challenge = BASE64URL(SHA256(code_verifier))                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  2. AUTHORIZATION REQUEST                                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  GET /authorize?                                                      │   │
│  │    client_id=xxx                                                      │   │
│  │    response_type=code                                                 │   │
│  │    state=yyy                                                           │   │
│  │    redirect_uri=callback                                              │   │
│  │    scope=openid+email+profile                                         │   │
│  │    code_challenge=ccc                                                  │   │
│  │    code_challenge_method=S256                                         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  3. TOKEN EXCHANGE (server-to-server)                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  POST /token                                                          │   │
│  │    grant_type=authorization_code                                     │   │
│  │    code=auth_code                                                     │   │
│  │    redirect_uri=callback                                              │   │
│  │    client_id=xxx                                                      │   │
│  │    code_verifier=vvv  // THE ACTUAL VERIFIER                         │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  4. PROVIDER VALIDATES                                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  SHA256(code_verifier) == code_challenge?                             │   │
│  │  If yes → Issue tokens                                                │   │
│  │  If no → Reject                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Frontend Implementation

**File:** `frontend/lib/oauth.ts`

```typescript
const STATE_STORAGE_KEY = "oauth_state";
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface OAuthState {
  state: string;
  provider: string;
  timestamp: number;
  returnUrl?: string;
  codeVerifier?: string; // PKCE code_verifier
}

// Generate cryptographically secure random state
function generateSecureState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => 
    byte.toString(16).padStart(2, "0")
  ).join("");
}

// Generate PKCE code_verifier (43-128 chars)
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

// Generate code_challenge from verifier
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hash));
}

// Base64URL encoding without padding
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Store OAuth state for CSRF protection
export async function storeOAuthState(
  provider: string,
  returnUrl?: string,
): Promise<{ state: string; codeChallenge?: string }> {
  const state = generateSecureState();
  
  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;

  // PKCE requires secure context (HTTPS or localhost)
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      codeVerifier = generateCodeVerifier();
      codeChallenge = await generateCodeChallenge(codeVerifier);
    }
  } catch (error) {
    console.warn("PKCE not available:", error);
  }

  const stateData: OAuthState = {
    state,
    provider,
    timestamp: Date.now(),
    returnUrl,
    codeVerifier,
  };

  sessionStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(stateData));
  return { state, codeChallenge };
}

// Validate OAuth state (CSRF protection)
export function validateOAuthState(stateParam: string): OAuthState | null {
  try {
    const stored = sessionStorage.getItem(STATE_STORAGE_KEY);
    if (!stored) return null;

    const stateData: OAuthState = JSON.parse(stored);

    // Check expiry
    if (Date.now() - stateData.timestamp > STATE_EXPIRY_MS) {
      sessionStorage.removeItem(STATE_STORAGE_KEY);
      return null;
    }

    // Validate state matches
    if (stateData.state !== stateParam) {
      sessionStorage.removeItem(STATE_STORAGE_KEY);
      return null;
    }

    sessionStorage.removeItem(STATE_STORAGE_KEY);
    return stateData;
  } catch {
    sessionStorage.removeItem(STATE_STORAGE_KEY);
    return null;
  }
}
```

---

## OAuth2 Backend Implementation

### OAuth2 Service

**File:** `backend/app/services/oauth2.py`

```python
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext
from jose import jwt

from app.core.config import settings
from app.core.security import (
    ISSUER, KEY_ID, ACCESS_TOKEN_DURATION, REFRESH_TOKEN_DURATION,
    ACCESS_TOKEN_AUDIENCE, REFRESH_TOKEN_AUDIENCE
)
from app.models.user import User, UserRole, RowStatus
from app.models.oauth_config import OAuth2Config, OAuth2State
from app.models.refresh_token import RefreshToken

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto"])


class OAuth2Error(Exception):
    """OAuth2 specific errors"""
    pass


class OAuth2Service:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_provider_config(self, provider: str) -> OAuth2Config:
        """Get OAuth2 provider configuration"""
        result = await self.db.execute(
            select(OAuth2Config).where(
                OAuth2Config.provider == provider,
                OAuth2Config.is_enabled == True
            )
        )
        config = result.scalar_one_or_none()
        if not config:
            raise OAuth2Error(f"OAuth provider '{provider}' not configured or disabled")
        return config

    async def create_state(
        self, 
        provider: str, 
        return_url: Optional[str] = None,
        code_verifier: Optional[str] = None
    ) -> str:
        """Create and store OAuth state for CSRF protection"""
        state = secrets.token_hex(32)
        
        oauth_state = OAuth2State(
            state=state,
            provider=provider,
            code_verifier=code_verifier,
            return_url=return_url,
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        
        self.db.add(oauth_state)
        await self.db.commit()
        
        return state

    async def validate_state(self, state: str) -> Optional[OAuth2State]:
        """Validate and consume OAuth state"""
        result = await self.db.execute(
            select(OAuth2State).where(OAuth2State.state == state)
        )
        oauth_state = result.scalar_one_or_none()
        
        if not oauth_state:
            return None
            
        if oauth_state.expires_at < datetime.utcnow():
            await self.db.delete(oauth_state)
            await self.db.commit()
            return None
            
        await self.db.delete(oauth_state)
        await self.db.commit()
        
        return oauth_state

    async def exchange_code(
        self, 
        provider: str, 
        code: str, 
        code_verifier: Optional[str] = None
    ) -> str:
        """Exchange authorization code for access token"""
        config = await self.get_provider_config(provider)
        
        # Build token request
        token_data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": f"{settings.APP_URL}/api/v1/auth/oauth/{provider}/callback",
            "client_id": config.client_id,
            "client_secret": config.client_secret,  # Decrypt in real impl
        }
        
        if code_verifier:
            token_data["code_verifier"] = code_verifier
        
        async with httpx.AsyncClient() as client:
            response = await client.post(config.token_url, data=token_data)
            response.raise_for_status()
            token_response = response.json()
        
        return token_response.get("access_token")

    async def get_user_info(
        self, 
        provider: str, 
        access_token: str
    ) -> dict:
        """Fetch user info from OAuth provider"""
        config = await self.get_provider_config(provider)
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                config.user_info_url,
                headers={"Authorization": f"Bearer {access_token}"}
            )
            response.raise_for_status()
            return response.json()

    async def find_or_create_user(
        self, 
        provider: str, 
        provider_id: str, 
        email: Optional[str] = None,
        display_name: Optional[str] = None,
        avatar_url: Optional[str] = None
    ) -> User:
        """Find existing user by OAuth provider or create new one"""
        # Try to find existing user with this OAuth linkage
        result = await self.db.execute(
            select(User).where(
                User.oauth_provider == provider,
                User.oauth_provider_id == provider_id
            )
        )
        user = result.scalar_one_or_none()
        
        if user:
            # Update avatar if changed
            if avatar_url and user.avatar_url != avatar_url:
                user.avatar_url = avatar_url
                await self.db.commit()
            return user
        
        # Check if email already exists (but not OAuth-linked)
        if email:
            result = await self.db.execute(
                select(User).where(User.email == email)
            )
            existing_user = result.scalar_one_or_none()
            if existing_user:
                raise OAuth2Error(
                    "Email already registered. Please login with password and link OAuth in settings."
                )
        
        # Check if this is the first user (becomes admin)
        result = await self.db.execute(select(User))
        is_first_user = len(result.scalars().all()) == 0
        
        # Create new user
        user = User(
            username=f"{provider}_{provider_id[:16]}",  # Will need to be changed
            email=email,
            nickname=display_name,
            avatar_url=avatar_url,
            oauth_provider=provider,
            oauth_provider_id=provider_id,
            role=UserRole.ADMIN if is_first_user else UserRole.USER,
            row_status=RowStatus.ACTIVE,
        )
        
        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)
        
        return user

    def generate_tokens(self, user: User) -> tuple[str, str, datetime]:
        """Generate access and refresh tokens"""
        now = datetime.utcnow()
        access_exp = now + ACCESS_TOKEN_DURATION
        refresh_exp = now + REFRESH_TOKEN_DURATION
        
        # Access token claims
        access_claims = {
            "sub": str(user.id),
            "name": user.username,
            "role": user.role.value,
            "status": user.row_status.value,
            "type": "access",
            "iss": ISSUER,
            "aud": ACCESS_TOKEN_AUDIENCE,
            "iat": now,
            "exp": access_exp,
        }
        
        access_token = jwt.encode(
            access_claims,
            settings.SECRET_KEY,
            algorithm="HS256",
            headers={"kid": KEY_ID}
        )
        
        # Refresh token ID
        token_id = secrets.token_hex(16)
        
        refresh_claims = {
            "sub": str(user.id),
            "tid": token_id,
            "type": "refresh",
            "iss": ISSUER,
            "aud": REFRESH_TOKEN_AUDIENCE,
            "iat": now,
            "exp": refresh_exp,
        }
        
        refresh_token = jwt.encode(
            refresh_claims,
            settings.SECRET_KEY,
            algorithm="HS256",
            headers={"kid": KEY_ID}
        )
        
        return access_token, refresh_token, refresh_exp

    async def store_refresh_token(self, user_id: int, token: str, expires_at: datetime):
        """Store refresh token hash for revocation support"""
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        refresh_token_record = RefreshToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at
        )
        
        self.db.add(refresh_token_record)
        await self.db.commit()
```

---

## OAuth2 Router

**File:** `backend/app/api/oauth.py`

```python
from fastapi import APIRouter, Depends, HTTPException, Query, Response, Cookie
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.database import get_db
from app.core.config import settings
from app.services.oauth2 import OAuth2Service, OAuth2Error
from app.api.deps import get_current_user

router = APIRouter()


@router.get("/oauth/{provider}")
async def initiate_oauth(
    provider: str,
    return_url: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Initiate OAuth2 flow"""
    service = OAuth2Service(db)
    
    try:
        config = await service.get_provider_config(provider)
    except OAuth2Error as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Generate state for CSRF protection
    state = await service.create_state(provider, return_url)
    
    # Build authorization URL
    # This is provider-specific; for simplicity, using standard OAuth2 URL construction
    auth_url = (
        f"{config.auth_url}"
        f"?client_id={config.client_id}"
        f"&response_type=code"
        f"&state={state}"
        f"&redirect_uri={settings.APP_URL}/api/v1/auth/oauth/{provider}/callback"
        f"&scope={' '.join(config.scopes)}"
    )
    
    # Add PKCE code_challenge if we can
    # In real implementation, store code_verifier and generate challenge
    # auth_url += f"&code_challenge={code_challenge}&code_challenge_method=S256"
    
    return RedirectResponse(auth_url)


@router.get("/oauth/{provider}/callback")
async def oauth_callback(
    provider: str,
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle OAuth2 callback"""
    service = OAuth2Service(db)
    
    # Validate state
    oauth_state = await service.validate_state(state)
    if not oauth_state:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    
    try:
        # Exchange code for access token
        access_token = await service.exchange_code(
            provider, code, oauth_state.code_verifier
        )
        
        # Get user info
        user_info = await service.get_user_info(provider, access_token)
        
        # Extract fields using field mapping
        config = await service.get_provider_config(provider)
        field_mapping = config.field_mapping
        
        provider_id = str(user_info.get(field_mapping.get("identifier", "id")))
        email = user_info.get(field_mapping.get("email"))
        display_name = user_info.get(field_mapping.get("display_name"))
        avatar_url = user_info.get(field_mapping.get("avatar_url"))
        
        # Find or create user
        user = await service.find_or_create_user(
            provider=provider,
            provider_id=provider_id,
            email=email,
            display_name=display_name,
            avatar_url=avatar_url
        )
        
        # Generate tokens
        access_token, refresh_token, refresh_exp = service.generate_tokens(user)
        
        # Store refresh token
        await service.store_refresh_token(user.id, refresh_token, refresh_exp)
        
        # Redirect to return URL with tokens
        return_url = oauth_state.return_url or "/"
        response = RedirectResponse(
            f"{return_url}?access_token={access_token}",
            status_code=302
        )
        
        # Set refresh token cookie
        response.set_cookie(
            key="localdocs_refresh",
            value=refresh_token,
            httponly=True,
            secure=settings.ENV == "production",
            samesite="lax",
            max_age=30 * 24 * 60 * 60  # 30 days
        )
        
        return response
        
    except OAuth2Error as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OAuth error: {str(e)}")
```

---

## Security Considerations

### OAuth2 Security Checklist

- [ ] **Always use PKCE** - Required for public clients
- [ ] **Validate state parameter** - Prevents CSRF attacks
- [ ] **Short-lived state** - 10-minute expiry is recommended
- [ ] **Secure token storage** - Encrypt client secrets at rest
- [ ] **HTTPS only** - OAuth2 requires secure transport
- [ ] **Token rotation** - Consider rotating refresh tokens
- [ ] **Scope minimization** - Request only necessary scopes
- [ ] **User linking validation** - Verify email ownership before linking

### Provider-Specific Notes

**Google:**
- Requires `openid` scope for OIDC compliance
- `sub` claim is the stable unique identifier
- Access tokens are valid for 1 hour

**GitHub:**
- `read:user` scope includes public email
- `user:email` scope includes private emails
- User ID is numeric and stable across applications

**Microsoft:**
- Use `/.default` scope for incremental consent
- `sub` claim format: `{oid}@{tenant_id}`

---

## Referenced Files

| File | Purpose |
|------|---------|
| [Memos OAuth2 plugin](../../memos/plugin/idp/oauth2/oauth2.go) | Full OAuth2 provider implementation |
| [Memos frontend oauth.ts](../../memos/web/src/utils/oauth.ts) | Frontend PKCE implementation |
| [Memos OAuth2 test](../../memos/plugin/idp/oauth2/oauth2_test.go) | OAuth2 test patterns |
| [Python jose docs](https://python-jose.readthedocs.io/) | JWT encoding/decoding |
| [Passlib bcrypt](https://passlib.readthedocs.io/) | Password hashing |

---

## Testing OAuth2

### Manual Testing Checklist

1. [ ] Clear session storage
2. [ ] Click "Login with {Provider}"
3. [ ] Verify redirect to provider
4. [ ] Approve access on provider
5. [ ] Verify redirect back to app
6. [ ] Check access token is set
7. [ ] Check refresh token cookie is set
8. [ ] Verify user is created/found in database
9. [ ] Test logout and re-login
10. [ ] Test linking multiple OAuth providers
