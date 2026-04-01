# LocalDocs Hub - Authentication & Authorization Design

## Overview

This document describes the authentication and authorization system for LocalDocs Hub, designed to support:
- **JWT-based authentication** for user registration and login
- **OAuth2 integration** for third-party identity providers (Google, GitHub, etc.)
- **Multi-user support** with role-based access control
- **Personal Access Tokens (PAT)** for programmatic access

This design is inspired by [Memos auth architecture](../../memos/server/auth/authenticator.go) and adapted for LocalDocs Hub's Python/FastAPI stack.

---

## Architecture Overview

### Authentication Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AUTHENTICATION FLOWS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────────────────┐  │
│  │   Username/  │      │    OAuth2    │      │   Personal Access Token   │  │
│  │   Password   │      │   Provider   │      │        (PAT)               │  │
│  └──────┬───────┘      └──────┬───────┘      └─────────────┬─────────────┘  │
│         │                     │                            │                 │
│         ▼                     ▼                            ▼                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    AUTHENTICATION SERVICE                             │    │
│  │  • Password validation (bcrypt)                                      │    │
│  │  • OAuth token exchange                                              │    │
│  │  • PAT validation                                                    │    │
│  │  • JWT generation                                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                │                                            │
│                                ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        TOKEN MANAGEMENT                               │    │
│  │                                                                       │    │
│  │  ┌─────────────────┐    ┌─────────────────┐                         │    │
│  │  │  Access Token   │    │ Refresh Token  │                         │    │
│  │  │  (JWT, 15 min)   │    │ (JWT, 30 days) │                         │    │
│  │  │  • user_id       │    │  • user_id      │                         │    │
│  │  │  • username      │    │  • token_id     │                         │    │
│  │  │  • role           │    │  • stored in DB │                         │    │
│  │  │  • stateless     │    │  • revocable    │                         │    │
│  │  └─────────────────┘    └─────────────────┘                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                │                                            │
│                                ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      AUTHORIZATION LAYER                              │    │
│  │  • Role-based access control (ADMIN, USER)                           │    │
│  │  • Resource ownership verification                                   │    │
│  │  • Device-user relationship mapping                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## User Model

### Database Schema

**File:** `backend/app/models/user.py`

```python
from datetime import datetime
from enum import Enum
from uuid import uuid4
from sqlalchemy import String, DateTime, Text, Enum as SQLEnum, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    USER = "USER"


class RowStatus(str, Enum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Standard fields
    row_status: Mapped[RowStatus] = mapped_column(
        SQLEnum(RowStatus), default=RowStatus.ACTIVE
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Authentication fields
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=True)  # NULL for OAuth-only
    
    # Profile fields
    nickname: Mapped[str] = mapped_column(String(64), nullable=True)
    avatar_url: Mapped[str] = mapped_column(String(512), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    
    # Role
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole), default=UserRole.USER)
    
    # OAuth linkage
    oauth_provider: Mapped[str] = mapped_column(String(64), nullable=True)
    oauth_provider_id: Mapped[str] = mapped_column(String(255), nullable=True)

    # Relationships
    devices: Mapped[list["Device"]] = relationship("Device", back_populates="owner")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        "RefreshToken", back_populates="user", cascade="all, delete-orphan"
    )
    personal_access_tokens: Mapped[list["PersonalAccessToken"]] = relationship(
        "PersonalAccessToken", back_populates="user", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_users_username", "username"),
        Index("ix_users_email", "email"),
        Index("ix_users_oauth", "oauth_provider", "oauth_provider_id"),
    )
```

### Refresh Token Model

**File:** `backend/app/models/refresh_token.py`

```python
from datetime import datetime
from uuid import uuid4
from sqlalchemy import String, DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_used_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    
    # User relationship
    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")
```

### Personal Access Token Model

**File:** `backend/app/models/personal_access_token.py`

```python
from datetime import datetime
from uuid import uuid4
from sqlalchemy import String, DateTime, Text, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class PersonalAccessToken(Base):
    __tablename__ = "personal_access_tokens"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)  # NULL = never
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_used_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    
    # User relationship
    user: Mapped["User"] = relationship("User", back_populates="personal_access_tokens")
```

---

## JWT Token Design

### Access Token (Short-lived, 15 minutes)

**Claims:**
```json
{
  "sub": "123",                    // user_id
  "name": "johndoe",               // username
  "role": "USER",                 // or "ADMIN"
  "status": "ACTIVE",             // or "ARCHIVED"
  "type": "access",               // token type identifier
  "iss": "localdocs-hub",         // issuer
  "aud": "user.access-token",     // audience
  "iat": 1735689600,              // issued at
  "exp": 1735690500               // expires at (15 min)
}
```

