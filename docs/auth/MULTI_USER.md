# LocalDocs Hub - Multi-User Support Design

## Overview

This document describes how LocalDocs Hub supports multiple users, including:
- User registration and role management
- Device-user relationship
- Resource ownership and access control
- Multi-user API design

---

## User Roles

LocalDocs Hub supports two roles:

### ADMIN Role
- Full access to all resources
- Can manage other users (create, update, delete)
- Can view all folders and documents
- Can manage OAuth configurations
- Can view system health and statistics

### USER Role
- Access to own resources only
- Can manage own folders and documents
- Can create Personal Access Tokens
- Can link/unlink OAuth providers
- Cannot manage other users

---

## First-User Bootstrap

When no users exist in the system, the first registered user automatically becomes **ADMIN**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FIRST USER REGISTRATION                              │
└─────────────────────────────────────────────────────────────────────────────┘

  POST /api/v1/auth/register
  {
    "username": "admin",
    "password": "AdminPass123"
  }

                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  CHECK: Is this the first user?                                      │
  │     • Query: SELECT COUNT(*) FROM users                             │
  │     • If count == 0 → First user = ADMIN                            │
  │     • If count > 0 → Assign USER role                              │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  CREATE USER WITH ROLE                                               │
  │     First user:  role = ADMIN                                       │
  │     Other users: role = USER                                        │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## Device-User Relationship

Each device belongs to a user. The device_user linking allows:

1. **User identification** - Which user owns this device
2. **Access control** - Devices can only access their owner's resources
3. **Sync scoping** - Sync events are tagged with device-user ownership

### Device Model Extension

**File:** `backend/app/models/device.py` (extension)

```python
from datetime import datetime
from uuid import uuid4
from sqlalchemy import String, DateTime, Boolean, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    
    # User ownership (NEW - replaces device_id string approach)
    user_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("users.id", ondelete="CASCADE"), 
        nullable=False
    )
    
    # Device identity
    device_name: Mapped[str] = mapped_column(String(128), nullable=False)
    device_type: Mapped[str] = mapped_column(String(32), default="desktop")  # desktop, mobile, server
    
    # Device public key for signing (future use)
    public_key: Mapped[str] = mapped_column(String(512), nullable=True)
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="devices")
    folders: Mapped[list["Folder"]] = relationship("Folder", back_populates="owner_device")
    documents: Mapped[list["Document"]] = relationship("Document", back_populates="device")

    # User relationship (for backwards compatibility with existing code)
    user: Mapped["User"] = relationship("User", back_populates="devices")
```

### Updated Folder Model

**File:** `backend/app/models/folder.py` (update)

```python
# Add user_id and owner_device_id columns

class Folder(Base):
    __tablename__ = "folders"

    # ... existing fields ...
    
    # Replace single device_id with user ownership
    user_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("users.id", ondelete="CASCADE"), 
        nullable=False
    )
    owner_device_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True  # NULL means folder is synced from another device
    )
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="folders")
    owner_device: Mapped["Device"] = relationship("Device", back_populates="folders")
```

### Updated Document Model

**File:** `backend/app/models/document.py` (update)

```python
# Add user_id column

class Document(Base):
    __tablename__ = "documents"
    
    # ... existing fields ...
    
    # Add user ownership
    user_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("users.id", ondelete="CASCADE"), 
        nullable=False
    )
    
    # Update relationship
    user: Mapped["User"] = relationship("User", back_populates="documents")
```

---

## Resource Ownership

### Ownership Hierarchy

```
User (user_id)
  └── Device (device_id, user_id)
        └── Folder (folder_id, user_id, owner_device_id)
              └── Document (doc_id, folder_id, user_id, device_id)
```

### Access Control Rules

| Resource | Access Rule |
|----------|-------------|
| User | ADMIN can access all users; users can access their own profile |
| Device | Users can only access their own devices |
| Folder | Users can only access their own folders |
| Document | Users can only access documents in their own folders |

### Query Filtering Pattern

```python
# All queries should filter by user_id for multi-user isolation

async def list_folders(db: AsyncSession, current_user: User):
    query = select(Folder).where(Folder.user_id == current_user.id)
    # For ADMIN users who need cross-user access:
    if current_user.role == UserRole.ADMIN:
        # Admin can pass optional user_id filter
        pass
```

---

## API Endpoints for User Management

### List Users (Admin Only)

```
GET /api/v1/users?skip=0&limit=50

Response 200:
{
  "users": [
    {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "role": "ADMIN",
      "created_at": "2024-01-01T00:00:00Z"
    },
    {
      "id": 2,
      "username": "john",
      "email": "john@example.com",
      "role": "USER",
      "created_at": "2024-01-02T00:00:00Z"
    }
  ],
  "total": 2
}
```

### Get User (Admin or Self)

```
GET /api/v1/users/{user_id}

Response 200:
{
  "id": 1,
  "username": "admin",
  "email": "admin@example.com",
  "nickname": "Administrator",
  "avatar_url": "https://example.com/avatar.png",
  "role": "ADMIN",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### Update User (Admin or Self)

```
PATCH /api/v1/users/{user_id}
{
  "nickname": "Admin User",
  "email": "newemail@example.com"
}

Response 200:
{
  "id": 1,
  "username": "admin",
  "email": "newemail@example.com",
  "nickname": "Admin User",
  "role": "ADMIN",
  ...
}
```

### Delete User (Admin Only)

```
DELETE /api/v1/users/{user_id}

