# Trading Bot — Phase 1: Accounts & Credentials

**Status:** Ready to Configure  
**Date:** 2026-05-05  
**Venue:** Coinbase Advanced Trade API

---

## Credential Setup

### Coinbase (Primary)

**Account Type:** Coinbase Advanced Trade (formerly Coinbase Pro)

**Steps:**
1. Create account at coinbase.com
2. Enable 2FA (required)
3. Generate API key:
   - Permissions: `trade`, `view`
   - Restrict to sandbox if available
   - Copy: Key ID, Secret, Passphrase
4. Store in environment variables (never in git):
   ```bash
   export COINBASE_API_KEY="<key-id>"
   export COINBASE_API_SECRET="<secret>"
   export COINBASE_API_PASSPHRASE="<passphrase>"
   export COINBASE_API_SANDBOX="true"  # Use sandbox mode for v1
   ```

**Verification:**
```bash
# Test connectivity
node Scripts/trading-bot/verify-coinbase-auth.mjs
```

---

## Secret Management

**Policy:**
- Never commit credentials to git
- Use `.env.local` (git-ignored)
- Or source from OS environment variables
- Separate credentials for sandbox and live
- Rotate credentials quarterly

**Sandbox vs. Live:**
| Environment | Account | API Key Prefix | Max Position | Notes |
|-----------|---------|----------------|-------------|-------|
| Sandbox | cb-sandbox-* | (test keys) | $100 | Paper trading, no real funds |
| Live | cb-prod-* | (prod keys) | As per policy | Real capital, kills-witch armed |

---

## API Connectivity Test

Verify the bot can:
- ✅ Authenticate with Coinbase
- ✅ Fetch market data (GET /products)
- ✅ Fetch account balances (GET /accounts)
- ✅ List available trading pairs

**Test script:** `Scripts/trading-bot/check-api-health.mjs`

---

## Next Phase

→ **Phase 2: Data Ingestion & Scanner**

Build market discovery connector, normalized schema, and deterministic scanner filters.