### Refresh Token (Long-lived, 30 days)

**Claims:**
```json
{
  "sub": "123",                    // user_id
  "tid": "uuid-of-token-record",  // token ID for revocation
  "type": "refresh",               // token type identifier
  "iss": "localdocs-hub",         // issuer
  "aud": "user.refresh-token",    // audience
  "iat": 1735689600,              // issued at
  "exp": 1738271600               // expires at (30 days)
}
```

### Token Constants

**File:** `backend/app/core/security.py`

```python
from datetime import timedelta

# Issuer
ISSUER = "localdocs-hub"
KEY_ID = "v1"  # For key rotation support

# Audiences
ACCESS_TOKEN_AUDIENCE = "user.access-token"
REFRESH_TOKEN_AUDIENCE = "user.refresh-token"

# Durations
ACCESS_TOKEN_DURATION = timedelta(minutes=15)
REFRESH_TOKEN_DURATION = timedelta(days=30)

# PAT prefix
PAT_PREFIX = "localdocs_pat_"

# Cookie settings
REFRESH_TOKEN_COOKIE_NAME = "localdocs_refresh"
REFRESH_TOKEN_COOKIE_SECURE = True  # True in production
REFRESH_TOKEN_COOKIE_SAMESITE = "lax"
REFRESH_TOKEN_COOKIE_HTTPONLY = True
```

---

## Password Requirements

To ensure security while balancing usability, passwords must meet the following requirements:

### Validation Rules

| Rule | Requirement | Error Message |
|------|-------------|---------------|
| Minimum length | 8 characters | "Password must be at least 8 characters" |
| Maximum length | 128 characters | "Password must not exceed 128 characters" |
| Uppercase | At least 1 uppercase letter | "Password must contain at least one uppercase letter" |
| Lowercase | At least 1 lowercase letter | "Password must contain at least one lowercase letter" |
| Digit | At least 1 digit | "Password must contain at least one digit" |

### Username Requirements

| Rule | Requirement | Error Message |
|------|-------------|---------------|
| Minimum length | 3 characters | "Username must be at least 3 characters" |
| Maximum length | 64 characters | "Username must not exceed 64 characters" |
| Pattern | Only alphanumeric, underscore, hyphen | "Username can only contain letters, numbers, underscores, and hyphens" |
| Case | Case-insensitive uniqueness | "Username already taken" |

---

## API Endpoints

### Authentication Endpoints

**File:** `backend/app/api/auth.py`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/v1/auth/register` | Register new user | No |
| POST | `/api/v1/auth/login` | Login with username/password | No |
| POST | `/api/v1/auth/logout` | Logout (revoke refresh token) | Yes |
| POST | `/api/v1/auth/refresh` | Refresh access token | No (cookie) |
| GET | `/api/v1/auth/me` | Get current user | Yes |
| POST | `/api/v1/auth/pat` | Create PAT | Yes |
| DELETE | `/api/v1/auth/pat/{token_id}` | Revoke PAT | Yes |
| GET | `/api/v1/auth/pat` | List user's PATs | Yes |

### OAuth Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/v1/auth/oauth/{provider}` | Initiate OAuth flow | No |
| GET | `/api/v1/auth/oauth/{provider}/callback` | OAuth callback | No |
| POST | `/api/v1/auth/oauth/{provider}/link` | Link OAuth to account | Yes |

### User Management Endpoints (Admin)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/v1/users` | List all users | Admin |
| GET | `/api/v1/users/{user_id}` | Get user details | Admin |
| PATCH | `/api/v1/users/{user_id}` | Update user | Admin/Self |
| DELETE | `/api/v1/users/{user_id}` | Delete user | Admin |

---

