# LocalDocs Hub - Authentication Documentation

This folder contains comprehensive documentation for implementing authentication, multi-user support, and OAuth2 in LocalDocs Hub.

---

## Quick Reference

### Authentication Methods

| Method | Use Case | Token Lifetime |
|--------|----------|----------------|
| Username/Password | Standard login | Access: 15 min, Refresh: 30 days |
| OAuth2 | Social login (Google, GitHub, etc.) | Same as above |
| Personal Access Token | API/programmatic access | User-defined or never |

### User Roles

| Role | Capabilities |
|------|-------------|
| **ADMIN** | Full system access, user management, all resources |
| **USER** | Own resources only, can create PATs, can link OAuth |

---

## Documentation Index

### 1. [Authentication & Authorization Design](AUTHENTICATION.md)

**Start here.** This is the main authentication reference covering:

- Architecture overview with flow diagrams
- User, RefreshToken, PersonalAccessToken models
- JWT token design (access & refresh tokens)
- Password requirements and validation
- API endpoints (registration, login, logout, refresh)
- Token refresh flow
- Security considerations
- Implementation priority (5 phases)

### 2. [Multi-User Support](MULTI_USER.md)

Covers multi-user system design:

- User roles and permissions
- First-user bootstrap (automatic ADMIN)
- Device-user relationship
- Resource ownership hierarchy
- Access control rules
- API endpoints for user management
- User settings model
- Database migration for adding users
- Migration path for existing data

### 3. [OAuth2 Integration Guide](OAUTH2.md)

Detailed OAuth2 implementation:

- OAuth2 configuration (environment variables)
- OAuth2Config and OAuth2State models
- Provider-specific setup (Google, GitHub, Microsoft)
- API endpoints
- PKCE implementation (with code)
- Backend service implementation
- Frontend implementation
- Security checklist

---

## Key Implementation Files

When implementing, refer to these reference implementations:

| LocalDocs File | Reference For |
|----------------|---------------|
| `backend/app/core/config.py` | JWT settings, add OAuth config |
| `backend/app/core/database.py` | Database setup patterns |
| `backend/app/models/folder.py` | Add user_id column |
| `backend/app/models/document.py` | Add user_id column |
| `backend/app/api/documents.py` | Protected route pattern |

### Reference Files from Memos

The Memos project provides excellent reference implementations:

| Memos File | Purpose |
|------------|---------|
| `memos/server/auth/authenticator.go` | Auth service with PAT support |
| `memos/server/auth/token.go` | JWT generation/parsing |
| `memos/server/auth/context.go` | Context utilities |
| `memos/server/router/api/v1/user_service.go` | User CRUD, registration |
| `memos/plugin/idp/oauth2/oauth2.go` | OAuth2 provider plugin |
| `memos/web/src/utils/oauth.ts` | Frontend PKCE utilities |
| `memos/web/src/contexts/AuthContext.tsx` | Frontend auth state |

---

## Implementation Checklist

### Phase 1: Basic JWT Auth

- [ ] Create User model (`backend/app/models/user.py`)
- [ ] Create RefreshToken model (`backend/app/models/refresh_token.py`)
- [ ] Create database migration
- [ ] Add security module (`backend/app/core/security.py`)
- [ ] Create auth schemas (`backend/app/schemas/auth.py`)
- [ ] Implement registration endpoint
- [ ] Implement login endpoint
- [ ] Create auth dependency (`backend/app/api/deps.py`)
- [ ] Protect existing routes with auth
- [ ] Update folder/document models with user_id

### Phase 2: Refresh Tokens & Logout

- [ ] Implement token refresh endpoint
- [ ] Implement logout endpoint
- [ ] Add cookie handling
- [ ] Add rate limiting on auth endpoints
- [ ] Add password validation

### Phase 3: OAuth2

- [ ] Create OAuth2Config model
- [ ] Create OAuth2State model
- [ ] Create OAuth2Service
- [ ] Implement OAuth initiation endpoint
- [ ] Implement OAuth callback endpoint
- [ ] Add PKCE support
- [ ] Add provider configuration UI (future)

### Phase 4: Personal Access Tokens

- [ ] Create PAT model
- [ ] Implement PAT creation endpoint
- [ ] Implement PAT validation in auth flow
- [ ] Add PAT listing/deletion endpoints
- [ ] Add PAT last_used tracking

### Phase 5: User Management

- [ ] Implement admin user list endpoint
- [ ] Implement user update endpoint
- [ ] Implement user delete endpoint
- [ ] Add role management
- [ ] Add user settings model

---

## Environment Variables

```env
# JWT
SECRET_KEY=your-secret-key-min-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15

# OAuth2 Providers
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Optional
APP_URL=https://your-domain.com
```

---

## Database Changes Summary

New tables needed:
- `users` - User accounts
- `refresh_tokens` - Refresh token storage
- `personal_access_tokens` - PAT storage
- `user_settings` - Per-user settings
- `oauth2_configs` - OAuth provider configs
- `oauth2_states` - OAuth state tracking

Columns to add:
- `devices.user_id` - Link devices to users
- `folders.user_id` - Link folders to users
- `documents.user_id` - Link documents to users

---

## Testing

### Auth Endpoint Testing

```bash
# Register
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"TestPass123","email":"test@example.com"}'

# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"TestPass123"}'

# Get current user (with token)
curl http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer <access_token>"

# Refresh token
curl -X POST http://localhost:8000/api/v1/auth/refresh \
  -H "Cookie: localdocs_refresh=<refresh_token>"

# Logout
curl -X POST http://localhost:8000/api/v1/auth/logout \
  -H "Authorization: Bearer <access_token>"
```

---

## Common Issues

### "User not found" after OAuth callback
- Check that `oauth_provider` and `oauth_provider_id` are being stored correctly
- Verify the identifier field mapping matches the provider's response

### "Invalid state" on OAuth callback
- State expired (10 minute window)
- State was already used (CSRF protection removes after validation)
- Check that frontend is sending state correctly

### Password validation failing
- Password must meet all requirements (8+ chars, uppercase, lowercase, digit)
- Username must be 3-64 chars, alphanumeric with underscore/hyphen only

### Refresh token not working
- Check cookie settings (HttpOnly, Secure in production)
- Verify token is not expired
- Check that token hash matches database

---

## External Resources

- [FastAPI Security Docs](https://fastapi.tiangolo.com/tutorial/security/)
- [Python-Jose Library](https://python-jose.readthedocs.io/)
- [Passlib Documentation](https://passlib.readthedocs.io/)
- [OAuth 2.0 RFC 6749](https://datatracker.ietf.org/doc/html/rfc6749)
- [PKCE RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)
