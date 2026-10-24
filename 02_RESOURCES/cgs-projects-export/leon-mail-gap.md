# LEON (Customer Service) — the mail gap

> **BUILT 24/10/2026** in the cockpit repo (`landed-cost-cogs`, commit "Front Desk: read-only IMAP mirror"):
> `cockpit/backend/mail_client.py` + `mail_store.py`, routes `/api/mail/*`, page **Front Desk** at
> `http://127.0.0.1:8000/frontdesk`, store `cockpit/data/mail.db`, credentials `backend/.mail_config.json`
> (René's hand). 36 offline regression checks in `mail_store.test.py`. Deviations from the spec below:
> `from_name` is kept beside the domain (needed to tell senders apart), `uid`/`uidvalidity` are stored
> for the incremental pull, and the answered mark also comes from Outlook's `\Answered` flag.
> 24/10/2026 later: credentials in, scheduled sync every 15 min ("CGS Front Desk Sync"), **Sent-folder mirror
> + local Ollama draft writer live** (`mail_draft.py`, qwen3:14b) — drafts appear beside each open mail; René
> pastes into Outlook. The "learning" is the example bank built from his own sent replies.

**State 24/10/2026.** The CUSTOMER SERVICE role has a working lane (`.claude/skills/cgs-frontdesk/SKILL.md`,
`/cgs-frontdesk`): order status, tracking, mold readiness, fitment scope, returns and discount policy all
come from real sources (cockpit endpoints, AGB v2, the discount programme). What it CANNOT do is see the
inbox. Today René pastes the mail; the lane answers. That is reactive, not a front desk.

## What exists (verified)

- Mailboxes `rene@`, `info@`, `sales@custom-gear.ch` are **IMAP on hosttech** (memory `cgs-mail-autoreply-plesk`).
  Read in Outlook desktop; webmail is Roundcube at `https://webmail.custom-gear.ch`; out-of-office is a
  Plesk autoresponder (server-side).
- No code in yuri-os or the cockpit speaks IMAP/SMTP/Outlook/Graph (grep over `_SYSTEM/Scripts`,
  `.claude/skills`, `landed-cost-cogs/cockpit/backend` — zero hits beyond unrelated words).
- Rule B (memory `rene-cgs-jeffrey-operating-profile`): customer names/addresses never leave the machine
  unmasked. Any inbox integration must therefore store and pre-process mail LOCALLY.

## The one integration to wire first

**A read-only IMAP pull of `info@` + `sales@` into a local SQLite store, exposed to the cockpit.**

- Python stdlib `imaplib` + `email` (the cockpit's dependency floor is fastapi+uvicorn only — no new
  package needed), credentials in a gitignored `.mail_config.json` next to `.woo_config.json`, same
  pattern as the Woo/Post/TWINT configs. Never in yuri-os.
- Store: `cockpit/data/mail.db` (gitignored like `cockpit.db`): message-id, date, from-domain (NOT the
  address), subject, body text, detected **order number** (regex on `#?\d{5,6}` + the Woo order format),
  classification (status / fitment / return / discount / other), `answered` flag.
- Endpoints (read-only): `GET /api/mail/inbox?unanswered=1` (subject, date, order nr, class — no body),
  `GET /api/mail/{id}` (body, for the UI only). No send endpoint — ever. René replies from Outlook.
- UI: a **Front Desk** tab in the cockpit listing unanswered mails joined to the order row (status,
  tracking, mold verdict) — the answer pack beside the question.
- Then the lane's "waiting-customer sweep" becomes real: unanswered > 48 h, orders waiting with no mail
  sent, pending-unpaid reminders.

Effort: one cockpit feature (backend module + tab), ~1 session. Owner gates: the mailbox password goes
into the cockpit config by René's hand; the Woo order ↔ mail match stays local.

## Not the integration

- An Outlook COM/Graph automation (Outlook is a client of the same IMAP boxes; Graph needs M365, which
  these mailboxes are not).
- Forwarding mail to a provider or an external inbox tool (Rule B violation).
- Another prompt-only "Leon" (what the claude.ai Project was).
