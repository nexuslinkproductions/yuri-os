//! Immutable double-entry: [`Account`], [`Posting`], [`JournalEntry`].
//!
//! ## The one invariant
//!
//! A [`JournalEntry`] is a set of signed [`Posting`]s that **sum to exactly
//! [`Decimal::ZERO`]**. Sign encodes direction: a debit is `amount > 0`, a credit is
//! `amount < 0`. The invariant is enforced at construction
//! ([`JournalEntry::try_new`]) — an unbalanced set is a typed [`LedgerError`], never a
//! constructible value. There is no setter, no `push`, no mutation: once built, an
//! entry is frozen. That is what "immutable double-entry" means here.
//!
//! ## Money representation (LOCKED)
//!
//! Posting amounts are exact [`Decimal`] in memory and carry their currency. An entry
//! is single-currency (cross-currency netting is an explicit FX entry, M6). The
//! persisted shape is integer cents + ISO-4217 currency via [`Money::to_cents`]; this
//! module never touches `f64`.
//!
//! ## Corrections are contra-entries, never edits
//!
//! You do not edit a posted entry. To reverse it you post its
//! [`JournalEntry::contra_entry`]: the same postings with every sign flipped, which is
//! itself balanced (negating a zero sum yields zero). The original row stays; the
//! correction is a new, auditable row. This is the append-only ledger discipline.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use nexus_core::Money;

use crate::error::{LedgerError, LedgerResult};

/// A ledger account — a named bucket a [`Posting`] moves value into or out of.
///
/// Thin in v1: a stable id plus a human-readable name and an account `kind` tag
/// (`"asset"`, `"liability"`, `"revenue"`, `"expense"`, ...). Full chart-of-accounts
/// semantics (normal balance, parent rollups) are M6; v1 only needs identity so a
/// posting can name where value went.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Account {
    /// Stable account id.
    pub id: Uuid,
    /// Human-readable account name, e.g. `"Cash:Crypto"`, `"Revenue:Bounty"`.
    pub name: String,
    /// Account kind tag, e.g. `"asset"`, `"revenue"`, `"expense"`.
    pub kind: String,
}

impl Account {
    /// Builds an account.
    #[must_use]
    pub fn new(id: Uuid, name: impl Into<String>, kind: impl Into<String>) -> Self {
        Account {
            id,
            name: name.into(),
            kind: kind.into(),
        }
    }
}

/// A single signed movement against one account.
///
/// `amount` is an exact [`Money`] whose decimal sign carries direction:
/// **debit `> 0`, credit `< 0`**. A zero-amount posting is allowed (it is a legal,
/// if pointless, line); the balancing invariant lives on the [`JournalEntry`], not the
/// individual posting.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Posting {
    /// The account this posting moves value against.
    pub account_id: Uuid,
    /// Signed amount: debit `> 0`, credit `< 0`. Exact decimal + currency.
    pub amount: Money,
}

impl Posting {
    /// A debit posting (positive amount) for `value` of `currency` against `account`.
    ///
    /// `value` is taken as-is as the magnitude; this constructor does not flip sign, so
    /// pass a non-negative magnitude. (No validation is forced here — a caller building
    /// a contra-entry legitimately passes signed values.)
    #[must_use]
    pub fn debit(account_id: Uuid, value: Decimal, currency: impl Into<String>) -> Self {
        Posting {
            account_id,
            amount: Money::new(value, currency),
        }
    }

    /// A credit posting (negative amount) for `value` of `currency` against `account`.
    ///
    /// `value` is the magnitude; the sign is flipped to negative here.
    #[must_use]
    pub fn credit(account_id: Uuid, value: Decimal, currency: impl Into<String>) -> Self {
        Posting {
            account_id,
            amount: Money::new(-value, currency),
        }
    }

    /// A posting carrying an already-signed [`Money`] verbatim (used by
    /// [`JournalEntry::contra_entry`], which negates each amount).
    #[must_use]
    pub fn signed(account_id: Uuid, amount: Money) -> Self {
        Posting { account_id, amount }
    }
}

/// An immutable, balanced set of postings — one indivisible ledger transaction.
///
/// Construct with [`JournalEntry::try_new`], which enforces, in order:
/// 1. non-empty (an empty entry records nothing → [`LedgerError::EmptyEntry`]),
/// 2. single-currency ([`LedgerError::MixedCurrency`]),
/// 3. `Σ amount == 0` exactly ([`LedgerError::Unbalanced`]).
///
/// After construction the postings are read-only ([`JournalEntry::postings`]); there is
/// no mutator. A reversal is a fresh [`JournalEntry::contra_entry`], not an edit.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JournalEntry {
    id: Uuid,
    memo: String,
    currency: String,
    postings: Vec<Posting>,
    /// If this entry reverses another, the id of the entry it corrects. `None` for an
    /// original entry. Set only by [`JournalEntry::contra_entry`].
    corrects: Option<Uuid>,
}

