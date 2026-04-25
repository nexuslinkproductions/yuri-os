import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../../data/nudimmud.db');
const db = new Database(DB_PATH);

const tickets = [
  {"id": "C2M-32", "title": "EXEO Dashboard Feature (Q2-2026) — Full Outlook 365 calendar pull, visual display + week planner integration + push tickets to team calendars", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-31", "title": "EXEO Dashboard UX (Q2-2026) — Rename Kanban to Work Items, large-caps section titles, grouped sub-items, better overview design", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-30", "title": "EXEO Dashboard Bug (Q2-2026) — MRR KPI not showing (displays dash) + fix Plane.so links on all ticket identifiers", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-29", "title": "EXEO Dashboard Bug (Q2-2026) — Fix state rendering + entity_state text visible in Tickets/Clients sections", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-156", "title": "ASSI — Visual Identity New Store Schaffhausen (Q2-2026)", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-155", "title": "ASSI — Full Master Plan + Process Automation Guide (Q2-2026)", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-154", "title": "ASSI — Full SEO Audit + Website Data Extract assia.ch (Q2-2026)", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-153", "title": "ASSI — Framer Landing Page Example — High-End Design (Q2-2026)", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-152", "title": "ASSI — Meeting Negjded Llabjanaj @ ASSIA Neuhausen, 13:30 (Q2-2026)", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-151", "title": "SHI — Process Document: Customer Journey & Sales Flow (Q2-2026)", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-150", "title": "SHI — Sales Funnel Setup: app.register.ch Registration Flow (Q2-2026)", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-149", "title": "SHI — Meeting Luca Enderli @ SHIPSTER Zürich (Q2-2026)", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-117", "title": "BOV - Content Creation Zürcherstrasse - 3 TREES", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-25", "title": "FPV drone insurance case", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-115", "title": "CASA - modification", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-114", "title": "ALPEAHOMES Video Ground/Air Aufnahmen", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-17", "title": "Invoice KS-Sport for 8 MACL Bodysuits", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-39", "title": "Dashboard MFB TEAMS", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-16", "title": "Understanding Understanding (Voice Note Review)", "status": "TODO", "priority": "URGENT"},
  {"id": "C2M-111", "title": "CHI-3Month-Campaign", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-110", "title": "ALPHAVIVO AG - Multi-Service Website Development", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-36", "title": "April posts", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-13", "title": "MACL GmbH Registration — Switzerland", "status": "TODO", "priority": "URGENT"},
  {"id": "C2M-109", "title": "Shipster - access to accounts", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-23", "title": "LinkedIn Posting Strategy -- activate LinkedIn for c2moviez content", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-22", "title": "IT employee - Noah Lendi", "status": "TODO", "priority": "LOW"},
  {"id": "C2M-21", "title": "SIGNETTA - signing platform", "status": "TODO", "priority": "LOW"},
  {"id": "C2M-10", "title": "additional link for MACL - SHOPIFY for mybodyspace", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-9", "title": "Contract desanka_jovic", "status": "TODO", "priority": "LOW"},
  {"id": "C2M-8", "title": "MACL Shopify Setup redesign", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-7", "title": "MACL Business Commerce Manager", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-103", "title": "SHI - Information needed", "status": "TODO", "priority": "URGENT"},
  {"id": "C2M-35", "title": "Post topic calendar", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-20", "title": "hostpoint @nexuslinkproductions.com", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-86", "title": "GANZ BOATS — Boutique Boat Building Content Series", "status": "TODO", "priority": "HIGH"},
  {"id": "C2M-85", "title": "ALP - IT - onsite / remote support", "status": "TODO", "priority": "MEDIUM"},
  {"id": "C2M-84", "title": "SHI - 3-month campaign APRIL - JUNE", "status": "TODO", "priority": "HIGH"}
];

db.transaction(() => {
    const insertTicket = db.prepare(`
        INSERT OR REPLACE INTO tickets (external_id, title, status, priority, assigned_to)
        VALUES (?, ?, ?, ?, ?)
    `);

    for (const t of tickets) {
        insertTicket.run(t.id, t.title, t.status, t.priority, 'CLAUDIO');
    }
})();

console.log(`⬡ PLANE_SO_IMPORT_COMPLETE :: ${tickets.length} tickets synced.`);
