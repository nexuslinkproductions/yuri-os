# PRISM Environment Checklist

Use this file to discover the environment shape for PRISM v1 without leaking real secrets into the handoff.

## Discover Env Vars

Start by scanning the codebase for environment usage:

```bash
grep -rE "process\\.env\\.[A-Z_]+" backend/services/ backend/routes/ frontend/ scripts/
```

That search is the quickest way to see which variables are actually referenced.

## Known Categories Claudio Will Need

Use placeholders only. Set real values in Claudio's own local environment.

### Database

- `DATABASE_URL` - sqlite path or equivalent local database connection string

### Email Send

- SMTP credentials for outbound mail
- IMAP credentials for reply detection

Do not share real mailbox secrets in this handoff.

### Source APIs

- WKO scraper settings
- LinkedIn scraping limits or access controls

These are source-specific operational values, not shared data.

### LLM Lane

- `OPENAI_API_KEY`
- `DEEPSEEK_API_KEY`

Use whichever lane is available for draft generation and analysis.

### PRISM Feature Flags

- Any PRISM flags already surfaced in `service.ts`
- Any server-side switches that gate send, compliance, or draft behavior

If a flag exists in code, document it in the bundle before changing behavior.

## Sample `.env.template`

```env
# PRISM local environment template

DATABASE_URL=sqlite:./data/prism.sqlite

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

IMAP_HOST=
IMAP_PORT=
IMAP_USER=
IMAP_PASS=

OPENAI_API_KEY=
DEEPSEEK_API_KEY=

WKO_API_BASE_URL=
WKO_API_KEY=

LINKEDIN_SCRAPE_MODE=manual
LINKEDIN_RATE_LIMIT=

PRISM_FEATURE_FLAGS=
```

## Compliance Notes

- Do not put real PII in env files.
- Do not put contact lists in env files.
- Do not put signed contracts in env files.
- Do not put customer exports, raw source dumps, or private evidence blobs in env files.
- Keep secrets local to Claudio's environment and out of the handoff bundle.

## Practical Rule

If a value is operational but not secret, keep it in a template.

If it is secret, keep it out of the handoff and into Claudio's own environment manager.

