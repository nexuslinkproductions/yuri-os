---
skill: cgs-books
description: René's Swiss bookkeeping PWA for custom-gear.ch (PHP 8 + MariaDB, live at books.custom-gear.ch) — orientation context: paths + the nested-repo trap, the real subdomain deploy, no-local-PHP verdict, route/schema map, sw.js + migration + Alpine rules, secrets.
---

Invoke the `cgs-books` skill — load the cgs-books orientation context: where the app lives
(`C:\Users\rene\yuri-os\cgs-books`, its OWN git repo nested inside yuri-os), the REAL deploy
(`books.custom-gear.ch` subdomain via GitHub webhook → Plesk, NOT the README's `/books` symlink variant),
the edit-only verdict (no PHP or MariaDB on this box), the `api.php?r=` route + DB schema map, the three
deploy rules (bump `sw.js` VERSION · migrations need René's manual "Kontenplan einrichten" click · Alpine
`:disabled` is the recurring frontend bug class), and the never-touch secrets. Read
`.claude/skills/cgs-books/SKILL.md` and the deploy memory it points to
(`C:\Users\rene\.claude\projects\C--Users-rene-yuri-os-cgs-books\memory\cgs-books-deployment.md`) before
touching anything under `cgs-books/`.