Response 204: No Content
```

---

## User Settings

### Settings Schema

**File:** `backend/app/models/user_setting.py`

```python
from datetime import datetime
from sqlalchemy import String, DateTime, Text, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.core.database import Base


class UserSetting(Base):
    __tablename__ = "user_settings"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("users.id", ondelete="CASCADE"), 
        nullable=False,
        unique=True  # One settings record per user
    )
    
    # General settings (JSON)
    general: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Example: { "theme": "dark", "language": "en", "timezone": "UTC" }
    
    # OAuth linked accounts
    oauth_accounts: Mapped[list] = mapped_column(JSONB, default=list)
    # Example: [{ "provider": "google", "provider_id": "123" }]
    
    # Email notification preferences
    notifications: Mapped[dict] = mapped_column(JSONB, default=dict)
    # Example: { "email_on_share": true, "email_on_sync_error": true }
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    user: Mapped["User"] = relationship("User", back_populates="settings")
```

---

## Database Migration

### Migration: Add Users Tables

**File:** `backend/alembic/versions/001_add_users.py`

```python
"""Add users and authentication tables

Revision ID: 001
Revises: 
Create Date: 2024-01-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('row_status', sa.String(16), nullable=False, default='ACTIVE'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('username', sa.String(64), nullable=False, unique=True),
        sa.Column('email', sa.String(255), nullable=True, unique=True),
        sa.Column('password_hash', sa.String(255), nullable=True),
        sa.Column('nickname', sa.String(64), nullable=True),
        sa.Column('avatar_url', sa.String(512), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('role', sa.String(16), nullable=False, default='USER'),
        sa.Column('oauth_provider', sa.String(64), nullable=True),
        sa.Column('oauth_provider_id', sa.String(255), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_username', 'users', ['username'])
    op.create_index('ix_users_email', 'users', ['email'])
    op.create_index('ix_users_oauth', 'users', ['oauth_provider', 'oauth_provider_id'])

    # Create refresh_tokens table
    op.create_table(
        'refresh_tokens',
        sa.Column('id', UUID(as_uuid=False), primary_key=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )

    # Create personal_access_tokens table
    op.create_table(
        'personal_access_tokens',
        sa.Column('id', UUID(as_uuid=False), primary_key=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(64), nullable=False),
        sa.Column('token_hash', sa.String(64), nullable=False, unique=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )

    # Create user_settings table
    op.create_table(
        'user_settings',
        sa.Column('id', UUID(as_uuid=False), primary_key=True),
        sa.Column('user_id', sa.Integer(), nullable=False, unique=True),
        sa.Column('general', JSONB(), nullable=False, server_default='{}'),
        sa.Column('oauth_accounts', JSONB(), nullable=False, server_default='[]'),
        sa.Column('notifications', JSONB(), nullable=False, server_default='{}'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )

    # Add user_id to devices table
    op.add_column('devices', sa.Column('user_id', sa.Integer(), nullable=True))
    op.create_index('ix_devices_user_id', 'devices', ['user_id'])
    op.create_foreign_key('fk_devices_user', 'devices', 'users', ['user_id'], ['id'], ondelete='CASCADE')

    # Add user_id and owner_device_id to folders table
    op.add_column('folders', sa.Column('user_id', sa.Integer(), nullable=False))
    op.add_column('folders', sa.Column('owner_device_id', UUID(as_uuid=False), nullable=True))
    op.create_index('ix_folders_user_id', 'folders', ['user_id'])
    op.create_foreign_key('fk_folders_user', 'folders', 'users', ['user_id'], ['id'], ondelete='CASCADE')

    # Add user_id to documents table
    op.add_column('documents', sa.Column('user_id', sa.Integer(), nullable=False))
    op.create_index('ix_documents_user_id', 'documents', ['user_id'])
    op.create_foreign_key('fk_documents_user', 'documents', 'users', ['user_id'], ['id'], ondelete='CASCADE')


def downgrade() -> None:
    # Drop foreign keys and columns
    op.drop_constraint('fk_documents_user', 'documents', type_='foreignkey')
    op.drop_index('ix_documents_user_id', 'documents')
    op.drop_column('documents', 'user_id')

    op.drop_constraint('fk_folders_user', 'folders', type_='foreignkey')
    op.drop_index('ix_folders_user_id', 'folders')
    op.drop_column('folders', 'owner_device_id')
    op.drop_column('folders', 'user_id')

    op.drop_constraint('fk_devices_user', 'devices', type_='foreignkey')
    op.drop_index('ix_devices_user_id', 'devices')
    op.drop_column('devices', 'user_id')

    op.drop_table('user_settings')
    op.drop_table('personal_access_tokens')
    op.drop_table('refresh_tokens')
    op.drop_table('users')
```

---

## Referenced Files

For implementation details, refer to:

| File | Purpose |
|------|---------|
| [Memos store/user.go](../../memos/store/user.go) | User model reference |
| [Memos user_service.go](../../memos/server/router/api/v1/user_service.go) | User CRUD operations |
| [LocalDocs folder model](../backend/app/models/folder.py) | Current folder model |
| [LocalDocs document model](../backend/app/models/document.py) | Current document model |
| [LocalDocs database.py](../backend/app/core/database.py) | Database setup |

---

## Migration Path for Existing Data

If you have existing data with `device_id` tracking (but no users):

1. **Create admin user** - First user gets ADMIN role
2. **Create device records** - One device per unique device_id, linked to admin
3. **Update folders/documents** - Set `user_id` on all existing records
4. **Update application code** - Use `user_id` instead of `device_id` for ownership

This migration should happen once, before enabling multi-user registration.