## Registration Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER REGISTRATION FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

  POST /api/v1/auth/register
  {
    "username": "johndoe",
    "email": "john@example.com",
    "password": "SecurePass123"
  }

                                    ▼

  ┌─────────────────────────────────────────────────────────────────────┐
  │  1. VALIDATE INPUT                                                   │
  │     • Check username not empty, valid format, unique               │
  │     • Check email valid format, unique (if provided)                │
  │     • Check password meets requirements                             │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  2. HASH PASSWORD                                                    │
  │     • Use bcrypt with automatic salt generation                      │
  │     • Default cost factor (12 rounds)                               │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  3. CREATE USER                                                      │
  │     • Generate user record                                           │
  │     • First user = ADMIN role                                       │
  │     • Subsequent users = USER role (unless admin creates)           │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  4. CHECK FOR EXISTING USERS                                         │
  │     • If first user → Auto-assign ADMIN role                        │
  │     • If not first user → Assign USER role                         │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  5. GENERATE TOKENS                                                  │
  │     • Generate access token (JWT, 15 min)                           │
  │     • Generate refresh token (JWT, 30 days)                         │
  │     • Store refresh token hash in database                          │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  6. RETURN RESPONSE                                                  │
  │     HTTP 201 Created                                                │
  │     {                                                               │
  │       "user": { "id": 1, "username": "johndoe", "role": "ADMIN" },  │
  │       "access_token": "eyJ...",                                      │
  │       "refresh_token": "eyJ...",                                     │
  │       "token_type": "bearer",                                        │
  │       "expires_in": 900                                              │
  │     }                                                               │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## Login Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            USER LOGIN FLOW                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  POST /api/v1/auth/login
  {
    "username": "johndoe",
    "password": "SecurePass123"
  }

                                    ▼

  ┌─────────────────────────────────────────────────────────────────────┐
  │  1. FIND USER                                                         │
  │     • Look up user by username                                       │
  │     • Return 401 if not found                                        │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  2. CHECK USER STATUS                                                 │
  │     • If ARCHIVED → Return 401 (Account disabled)                   │
  │     • If no password → Return 401 (OAuth-only account)              │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  3. VERIFY PASSWORD                                                    │
  │     • Use passlib with bcrypt backend                                │
  │     • Return 401 if password incorrect                              │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  4. GENERATE TOKENS                                                   │
  │     • Generate new access token (JWT)                               │
  │     • Generate new refresh token (JWT)                              │
  │     • Store refresh token hash in database                          │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  5. SET REFRESH TOKEN COOKIE                                         │
  │     • HttpOnly                                                       │
  │     • Secure (in production)                                         │
  │     • SameSite=Lax                                                   │
  │     • Max-Age = 30 days                                              │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  6. RETURN RESPONSE                                                  │
  │     HTTP 200 OK                                                      │
  │     {                                                               │
  │       "user": { "id": 1, "username": "johndoe", "role": "ADMIN" },  │
  │       "access_token": "eyJ...",                                      │
  │       "token_type": "bearer",                                        │
  │       "expires_in": 900                                              │
  │     }                                                               │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## Token Refresh Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TOKEN REFRESH FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  POST /api/v1/auth/refresh

  Cookie: localdocs_refresh=<refresh_token>

                                    ▼

  ┌─────────────────────────────────────────────────────────────────────┐
  │  1. EXTRACT REFRESH TOKEN                                             │
  │     • From HttpOnly cookie                                          │
  │     • Return 401 if missing                                         │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  2. VALIDATE JWT SIGNATURE                                            │
  │     • Verify with SECRET_KEY                                         │
  │     • Check issuer, audience, expiration                            │
  │     • Return 401 if invalid                                         │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  3. CHECK TOKEN IN DATABASE                                           │
  │     • Look up by token ID (tid claim)                               │
  │     • Return 401 if not found (revoked)                             │
  │     • Check expiration                                              │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  4. VERIFY USER                                                       │
  │     • User still exists                                             │
  │     • User not archived                                             │
  │     • Return 401 if user invalid                                    │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  5. ROTATE REFRESH TOKEN                                             │
  │     • Generate NEW access token                                     │
  │     • Generate NEW refresh token with new ID                        │
  │     • Update token hash in database                                 │
  │     • Update last_used_at timestamp                                 │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  6. RETURN NEW TOKENS                                                │
  │     HTTP 200 OK                                                      │
  │     {                                                               │
  │       "access_token": "eyJ...",  // NEW                             │
  │       "refresh_token": "eyJ...", // NEW (optional, can stay in cookie)│
  │       "token_type": "bearer",                                        │
  │       "expires_in": 900                                              │
  │     }                                                               │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## OAuth2 Flow

### Supported Providers

The OAuth2 implementation supports any provider that follows the OAuth2 standard:
- Google
- GitHub
- Microsoft
- Generic OIDC providers

### OAuth2 Configuration

**File:** `backend/app/core/config.py` (extension)

```python
# OAuth2 Providers Configuration
# Each provider needs: client_id, client_secret, auth_url, token_url, user_info_url

OAUTH2_PROVIDERS: dict = {
    "google": {
        "client_id": "",
        "client_secret": "",
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "user_info_url": "https://www.googleapis.com/oauth2/v3/userinfo",
        "scopes": ["openid", "email", "profile"],
        "field_mapping": {
            "identifier": "sub",      # Unique identifier
            "email": "email",
            "display_name": "name",
            "avatar_url": "picture",
        }
    },
    "github": {
        "client_id": "",
        "client_secret": "",
        "auth_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "user_info_url": "https://api.github.com/user",
        "scopes": ["read:user", "user:email"],
        "field_mapping": {
            "identifier": "id",       # GitHub uses numeric ID
            "email": "email",
            "display_name": "name",
            "avatar_url": "avatar_url",
        }
    },
}
```

