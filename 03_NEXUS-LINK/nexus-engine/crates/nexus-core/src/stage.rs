//! Pipeline stages and the legal transition table.
//!
//! A lead moves through the acquisition pipeline one stage at a time. The order is
//! linear with one loop: `Followup` can return to `Send` (a re-touch) instead of
//! always closing. Every other jump is illegal and rejected by [`StageId::advance`]
//! with [`CoreError::IllegalTransition`].

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};

/// A stage in the acquisition pipeline.
///
/// ```text
/// Capture → Score → Queue → Send → Throttle → Followup → Close
///                                   ▲             │
///                                   └─────────────┘  (Followup may re-Send)
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub enum StageId {
    /// Lead captured from a source; raw, unscored.
    Capture,
    /// Scored by the kernel (`p_reply`, `p_conv`, EVH).
    Score,
    /// Placed in the pursue-queue, awaiting send capacity.
    Queue,
    /// First touch sent.
    Send,
    /// Send rate gated by the queue governor.
    Throttle,
    /// In a follow-up cadence; may loop back to [`StageId::Send`].
    Followup,
    /// Terminal — won, lost, or abandoned.
    Close,
}

impl StageId {
    /// All stages in canonical pipeline order.
    pub const ALL: [StageId; 7] = [
        StageId::Capture,
        StageId::Score,
        StageId::Queue,
        StageId::Send,
        StageId::Throttle,
        StageId::Followup,
        StageId::Close,
    ];

    /// Whether a direct transition `self -> to` is legal.
    ///
    /// The table is deliberately tight: linear advance plus the single `Followup ->
    /// Send` re-touch loop, plus `Followup -> Close` and `Throttle -> Followup`. A
    /// stage is never a legal transition to itself (advancing must make progress).
    #[must_use]
    pub fn can_advance(self, to: StageId) -> bool {
        use StageId::{Capture, Close, Followup, Queue, Score, Send, Throttle};
        matches!(
            (self, to),
            (Capture, Score)
                | (Score, Queue)
                | (Queue, Send)
                | (Send, Throttle)
                | (Throttle, Followup)
                | (Followup, Send)
                | (Followup, Close)
        )
    }

    /// Checked advance: returns `to` if the transition is legal, else
    /// [`CoreError::IllegalTransition`].
    ///
    /// # Errors
    /// [`CoreError::IllegalTransition`] when [`StageId::can_advance`] is `false`.
    pub fn advance(self, to: StageId) -> CoreResult<StageId> {
        if self.can_advance(to) {
            Ok(to)
        } else {
            Err(CoreError::IllegalTransition { from: self, to })
        }
    }
}