impl JournalEntry {
    /// Builds a balanced journal entry, or returns a typed error if the invariant fails.
    ///
    /// # Errors
    /// - [`LedgerError::EmptyEntry`] if `postings` is empty.
    /// - [`LedgerError::MixedCurrency`] if postings carry more than one currency.
    /// - [`LedgerError::Unbalanced`] if the signed amounts do not sum to exactly
    ///   [`Decimal::ZERO`]. The exact residual is reported.
    pub fn try_new(
        id: Uuid,
        memo: impl Into<String>,
        postings: Vec<Posting>,
    ) -> LedgerResult<Self> {
        Self::build(id, memo.into(), postings, None)
    }

    /// Internal constructor shared by [`try_new`](Self::try_new) and
    /// [`contra_entry`](Self::contra_entry); threads the optional `corrects` link.
    fn build(
        id: Uuid,
        memo: String,
        postings: Vec<Posting>,
        corrects: Option<Uuid>,
    ) -> LedgerResult<Self> {
        let anchor = match postings.first() {
            Some(first) => first.amount.currency.clone(),
            None => return Err(LedgerError::EmptyEntry),
        };

        // Single-currency guard. Balancing is only meaningful within one unit.
        for p in &postings {
            if p.amount.currency != anchor {
                return Err(LedgerError::MixedCurrency {
                    expected: anchor,
                    found: p.amount.currency.clone(),
                });
            }
        }

        // The invariant: signed amounts sum to exactly ZERO. Decimal addition is exact,
        // so this is an exact equality, not a tolerance check.
        let residual = postings
            .iter()
            .fold(Decimal::ZERO, |acc, p| acc + p.amount.amount);
        if residual != Decimal::ZERO {
            return Err(LedgerError::Unbalanced { residual });
        }

        Ok(JournalEntry {
            id,
            memo,
            currency: anchor,
            postings,
            corrects,
        })
    }

    /// The entry id.
    #[must_use]
    pub fn id(&self) -> Uuid {
        self.id
    }

    /// The free-text memo.
    #[must_use]
    pub fn memo(&self) -> &str {
        &self.memo
    }

    /// The single currency every posting in this entry shares.
    #[must_use]
    pub fn currency(&self) -> &str {
        &self.currency
    }

    /// Read-only view of the postings. There is no mutable accessor by design.
    #[must_use]
    pub fn postings(&self) -> &[Posting] {
        &self.postings
    }

    /// The id of the entry this one corrects, if any.
    #[must_use]
    pub fn corrects(&self) -> Option<Uuid> {
        self.corrects
    }

    /// The exact signed sum of the postings — always [`Decimal::ZERO`] for a
    /// constructed entry, exposed so a caller can re-assert the invariant in a test or
    /// audit without reaching into the postings.
    #[must_use]
    pub fn balance(&self) -> Decimal {
        self.postings
            .iter()
            .fold(Decimal::ZERO, |acc, p| acc + p.amount.amount)
    }

    /// Builds the **contra-entry** that reverses this one: every posting's amount
    /// negated, under a fresh `new_id`, linked back via [`corrects`](Self::corrects).
    ///
    /// Negating a zero sum yields zero, so a contra-entry is balanced by construction —
    /// but it still goes through the same [`build`](Self::build) validation, so the
    /// invariant is never assumed, always proven. This is the only sanctioned reversal:
    /// the original entry is never edited.
    ///
    /// # Errors
    /// Propagates the same construction errors as [`try_new`](Self::try_new); in
    /// practice the only reachable one is impossible (a balanced entry negates to a
    /// balanced entry), but the path stays fallible rather than panicking.
    pub fn contra_entry(&self, new_id: Uuid, memo: impl Into<String>) -> LedgerResult<Self> {
        let flipped: Vec<Posting> = self
            .postings
            .iter()
            .map(|p| {
                Posting::signed(
                    p.account_id,
                    Money::new(-p.amount.amount, p.amount.currency.clone()),
                )
            })
            .collect();
        Self::build(new_id, memo.into(), flipped, Some(self.id))
    }
}
