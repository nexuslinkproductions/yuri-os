---
date: "{{date}}"
client: ""
industry: ""
status: active
contact_name: ""
contact_email: ""
contact_phone: ""
source: referral
budget_tier: ""
project_type: ""
next_deadline: ""
open_tickets: 0
overdue_tickets: 0
tags:
  - client
---

# {{title}}

## Contact
- **Name:**
- **Email:**
- **Phone:**
- **Source:** Referral from:

## Projects
```dataview
TABLE status, type, file.mtime as "Last Updated"
FROM "03 - Projects"
WHERE client = this.client
SORT file.mtime DESC
```

## Meeting History
```dataview
TABLE date, summary
FROM "05 - Meetings"
WHERE client = this.client
SORT date DESC
```

## Invoices & Financials
> Tracked in ExeoFlow

## Notes