### OAuth2 PKCE Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OAUTH2 FLOW WITH PKCE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: INITIATE (Frontend → Backend)                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  GET /api/v1/auth/oauth/{provider}?return_url=/dashboard              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Backend: Generate state + code_verifier + code_challenge           │   │
│  │  • state: 32 random bytes (CSRF protection)                          │   │
│  │  • code_verifier: 32 random bytes (stored for callback)             │   │
│  │  • code_challenge: BASE64URL(SHA256(code_verifier)) (sent to OAuth) │   │
│  │                                                                      │   │
│  │  Store in session: { state, provider, return_url, code_verifier }   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  STEP 2: REDIRECT TO PROVIDER                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  302 https://provider.com/oauth/authorize?                           │   │
│  │    client_id=xxx                                                     │   │
│  │    redirect_uri=https://localdocs.com/api/v1/auth/oauth/callback     │   │
│  │    response_type=code                                                │   │
│  │    scope=openid+email+profile                                        │   │
│  │    state=<state>                                                     │   │
│  │    code_challenge=<challenge>                                       │   │
│  │    code_challenge_method=S256                                        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  STEP 3: PROVIDER AUTHENTICATES USER                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  User logs in with provider                                          │   │
│  │  User approves LocalDocs Hub access                                  │   │
│  │  Provider redirects to callback with authorization code              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  STEP 4: CALLBACK (Frontend ← Provider)                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  GET /api/v1/auth/oauth/{provider}/callback?code=xxx&state=yyy      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Backend:                                                            │   │
│  │  1. Validate state (CSRF protection)                               │   │
│  │  2. Exchange code for access_token (with code_verifier)            │   │
│  │  3. Fetch user info from provider                                   │   │
│  │  4. Look up or create user by (provider, provider_id)              │   │
│  │  5. Generate JWT tokens                                              │   │
│  │  6. Redirect to return_url with tokens                               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Security Considerations

### Password Security
- **Never store plain-text passwords** - always hash with bcrypt
- **Use secure password requirements** - prevent weak passwords
- **Rate limit login attempts** - prevent brute force (5 attempts per minute per IP)

### Token Security
- **Access tokens are stateless** - cannot be revoked before expiration
- **Refresh tokens are revocable** - stored in database with timestamp
- **Use short-lived access tokens** - 15 minutes is a good balance
- **Rotate refresh tokens** - issue new refresh token on each refresh (optional)

### OAuth2 Security
- **Always use PKCE** - required for public clients
- **Validate state parameter** - prevents CSRF attacks
- **Use HTTPS in production** - PKCE requires secure context
- **Validate token expiration** - check expiry before using tokens

### Cookie Security
- **HttpOnly** - prevents JavaScript access (XSS protection)
- **Secure** - only sent over HTTPS (production)
- **SameSite** - CSRF protection (use "lax" for normal flows)

---

## Referenced Files

For implementation details, refer to:

| File | Purpose |
|------|---------|
| [Memos authenticator.go](../../memos/server/auth/authenticator.go) | Reference auth implementation |
| [Memos token.go](../../memos/server/auth/token.go) | JWT token generation/parsing |
| [Memos context.go](../../memos/server/auth/context.go) | Context utilities |
| [Memos OAuth2 plugin](../../memos/plugin/idp/oauth2/oauth2.go) | OAuth2 provider implementation |
| [Memos frontend oauth.ts](../../memos/web/src/utils/oauth.ts) | Frontend OAuth utilities |
| [Memos AuthContext.tsx](../../memos/web/src/contexts/AuthContext.tsx) | Frontend auth state management |
| [Memos user service.go](../../memos/server/router/api/v1/user_service.go) | User CRUD operations |

---

## Implementation Priority

1. **Phase 1: Basic JWT Auth**
   - User model and migration
   - Registration endpoint
   - Login endpoint
   - Token generation/validation
   - Protected route middleware

2. **Phase 2: Refresh Tokens & Logout**
   - Refresh token model
   - Token refresh endpoint
   - Logout with token revocation
   - Cookie-based refresh token handling

3. **Phase 3: OAuth2**
   - OAuth2 configuration
   - OAuth2 initiation endpoint
   - OAuth2 callback endpoint
   - User linking (OAuth + password)

4. **Phase 4: Personal Access Tokens**
   - PAT model
   - PAT creation/deletion endpoints
   - PAT validation in auth flow

5. **Phase 5: User Management**
   - Admin user list
   - User update/delete
   - Role management
