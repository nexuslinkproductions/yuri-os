//! Tenant identity.
//!
//! Every domain record carries a [`TenantId`], and every [`Store`](crate::Store)
//! method takes one as its first argument. Isolation is enforced at the port
//! boundary: a record whose `tenant_id` does not match the scoped tenant is a
//! [`CoreError::TenantMismatch`](crate::CoreError::TenantMismatch), never silently
//! returned.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// A tenant identifier — a transparent newtype over [`Uuid`].
///
/// `#[serde(transparent)]` means it serializes exactly as the inner UUID (no wrapper
/// object), so the persisted shape is a plain UUID string/column. `Copy` because a
/// 16-byte id is cheap to pass by value and it is threaded through every port call.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct TenantId(pub Uuid);

impl TenantId {
    /// Wraps a raw [`Uuid`] as a tenant id.
    #[must_use]
    pub const fn new(id: Uuid) -> Self {
        TenantId(id)
    }

    /// Generates a fresh random (v4) tenant id.
    #[must_use]
    pub fn new_v4() -> Self {
        TenantId(Uuid::new_v4())
    }

    /// The inner [`Uuid`].
    #[must_use]
    pub const fn as_uuid(&self) -> Uuid {
        self.0
    }
}

impl From<Uuid> for TenantId {
    fn from(id: Uuid) -> Self {
        TenantId(id)
    }
}

impl core::fmt::Display for TenantId {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}", self.0)
    }
}
