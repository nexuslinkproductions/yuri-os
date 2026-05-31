//! Crypto receipts and their receipt-timestamp valuation.
//!
//! A bounty paid in crypto arrives as a raw token amount with no fiat meaning until it
//! is *valued*. The ledger refuses to settle an **unvalued** receipt: marking it paid
//! without a valuation is a protected-path violation that the salience hard-veto blocks
//! (see [`crate::settle`]). This module is the data: the raw receipt, and the
//! [`CryptoValuation`] that pins it to fiat **at the receipt timestamp** (not now —
//! valuing at settlement time would let price drift rewrite history).
//!
//! ## What "valued" stores (LOCKED)
//!
//! A valuation keeps all three of:
//! - the **raw amount** of the token (exact [`Decimal`], the on-chain quantity),
//! - the **valued cents** in fiat (the integer minor units that hit the ledger), and
//! - the **rate** used (fiat-per-token, exact [`Decimal`]),
//!
//! plus the timestamp the rate was taken at. Keeping the raw amount and rate alongside
//! the valued cents makes the conversion auditable and reproducible; the ledger posts
//! the valued cents, but can always show its work.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use uuid::Uuid;

use nexus_core::Money;

/// A raw crypto receipt: a token amount received, not yet meaningful in fiat.
///
/// This is the *manual / CSV import* shape — there is no live banking or chain query.
/// On its own a receipt cannot be marked paid; it must first be valued into a
/// [`CryptoValuation`]. A receipt with `valuation == None` is exactly the case the
/// hard-veto blocks.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CryptoReceipt {
    /// Stable receipt id.
    pub id: Uuid,
    /// The token symbol, e.g. `"ETH"`, `"USDC"`. Free-text in v1.
    pub token: String,
    /// The raw on-chain amount received, exact. No fiat meaning by itself.
    pub raw_amount: Decimal,
    /// When the receipt was received — the timestamp a valuation must price against.
    pub received_at: OffsetDateTime,
    /// The fiat valuation, if one has been attached. `None` = unvalued = blocked.
    pub valuation: Option<CryptoValuation>,
}

impl CryptoReceipt {
    /// Builds an **unvalued** receipt (the import-time shape).
    #[must_use]
    pub fn new(
        id: Uuid,
        token: impl Into<String>,
        raw_amount: Decimal,
        received_at: OffsetDateTime,
    ) -> Self {
        CryptoReceipt {
            id,
            token: token.into(),
            raw_amount,
            received_at,
            valuation: None,
        }
    }

    /// Whether this receipt carries a valuation. `false` is the hard-veto trigger.
    #[must_use]
    pub fn is_valued(&self) -> bool {
        self.valuation.is_some()
    }

    /// Attaches a valuation computed at the **receipt timestamp**, consuming `self` and
    /// returning the valued receipt.
    ///
    /// The `rate` is fiat-per-token taken at [`received_at`](Self::received_at); the
    /// valued [`Money`] is `raw_amount · rate` in `currency`. The raw amount and the
    /// rate are both retained on the [`CryptoValuation`] so the conversion stays
    /// auditable.
    #[must_use]
    pub fn valued_at_receipt(
        mut self,
        rate: Decimal,
        currency: impl Into<String>,
    ) -> Self {
        let currency = currency.into();
        let fiat = self.raw_amount * rate;
        self.valuation = Some(CryptoValuation {
            rate,
            valued_at: self.received_at,
            value: Money::new(fiat, currency),
        });
        self
    }
}

/// A fiat valuation pinned to a receipt's timestamp.
///
/// Holds the rate used, the timestamp it was priced at, and the resulting fiat
/// [`Money`]. The raw token amount lives on the parent [`CryptoReceipt`]; together they
/// fully reproduce the conversion (`value == receipt.raw_amount * rate`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CryptoValuation {
    /// Fiat-per-token rate used for the conversion, exact.
    pub rate: Decimal,
    /// The timestamp the rate was taken at — the receipt's own `received_at`.
    pub valued_at: OffsetDateTime,
    /// The resulting fiat amount (exact decimal + currency). What the ledger posts.
    pub value: Money,
}
