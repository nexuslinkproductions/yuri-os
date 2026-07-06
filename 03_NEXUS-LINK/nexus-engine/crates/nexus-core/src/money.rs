//! Money — exact in memory, integer cents on disk, `f64` only at the EV boundary.
//!
//! ## The three representations and why
//!
//! | Where | Type | Why |
//! |---|---|---|
//! | persisted / ledger | `i64` cents + ISO-4217 `currency` TEXT | exact, never `REAL`/`f64` in a money column |
//! | in memory | [`rust_decimal::Decimal`] | exact decimal arithmetic for take-rate math |
//! | EV boundary only | `f64` (ephemeral) | the kernel's [`nexus_score::ev`] is `f64`-native |
//!
//! The `f64` projection is **lossy and one-directional**. It exists for exactly one
//! reason: feeding [`nexus_score::ev::Lead`]. It is produced through the single shared
//! helper [`dec_to_f64`], which rejects non-finite results instead of letting `NaN`/∞
//! poison a ranking. No other path in the workspace should call `to_f64`.

use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};

/// A monetary amount: an exact decimal paired with an ISO-4217 currency code.
///
/// In-memory arithmetic stays in [`Decimal`]. Persistence goes through
/// [`Money::to_cents`] / [`Money::from_cents`] so the stored shape is `(i64 cents,
/// TEXT currency)` — never a float column. The currency travels with the amount so a
/// cents integer is never silently reinterpreted under the wrong unit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Money {
    /// Exact amount in major units (e.g. `180.00` euros, not cents).
    pub amount: Decimal,
    /// ISO-4217 currency code, e.g. `"EUR"`, `"USD"`. Uppercase by convention.
    pub currency: String,
}

impl Money {
    /// Builds a [`Money`] from an exact decimal amount and a currency code.
    #[must_use]
    pub fn new(amount: Decimal, currency: impl Into<String>) -> Self {
        Money {
            amount,
            currency: currency.into(),
        }
    }

    /// The persisted shape: integer minor units (cents) and the currency code.
    ///
    /// Rounds to 2 decimal places (bankers' rounding is not assumed; standard
    /// half-up via `round_dp`) before scaling by 100, so the result is the exact
    /// cents value that belongs in the `i64` money column.
    ///
    /// # Errors
    /// [`CoreError::MoneyNotRepresentable`] if the scaled value does not fit in an
    /// `i64` (a deal value beyond ~92 quadrillion cents is not a real number we store).
    pub fn to_cents(&self) -> CoreResult<(i64, String)> {
        let scaled = (self.amount * Decimal::from(100)).round();
        let cents = scaled
            .to_i64()
            .ok_or(CoreError::MoneyNotRepresentable { field: "money.cents" })?;
        Ok((cents, self.currency.clone()))
    }

    /// Reconstructs a [`Money`] from the persisted `(cents, currency)` shape.
    #[must_use]
    pub fn from_cents(cents: i64, currency: impl Into<String>) -> Self {
        // cents / 100, exact: Decimal::new(value, scale) = value * 10^-scale.
        Money {
            amount: Decimal::new(cents, 2),
            currency: currency.into(),
        }
    }

    /// Net amount after a platform take-rate: `amount · (1 − take)`, exact in decimal.
    ///
    /// `take` is a fraction in `[0, 1]` (e.g. `0.03` for a 3% take). The result keeps
    /// the same currency. Take-rate validation against `[0, 1]` is deferred to the EV
    /// boundary ([`nexus_score::ev::v_net`]); here we only do exact decimal arithmetic.
    #[must_use]
    pub fn net_of_take(&self, take: Decimal) -> Money {
        Money {
            amount: self.amount * (Decimal::ONE - take),
            currency: self.currency.clone(),
        }
    }

    /// Projects the amount to `f64` for the EV boundary via the shared [`dec_to_f64`]
    /// helper. Lossy and one-directional — do not round-trip back to money.
    ///
    /// # Errors
    /// [`CoreError::MoneyNotRepresentable`] if the projection is non-finite.
    pub fn to_ev_f64(&self, field: &'static str) -> CoreResult<f64> {
        dec_to_f64(field, self.amount)
    }
}

/// The **one** shared decimal → `f64` projection in the workspace.
///
/// This is the single sanctioned bridge from exact money to the kernel's `f64` EV
/// math. It rejects a non-finite result (`NaN` or ±∞) as
/// [`CoreError::MoneyNotRepresentable`] rather than letting it silently corrupt a
/// ranking or veto. It never panics.
///
/// `Decimal::to_f64` returns `None` only in pathological cases; we treat both `None`
/// and a non-finite `Some` as "not representable" so the failure mode is uniform.
///
/// # Errors
/// [`CoreError::MoneyNotRepresentable`] when the value has no finite `f64` image.
pub fn dec_to_f64(field: &'static str, value: Decimal) -> CoreResult<f64> {
    match value.to_f64() {
        Some(x) if x.is_finite() => Ok(x),
        _ => Err(CoreError::MoneyNotRepresentable { field }),
    }
}
