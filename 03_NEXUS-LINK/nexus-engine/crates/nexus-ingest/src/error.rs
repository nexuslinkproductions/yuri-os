//! Ingestion error type.
//!
//! [`IngestError`] covers the two failure surfaces a puller has that the domain core
//! does not: a network/transport failure and a malformed-feed (JSON) failure. It lifts
//! into [`nexus_core::CoreError`] via [`From`] so the [`Ingestor`](nexus_core::Ingestor)
//! impl can return the one error type the port contract expects.

use thiserror::Error;

/// Errors raised while pulling and parsing a bounty feed.
#[derive(Debug, Error)]
pub enum IngestError {
    /// A live HTTP pull failed (DNS, TLS, status, body read). Only the network puller
    /// produces this; fixture-backed tests never hit it.
    #[error("feed http error ({feed}): {source}")]
    Http {
        /// Which feed was being pulled.
        feed: &'static str,
        /// The underlying transport error.
        #[source]
        source: reqwest::Error,
    },

    /// A feed body did not parse as the expected JSON shape.
    #[error("feed parse error ({feed}): {source}")]
    Parse {
        /// Which feed produced the malformed body.
        feed: &'static str,
        /// The underlying serde_json error.
        #[source]
        source: serde_json::Error,
    },
}

/// Lifts an ingestion failure into the core port error so the [`Ingestor`] impl can
/// return [`nexus_core::CoreResult`]. The detail is preserved in the message; the core
/// layer models it as an opaque [`Store`](nexus_core::CoreError::Store)-class failure
/// (the ingest source is, from core's view, just another opaque backend).
impl From<IngestError> for nexus_core::CoreError {
    fn from(e: IngestError) -> Self {
        nexus_core::CoreError::Store(e.to_string())
    }
}

/// Result alias for puller operations.
pub type IngestResult<T> = core::result::Result<T, IngestError>;
