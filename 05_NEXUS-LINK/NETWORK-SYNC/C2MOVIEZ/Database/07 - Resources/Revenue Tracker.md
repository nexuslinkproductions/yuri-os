---
tags:
  - resource
  - revenue
  - finance
---

# Revenue Tracker

> [!cti] Live revenue overview — all data pulls from client note frontmatter. Edit values in client notes, not here.
> **MRR Goal: 20–40k CHF/mo in 12 months**

---

## 📊 Key Metrics

```dataviewjs
const all = dv.pages('"02 - Clients"').where(p => p.tags && p.tags.includes("client"));

const mrr = all
  .where(p => p.monthly_revenue > 0 && p.revenue_status === "active")
  .values.reduce((s, p) => s + (p.monthly_revenue || 0), 0);

const pipeline = all
  .where(p => p.pipeline_value > 0 && ["pre-sales", "offer-sent", "lead", "pre-contract"].includes(p.revenue_status))
  .values.reduce((s, p) => s + (p.pipeline_value || 0), 0);

const activeCount = all.where(p => p.revenue_status === "active").length;
const pipelineCount = all.where(p => ["pre-sales", "offer-sent", "lead", "pre-contract"].includes(p.revenue_status)).length;

const today = new Date();
const invoicesDue = all.values.filter(p => {
  if (!p.next_invoice) return false;
  const d = new Date(p.next_invoice.toString());
  return d <= today;
});

dv.table(
  ["Metric", "Value", "Target (12mo)"],
  [
    ["💰 Confirmed MRR", `**${mrr.toLocaleString("de-CH")} CHF/mo**`, "20'000–40'000 CHF/mo"],
    ["📈 Pipeline (monthly potential)", `${pipeline.toLocaleString("de-CH")} CHF/mo`, "—"],
    ["✅ Active Clients", activeCount, "20–25"],
    ["🔄 Pipeline Clients", pipelineCount, "—"],
    ["🔔 Invoices Due / Overdue", invoicesDue.length > 0 ? `⚠️ ${invoicesDue.length} invoice(s)` : "✅ All clear", "—"],
  ]
);
```

---

## 💰 Active MRR — Confirmed Revenue

```dataview
TABLE
  billing_type AS "Billing",
  monthly_revenue AS "CHF/mo",
  payment_terms AS "Payment",
  last_invoiced AS "Last Invoice",
  next_invoice AS "Next Invoice",
  invoice_cadence AS "Cadence"
FROM "02 - Clients"
WHERE contains(tags, "client") AND monthly_revenue > 0 AND revenue_status = "active"
SORT monthly_revenue DESC
```

**MRR Total:**
```dataviewjs
const clients = dv.pages('"02 - Clients"')
  .where(p => p.tags && p.tags.includes("client") && p.monthly_revenue > 0 && p.revenue_status === "active");
const total = clients.values.reduce((sum, p) => sum + (p.monthly_revenue || 0), 0);
dv.paragraph(`### → ${total.toLocaleString("de-CH")} CHF/mo confirmed`);
```

---

## 🔔 Invoices Due or Overdue

```dataviewjs
const all = dv.pages('"02 - Clients"').where(p => p.tags && p.tags.includes("client"));
const today = new Date();

const due = all.values.filter(p => {
  if (!p.next_invoice) return false;
  const d = new Date(p.next_invoice.toString());
  return d <= today;
}).sort((a, b) => new Date(a.next_invoice.toString()) - new Date(b.next_invoice.toString()));

if (due.length === 0) {
  dv.paragraph("✅ No invoices due right now.");
} else {
  dv.table(
    ["Client", "Monthly CHF", "Next Invoice", "Last Invoiced", "Payment Terms"],
    due.map(p => [
      p.file.link,
      p.monthly_revenue || "—",
      p.next_invoice || "—",
      p.last_invoiced || "⚠️ never",
      p.payment_terms || "—"
    ])
  );
}
```

---

## 📈 Pipeline — Potential Revenue

```dataview
TABLE
  billing_type AS "Billing",
  pipeline_value AS "Potential CHF/mo",
  revenue_status AS "Stage",
  payment_terms AS "Payment"
FROM "02 - Clients"
WHERE contains(tags, "client") AND pipeline_value > 0 AND (revenue_status = "pre-sales" OR revenue_status = "offer-sent" OR revenue_status = "lead" OR revenue_status = "pre-contract")
SORT pipeline_value DESC
```

**Pipeline Total (monthly potential):**
```dataviewjs
const clients = dv.pages('"02 - Clients"')
  .where(p => p.tags && p.tags.includes("client") && p.pipeline_value > 0 && ["pre-sales", "offer-sent", "lead", "pre-contract"].includes(p.revenue_status));
const total = clients.values.reduce((sum, p) => sum + (p.pipeline_value || 0), 0);
dv.paragraph(`### → ${total.toLocaleString("de-CH")} CHF/mo potential if all close`);
```

---

## 🗓 Contract Overview

```dataview
TABLE
  billing_type AS "Billing",
  revenue_status AS "Status",
  contract_start AS "Start",
  contract_end AS "End",
  invoice_cadence AS "Cadence"
FROM "02 - Clients"
WHERE contains(tags, "client") AND revenue_status = "active"
SORT contract_start ASC
```

---

## 📋 All Clients — Full Overview

```dataview
TABLE
  billing_type AS "Billing",
  revenue_status AS "Status",
  monthly_revenue AS "MRR",
  pipeline_value AS "Pipeline",
  next_invoice AS "Next Invoice"
FROM "02 - Clients"
WHERE contains(tags, "client")
SORT monthly_revenue DESC, pipeline_value DESC
```

---

## 🚀 Growth Levers

1. **Close pipeline** — SLT (4.5k) + GANZ (5k) + BBA (3.5k) + BAL (3.5k) = +16.5k/mo potential
2. **MFB Vienna expansion** — additional praxis contract, variable support costs TBD
3. **UPG marketing meeting** — new PMO, 4k/mo pipeline
4. **SHI → yearly contract** — convert active 3-mo campaign to yearly
5. **Marcel (Vienna)** — new Austrian clients
6. **ExeoFlow** — better invoicing = less payment chasing, faster cash flow

---

## ⚠️ Known Issues

- Several active clients last invoiced in **2025** — CHI, KAP, UPG, PDRT need immediate invoicing
- **GRYD** — active partnership, 0 revenue tracked (intentional?)
- **MFB** payment sometimes late — watch cash flow April
- Migrating invoicing from Bexio → **ExeoFlow by end April 2026**

---

## Links

- [[07 - Resources/Service Catalog|Service Catalog]] — all rates
- [[07 - Resources/Offering Packages|Offering Packages]] — package pricing
- [[06 - Processes/Sales Process|Sales Process]] — pipeline management
- [[03 - Projects/ExeoFlow|ExeoFlow]] — future invoicing solution
