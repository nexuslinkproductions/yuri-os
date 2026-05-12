#!/usr/bin/env node

/**
 * Source-backed loader for the c2moviez cold-acquisition cockpit.
 *
 * CH: reads the public Zefix linked-data CSV mirror and then fetches each
 * company URI for the official purpose text.
 * AT: loads curated WKO public-record candidates for Vienna 1220/1160 and
 * checks the company website before enabling email outreach.
 */

const DEFAULT_API_ORIGIN = process.env.COLD_ACQ_API_ORIGIN || 'http://127.0.0.1:3014';
const DEFAULT_API_KEY = process.env.API_KEY || 'test-api-key-1234567890';
const ZEFIX_CSV_BASE = 'https://data-bs.ch/stata/zefix_handelsregister/all_cantons';
const TARGET_CH_CANTONS = ['ZH', 'ZG', 'VD', 'GE', 'BS', 'BE', 'TI', 'SG', 'LU', 'AG'];
const FIT_KEYWORDS = /\b(software|digital|cloud|media|marketing|tech|technology|solutions|consult|ai|data|bio|pharma|hotel|hospitality|fintech|web|studio|creative|systems|robot|analytics|video|film|social|labs|saas)\b/i;
const LEGAL_FORM_PATTERN = /(^|\b)(ag|gmbh)(\b|$)|aktiengesellschaft|soci[eé]t[eé] anonyme|societ[aà] anonima|gesellschaft mit beschr[aä]nkter haftung/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const WKO_RECORDS = [
  {
    name: 'A.S.E. EBNER & PARTNER GmbH',
    fn: 'FN 61266y',
    postal_code: '1220',
    city: 'Wien',
    legal_form: 'GmbH',
    date_of_entry: '1984-01-01',
    employee_count: 35,
    industry: 'ERP software and IT consulting',
    website: 'https://www.ase-edv.eu',
    linkedin_url: 'https://at.linkedin.com/company/ase-ebner-und-partner-gmbh',
    contact_email: 'office@ase-edv.eu',
    source_url: 'https://firmen.wko.at/ase-ebner---partner-gmbh-systemhaus-und-software-hersteller/wien/?firmaid=f3c9c53a-8dcc-4c7f-ac49-6d5db177590f',
    evidence_detail: 'WKO lists A.S.E. EBNER & PARTNER GmbH in 1220 Wien as a system house and software manufacturer with 35 employees and ERP software for service companies.'
  },
  {
    name: 'DBConcepts GmbH',
    fn: 'FN 200406s',
    postal_code: '1220',
    city: 'Wien',
    legal_form: 'GmbH',
    date_of_entry: '2000-01-01',
    employee_count: 10,
    industry: 'database infrastructure and IT consulting',
    website: 'https://www.dbconcepts.com',
    contact_email: 'office@dbconcepts.com',
    source_url: 'https://firmen.wko.at/dbconcepts-gmbh-oracle-datenbank--und-l%C3%B6sungsspezialist/wien/?firmaid=71596cc5-62da-4ec6-bb20-0baa91b5a846',
    evidence_detail: 'WKO lists DBConcepts GmbH in 1220 Wien as an Oracle database and solution specialist with IT services, development, administration, and managed service context.'
  },
  {
    name: 'Allplan Österreich GmbH',
    fn: 'FN 81450f',
    postal_code: '1220',
    city: 'Wien',
    legal_form: 'GmbH',
    date_of_entry: '1994-01-01',
    employee_count: 46,
    industry: 'architecture and construction software',
    website: 'https://www.allplan.com',
    contact_email: 'info.at@allplan.com',
    source_url: 'https://firmen.wko.at/allplan-%C3%96sterreich-gmbh/',
    evidence_detail: 'WKO lists Allplan Österreich GmbH at Donau-City-Straße 1, 1220 Wien with software solutions for architecture, planning, engineering, building services, and visualization.'
  },
  {
    name: 'SOS Software Service GmbH',
    fn: 'FN 88271k',
    postal_code: '1220',
    city: 'Wien',
    legal_form: 'GmbH',
    date_of_entry: '1990-01-01',
    employee_count: 5,
    industry: 'health care and pharma software service',
    website: 'https://www.sosgmbh.at',
    contact_email: 'info@sosgmbh.at',
    source_url: 'https://firmen.wko.at/sos-software-service-gmbh-sos-gmbh/wien/?firmaid=237c28e4-f674-491a-b95f-1ceac2b5786c',
    evidence_detail: 'WKO lists SOS Software Service GmbH in 1220 Wien with 5 employees and software/services for health care and the pharmaceutical industry.'
  },
  {
    name: 'Avenum Technologie GmbH',
    fn: 'FN 59280b',
    postal_code: '1220',
    city: 'Wien',
    legal_form: 'GmbH',
    date_of_entry: '1989-01-01',
    employee_count: 11,
    industry: 'EDI and e-business software',
    website: 'https://edi-service.partners',
    contact_email: 'office@avenum.com',
    source_url: 'https://firmen.wko.at/avenum-technologie-gmbh-technologie-gmbh/wien/?firmaid=8c964b7c-0859-4ef7-959d-5394fde1f337',
    evidence_detail: 'WKO lists Avenum Technologie GmbH in 1220 Wien with IT services and computer-systems trade permissions; the public imprint presents AVENUM as an EDI/e-business software specialist.'
  },
  {
    name: 'Cherry Embedded Solutions GmbH',
    fn: 'FN 286804x',
    postal_code: '1220',
    city: 'Wien',
    legal_form: 'GmbH',
    date_of_entry: '2006-01-01',
    employee_count: 30,
    industry: 'embedded systems and hardware/software engineering',
    website: 'https://embedded.cherry.de',
    contact_email: 'inquiries@theobroma-systems.com',
    source_url: 'https://firmen.wko.at/cherry-embedded-solutions-gmbh/wien/?firmaid=ebb9ce47-efb1-44c7-93df-65bc1651680b',
    evidence_detail: 'WKO lists Cherry Embedded Solutions GmbH in 1220 Wien with IT consulting, software development, e-government, e-health, hardware development, and B2B technology context.'
  },
  {
    name: 'Kurt Seidl Software Handelsgesellschaft m.b.H.',
    fn: 'FN 67631h',
    postal_code: '1220',
    city: 'Wien',
    legal_form: 'GmbH',
    date_of_entry: '1993-01-01',
    employee_count: 8,
    industry: 'software licensing and software commerce',
    website: 'https://www.seidl-software.com',
    contact_email: 'office@seidl-software.com',
    source_url: 'https://firmen.wko.at/kurt-seidl-software-handelsgesellschaft-mbh-seidl-software/wien/?firmaid=11aa1bae-a1e4-4609-830c-51de7142c962',
    evidence_detail: 'WKO lists Kurt Seidl Software Handelsgesellschaft m.b.H. in 1220 Wien as Seidl Software with 8 employees and software licensing/commerce positioning.'
  },
  {
    name: '2beWIRED GmbH',
    fn: 'FN 407935f',
    postal_code: '1220',
    city: 'Wien',
    legal_form: 'GmbH',
    date_of_entry: '2014-01-01',
    employee_count: 10,
    industry: 'business IT services and software consulting',
    website: 'https://www.2bewired.at',
    contact_email: 'office@2bewired.at',
    source_url: 'https://firmen.wko.at/softwarehandel/wien-22-bezirk-donaustadt',
    evidence_detail: 'WKO software-trade search lists 2beWIRED GmbH in 1220 Wien as “2beWIRED - Business IT Lösungen” with office@2bewired.at and a public website.'
  },
  {
    name: 'CodingBase GmbH',
    fn: 'FN 612445f',
    postal_code: '1160',
    city: 'Wien',
    legal_form: 'GmbH',
    date_of_entry: '2021-01-01',
    employee_count: 7,
    industry: 'individual software and web development',
    website: 'https://www.codingbase.at',
    contact_email: 'office@codingbase.at',
    source_url: 'https://firmen.wko.at/codingbase-gmbh-codingbase---individuelle-software--und-webentwicklung-wien/wien/?firmaid=c8b13eb2-415c-496c-b3c4-cc5bacc60048',
    evidence_detail: 'WKO lists CodingBase GmbH in 1160 Wien as an individual software and web-development company focused on tailored software solutions.'
  }
];

function readArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const [key, value] = raw.replace(/^--/, '').split('=');
    args[key] = value ?? 'true';
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'NUDIMMUD c2moviez cold-acquisition research loader (manual outreach support)'
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else if (char !== '\r') {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  const [headers = [], ...body] = rows;
  return body
    .filter((item) => item.length === headers.length)
    .map((item) => Object.fromEntries(headers.map((header, index) => [header, item[index] || ''])));
}

function unescapeTurtleString(value) {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\n/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDescription(turtle) {
  const match = turtle.match(/<http:\/\/schema\.org\/description>\s+"((?:\\"|[^"])*)"/);
  return match ? unescapeTurtleString(match[1]) : '';
}

function extractLegalName(turtle) {
  const match = turtle.match(/<http:\/\/schema\.org\/legalName>\s+"((?:\\"|[^"])*)"/);
  return match ? unescapeTurtleString(match[1]) : '';
}

function legalFormCode(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('aktiengesellschaft') || /\bag\b/.test(text)) return 'AG';
  if (text.includes('beschränkter haftung') || text.includes('beschraenkter haftung') || /\bgmbh\b/.test(text)) return 'GmbH';
  return value || '';
}

function inferIndustry(text) {
  const value = String(text || '').toLowerCase();
  if (/saas|software|web-applikation|web app|internet|network|cloud|data|analytics|datenbank|database|it-|informatik/.test(value)) return 'software / IT services';
  if (/film|video|media|studio|produktion|post-production|content|creative/.test(value)) return 'creative / media production';
  if (/marketing|social|werbung|kommunikation|agency|agentur/.test(value)) return 'marketing / communications';
  if (/bio|pharma|health|medical|medizin|life science/.test(value)) return 'biotech / healthtech';
  if (/fintech|finance|payment|zahlung|bank/.test(value)) return 'fintech / financial services';
  if (/hotel|hospitality|restaurant|tourism|gastronomie/.test(value)) return 'hospitality';
  return 'international services';
}

function sourceUrlFromRow(row) {
  return row.url_cantonal_register || row.company_uri;
}

async function collectSwissRecords(limit) {
  const candidates = [];
  const seen = new Set();

  for (const canton of TARGET_CH_CANTONS) {
    const csvUrl = `${ZEFIX_CSV_BASE}/companies_${canton}.csv`;
    const rows = parseCsv(await fetchText(csvUrl));
    for (const row of rows) {
      const name = row.company_legal_name || '';
      const legalForm = row.company_type_de || '';
      if (!LEGAL_FORM_PATTERN.test(legalForm)) continue;
      if (/\bin liquidation\b|en liquidation|in liquidazione/i.test(name)) continue;
      if (!FIT_KEYWORDS.test(name)) continue;
      const uid = row.company_uid || `${canton}:${name}`;
      if (seen.has(uid)) continue;
      seen.add(uid);
      candidates.push(row);
      if (candidates.length >= limit * 10) break;
    }
    if (candidates.length >= limit * 10) break;
  }

  const records = [];
  for (const row of candidates) {
    if (records.length >= limit) break;
    let purpose = '';
    try {
      purpose = extractDescription(await fetchText(row.company_uri, 12000));
      await sleep(75);
    } catch {
      purpose = '';
    }
    const evidenceText = `${row.company_legal_name || ''} ${purpose || ''}`;
    if (!FIT_KEYWORDS.test(evidenceText)) continue;

    records.push({
      name: extractLegalName(purpose) || row.company_legal_name,
      uid: row.company_uid,
      status: 'ACTIVE',
      legal_form: legalFormCode(row.company_type_de),
      canton: row.short_name_canton,
      city: row.locality,
      postal_code: row.plz,
      industry: inferIndustry(evidenceText),
      source_url: sourceUrlFromRow(row),
      purpose: purpose || `${row.company_legal_name} appears in the Zefix open-data feed as ${row.company_type_de} in ${row.locality}, ${row.short_name_canton}.`
    });
  }

  return records;
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function hasEnglishSignal(html, url) {
  const value = `${url}\n${html}`.toLowerCase();
  return /lang=["']en|hreflang=["']en|\/en[/?#"' ]|english|international|global|worldwide/.test(value);
}

function extractEmails(text) {
  return [...new Set((text.match(EMAIL_PATTERN) || []).map((email) => email.toLowerCase()))];
}

async function inspectWebsite(record) {
  const base = record.website.replace(/\/+$/, '');
  const paths = ['', '/en', '/contact', '/kontakt', '/impressum', '/imprint'];
  const domain = domainFromUrl(record.website);
  const pages = [];

  for (const path of paths) {
    try {
      const text = await fetchText(`${base}${path}`, 9000);
      pages.push({ path, text });
      if (pages.length >= 3) break;
    } catch {
      // Keep going; many small business sites only expose one of these paths.
    }
  }

  const combined = pages.map((page) => page.text).join('\n');
  const emails = extractEmails(combined);
  const targetEmail = String(record.contact_email || '').toLowerCase();
  const publishedEmail = Boolean(targetEmail && emails.includes(targetEmail))
    || emails.some((email) => email.endsWith(`@${domain}`));

  return {
    websiteHasEnglish: hasEnglishSignal(combined, record.website),
    publishedEmail,
    foundEmail: publishedEmail ? (emails.find((email) => email === targetEmail) || emails.find((email) => email.endsWith(`@${domain}`)) || targetEmail) : null,
    evidence: pages.length > 0
      ? `Company website fetched ${pages.map((page) => page.path || '/').join(', ')}; ${publishedEmail ? 'B2B email appears on-site' : 'no website-published B2B email confirmed'}.`
      : 'Company website fetch did not return an inspectable contact page during this run.'
  };
}

async function collectAustriaRecords(limit) {
  const records = [];
  for (const record of WKO_RECORDS.slice(0, limit)) {
    const website = await inspectWebsite(record);
    const email = website.foundEmail || record.contact_email || null;
    records.push({
      company: {
        name: record.name,
        country: 'AT',
        canton_or_bezirk: record.postal_code,
        postal_code: record.postal_code,
        city: record.city,
        uid_or_fn: record.fn,
        legal_form: record.legal_form,
        date_of_entry: record.date_of_entry,
        employee_count: record.employee_count,
        industry: record.industry,
        website: record.website,
        linkedin_url: record.linkedin_url || ''
      },
      contact: {
        name: '',
        title: 'Managing Director / Marketing owner',
        email,
        linkedin_url: ''
      },
      scoringSignals: {
        websiteHasEnglish: website.websiteHasEnglish,
        linkedinCompanyEnglish: Boolean(record.linkedin_url),
        decisionMakerEnglish: false,
        dotComTld: domainFromUrl(record.website).endsWith('.com'),
        internationalSignal: /international|\.com|österreich|austria|global/i.test(`${record.website} ${record.evidence_detail}`),
        highFitIndustry: true
      },
      evidence: [
        {
          kind: 'wko_directory',
          label: 'WKO public record',
          detail: record.evidence_detail,
          url: record.source_url
        },
        {
          kind: 'website_check',
          label: 'Website compliance check',
          detail: website.evidence,
          url: record.website
        }
      ],
      compliance: {
        source: 'wko',
        source_url: record.source_url,
        source_timestamp: new Date().toISOString(),
        legal_basis: website.publishedEmail ? 'website_published_email' : 'linkedin_platform'
      },
      notes: website.publishedEmail
        ? 'Real WKO-backed AT lead. Email allowed only because the company website published a matching B2B route.'
        : 'Real WKO-backed AT lead. Email stays blocked until Fanny confirms LinkedIn consent or a website-published B2B inquiry route.'
    });
  }
  return records;
}

async function postJson(apiOrigin, apiKey, path, body) {
  const response = await fetch(`${apiOrigin}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const apiOrigin = args.api || DEFAULT_API_ORIGIN;
  const apiKey = args.key || DEFAULT_API_KEY;
  const chLimit = Number(args['ch-limit'] || 50);
  const atLimit = Number(args['at-limit'] || WKO_RECORDS.length);

  const chRecords = await collectSwissRecords(chLimit);
  const atRecords = await collectAustriaRecords(atLimit);

  if (args['dry-run'] === 'true') {
    console.log(JSON.stringify({ chRecords, atRecords }, null, 2));
    return;
  }

  const chResult = await postJson(apiOrigin, apiKey, '/api/cold-acquisition/ingest/zefix-bulk', { records: chRecords });
  const atResults = [];
  for (const record of atRecords) {
    const created = await postJson(apiOrigin, apiKey, '/api/cold-acquisition/leads', record);
    atResults.push({ id: created.lead?.id, company: created.lead?.company?.name, score: created.lead?.scoring?.total_score, channel: created.lead?.channel });
  }
  const dashboard = await fetch(`${apiOrigin}/api/cold-acquisition/dashboard`, {
    headers: { 'x-api-key': apiKey }
  }).then((response) => response.json());

  console.log(JSON.stringify({
    ok: true,
    apiOrigin,
    zefix: chResult.result,
    austria: {
      created: atResults.length,
      leads: atResults
    },
    dashboard: dashboard.dashboard
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
