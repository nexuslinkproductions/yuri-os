#!/usr/bin/env node

/**
 * Source-backed loader for PRISM Workbench.
 *
 * Dry-run first by default. It collects and prints source-backed records, but
 * imports nothing unless called with --apply=true.
 *
 * CH: reads the public Zefix linked-data CSV mirror and then fetches each
 * company URI for the official purpose text.
 * AT: loads live WKO Vienna directory records and checks the company website
 * before enabling email outreach.
 */

import { scrapeWkoVienna } from './cold-acquisition-wko-scraper.mjs';

const DEFAULT_API_ORIGIN = process.env.COLD_ACQ_API_ORIGIN || 'http://127.0.0.1:3014';
const DEFAULT_API_KEY = process.env.API_KEY || 'test-api-key-1234567890';
const ZEFIX_CSV_BASE = 'https://data-bs.ch/stata/zefix_handelsregister/all_cantons';
const TARGET_CH_CANTONS = ['ZH', 'ZG', 'VD', 'GE', 'BS', 'BE', 'TI', 'SG', 'LU', 'AG'];
const FIT_KEYWORDS = /\b(software|digital|cloud|media|marketing|tech|technology|solutions|consult|ai|data|bio|pharma|hotel|hospitality|fintech|web|studio|creative|systems|robot|analytics|video|film|social|labs|saas)\b/i;
const LEGAL_FORM_PATTERN = /(^|\b)(ag|gmbh)(\b|$)|aktiengesellschaft|soci[eé]t[eé] anonyme|societ[aà] anonima|gesellschaft mit beschr[aä]nkter haftung/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

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
        'user-agent': 'YURI cold-acquisition research loader (manual outreach support)'
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
  const match = turtle.match(/(?:<http:\/\/schema\.org\/description>|schema:description)\s+"((?:\\"|[^"])*)"/i);
  return match ? unescapeTurtleString(match[1]) : '';
}

function extractLegalName(turtle) {
  const match = turtle.match(/(?:<http:\/\/schema\.org\/legalName>|schema:legalName)\s+"((?:\\"|[^"])*)"/i);
  return match ? unescapeTurtleString(match[1]) : '';
}

function extractUrl(turtle) {
  const match = turtle.match(/(?:<http:\/\/schema\.org\/url>|schema:url)\s+(?:<([^>]+)>|"((?:\\"|[^"])*)")/i);
  return match ? unescapeTurtleString(match[1] || match[2] || '') : '';
}

function extractBoardMemberName(turtle) {
  const memberMatches = [...turtle.matchAll(/(?:<http:\/\/schema\.org\/member>|schema:member|zefix:member)\s+((?:<[^>]+>|_:[A-Za-z0-9_-]+|\[[\s\S]*?\]))/gi)];

  for (const match of memberMatches) {
    const token = String(match[1] || '').trim();
    if (!token) continue;

    if (token.startsWith('[')) {
      const inlineMatch = token.match(/(?:<http:\/\/schema\.org\/name>|schema:name|<http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label>|rdfs:label)\s+"((?:\\"|[^"])*)"/i);
      if (inlineMatch) {
        const name = unescapeTurtleString(inlineMatch[1]);
        if (name) return name;
      }
      continue;
    }

    const subject = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nodeMatch = turtle.match(new RegExp(`${subject}[\\s\\S]{0,2000}?(?:<http:\/\/schema\.org\/name>|schema:name|<http:\/\/www\.w3\.org\/2000\/01\/rdf-schema#label>|rdfs:label)\\s+"((?:\\\\.|[^"])*)"`, 'i'));
    if (nodeMatch) {
      const name = unescapeTurtleString(nodeMatch[1]);
      if (name) return name;
    }
  }

  return '';
}

function stripHtmlTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function normalizeHtmlText(text) {
  return decodeHtmlEntities(String(text || '').replace(/\s+/g, ' ').trim());
}

function truncateText(text, maxLength) {
  const value = normalizeHtmlText(text);
  return value.length > maxLength ? value.slice(0, maxLength).trim() : value;
}

function extractTagText(html, tagName) {
  const matches = [...String(html || '').matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi'))];
  return matches
    .map((match) => normalizeHtmlText(stripHtmlTags(match[1])))
    .filter(Boolean);
}

function extractMetaDescription(html) {
  const patterns = [
    /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i
  ];
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match?.[1]) return normalizeHtmlText(match[1]);
  }
  return '';
}

function looksLikePersonName(text) {
  const value = normalizeHtmlText(text);
  if (!value || /\d/.test(value)) return false;
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length !== 2) return false;
  return parts.every((part) => /^[\p{Lu}][\p{L}'’.-]*$/u.test(part));
}

function appendUniqueEvidence(evidence, item) {
  if (!item || !item.kind) return;
  if (evidence.some((entry) => entry.kind === item.kind)) return;
  evidence.push(item);
}

function mergeEvidence(existingEvidence, additions) {
  const merged = [...(existingEvidence || [])];
  for (const item of additions || []) {
    appendUniqueEvidence(merged, item);
  }
  return merged;
}

function isBlockedCrawlPath(path) {
  return /(?:^|\/)(?:wp-admin|admin|login)(?:\/|$)/i.test(path);
}

async function fetchFirstPage(baseUrl, paths) {
  for (const path of paths) {
    if (!path || isBlockedCrawlPath(path)) continue;
    try {
      const html = await fetchText(new URL(path, baseUrl).toString(), 6000);
      return { path, html };
    } catch {
      // Move to the next candidate path.
    }
  }
  return null;
}

async function fetchSparqlJson(query) {
  const response = await fetch('https://ld.admin.ch/query', {
    method: 'POST',
    headers: {
      accept: 'application/sparql-results+json',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    body: new URLSearchParams({ query })
  });

  if (!response.ok) {
    throw new Error(`SPARQL ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function sparqlValue(binding, key) {
  return String(binding?.[key]?.value || '').trim();
}

async function collectSwissGraphFallback() {
  try {
    const query = `PREFIX schema: <http://schema.org/>\nPREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\nSELECT ?company ?name ?url ?contactName WHERE {\n  ?company a <https://schema.ld.admin.ch/ZefixOrganisation> ;\n           schema:name ?name ;\n           schema:url ?url ;\n           schema:member ?member .\n  OPTIONAL { ?member schema:name ?memberName }\n  OPTIONAL { ?member rdfs:label ?memberLabel }\n  BIND(COALESCE(?memberName, ?memberLabel, ?name) AS ?contactName)\n} LIMIT 1`;
    const json = await fetchSparqlJson(query);
    const row = json?.results?.bindings?.[0];
    if (!row) return null;

    const companyUrl = sparqlValue(row, 'company');
    const companyName = sparqlValue(row, 'name');
    const website = sparqlValue(row, 'url');
    const contactName = sparqlValue(row, 'contactName') || companyName;
    const contactTitle = 'Board member (Zefix)';
    if (!companyUrl || !companyName || !website) return null;

    const record = {
      name: companyName,
      uid: companyUrl.split('/').pop() || '',
      status: 'ACTIVE',
      legal_form: legalFormCode(companyName),
      canton: '',
      city: '',
      postal_code: '',
      industry: inferIndustry(`${companyName} ${website}`),
      source_url: companyUrl,
      website,
      contact: {
        name: contactName,
        title: contactTitle,
        email: '',
        linkedin_url: ''
      },
      contact_name: contactName,
      contact_title: contactTitle,
      contact_email: '',
      contact_linkedin_url: '',
      evidence: [
        {
          kind: 'zefix_bulk',
          label: 'Zefix open-data record',
          detail: `${companyName} appears in the Zefix linked-data graph with a public website and member linkage.`,
          url: companyUrl
        },
        {
          kind: 'zefix_purpose',
          label: 'Company purpose',
          detail: `${companyName} appears in the Zefix linked-data graph with a public website and member linkage.`,
          url: companyUrl
        }
      ],
      purpose: `${companyName} appears in the Zefix linked-data graph with a public website and member linkage.`
    };

    const deepEvidence = await deepCrawlWebsite(record.website);
    if (deepEvidence.contactName && !record.contact.name) {
      record.contact.name = deepEvidence.contactName;
      record.contact.title = record.contact.title || 'Team page contact';
      record.contact_name = deepEvidence.contactName;
      record.contact_title = record.contact.title;
    }
    record.evidence = mergeEvidence(record.evidence, deepEvidence);
    await sleep(150);
    return record;
  } catch {
    return null;
  }
}

async function deepCrawlWebsite(url) {
  const evidence = [];
  evidence.contactName = '';

  try {
    if (!url) return evidence;

    const parsed = new URL(url);
    const origin = `${parsed.protocol}//${parsed.host}`;
    const blockedPath = parsed.pathname || '';
    if (isBlockedCrawlPath(blockedPath)) return evidence;

    const homepage = await fetchFirstPage(origin, ['/']);
    if (homepage?.html) {
      const metaDescription = extractMetaDescription(homepage.html);
      const h1Text = extractTagText(homepage.html, 'h1')[0] || '';
      const aboutText = metaDescription || h1Text;
      if (aboutText) {
        appendUniqueEvidence(evidence, {
          kind: 'website_about',
          label: 'Company description',
          detail: truncateText(aboutText, 200),
          url: `${origin}/`
        });
      }

      const techSignals = [
        ['shopify', 'Shopify'],
        ['woocommerce', 'WooCommerce'],
        ['react', 'React'],
        ['next.js', 'Next.js'],
        ['webflow', 'Webflow'],
        ['hubspot', 'HubSpot'],
        ['salesforce', 'Salesforce'],
        ['sap', 'SAP']
      ].filter(([needle]) => homepage.html.toLowerCase().includes(needle));

      if (techSignals.length > 0) {
        const techList = techSignals.map(([, label]) => label).join(', ');
        appendUniqueEvidence(evidence, {
          kind: 'website_tech_signal',
          label: 'Technology signal',
          detail: `Uses ${techList}`,
          url: `${origin}/`
        });
      }
    }

    const aboutPage = await fetchFirstPage(origin, ['/about', '/ueber-uns', '/en/about', '/services', '/leistungen']);
    if (aboutPage?.html) {
      const aboutParagraph = extractTagText(aboutPage.html, 'p').find((text) => text.length >= 40) || '';
      if (aboutParagraph) {
        appendUniqueEvidence(evidence, {
          kind: 'website_about_page',
          label: 'About page',
          detail: truncateText(aboutParagraph, 200),
          url: new URL(aboutPage.path, origin).toString()
        });
      }
    }

    const teamPage = await fetchFirstPage(origin, ['/team']);
    if (teamPage?.html) {
      const teamCandidates = [...teamPage.html.matchAll(/<(h2|h3|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
        .map((match) => normalizeHtmlText(stripHtmlTags(match[2])))
        .filter(looksLikePersonName);
      const teamName = teamCandidates[0] || '';
      if (teamName) {
        evidence.contactName = teamName;
        appendUniqueEvidence(evidence, {
          kind: 'website_team',
          label: 'Team page contact',
          detail: `${teamName} (from /team page)`,
          url: new URL(teamPage.path, origin).toString()
        });
      }
    }

    const newsPage = await fetchFirstPage(origin, ['/blog', '/news']);
    if (newsPage?.html) {
      const articleTitle = extractTagText(newsPage.html, 'article')[0]
        || extractTagText(newsPage.html, 'h2')[0]
        || '';
      if (articleTitle) {
        appendUniqueEvidence(evidence, {
          kind: 'website_news',
          label: 'Recent post',
          detail: truncateText(articleTitle, 100),
          url: new URL(newsPage.path, origin).toString()
        });
      }
    }
  } catch {
    return [];
  }

  return evidence;
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
    let rdf = '';
    let purpose = '';
    try {
      rdf = await fetchText(row.company_uri, 12000);
      purpose = extractDescription(rdf);
      await sleep(75);
    } catch {
      purpose = '';
    }
    const evidenceText = `${row.company_legal_name || ''} ${purpose || ''}`;
    if (!FIT_KEYWORDS.test(evidenceText)) continue;

    const boardMemberName = extractBoardMemberName(rdf);
    const websiteUrl = extractUrl(rdf) || '';
    const record = {
      name: extractLegalName(rdf) || row.company_legal_name,
      uid: row.company_uid,
      status: 'ACTIVE',
      legal_form: legalFormCode(row.company_type_de),
      canton: row.short_name_canton,
      city: row.locality,
      postal_code: row.plz,
      industry: inferIndustry(evidenceText),
      source_url: sourceUrlFromRow(row),
      website: websiteUrl,
      contact: {
        name: boardMemberName || '',
        title: boardMemberName ? 'Board member (Zefix)' : '',
        email: '',
        linkedin_url: ''
      },
      contact_name: boardMemberName || '',
      contact_title: boardMemberName ? 'Board member (Zefix)' : '',
      contact_email: '',
      contact_linkedin_url: '',
      evidence: [
        {
          kind: 'zefix_bulk',
          label: 'Zefix open-data record',
          detail: purpose || `${row.company_legal_name} is an active ${row.company_type_de || 'Swiss company'} in ${row.locality}, ${row.short_name_canton}.`,
          url: sourceUrlFromRow(row)
        }
      ],
      purpose: purpose || `${row.company_legal_name} appears in the Zefix open-data feed as ${row.company_type_de} in ${row.locality}, ${row.short_name_canton}.`
    };

    if (purpose) {
      appendUniqueEvidence(record.evidence, {
        kind: 'zefix_purpose',
        label: 'Company purpose',
        detail: purpose,
        url: row.company_uri
      });
    }

    const deepEvidence = await deepCrawlWebsite(record.website);
    if (deepEvidence.contactName && !record.contact.name) {
      record.contact.name = deepEvidence.contactName;
      if (!record.contact.title) record.contact.title = 'Team page contact';
      record.contact_name = deepEvidence.contactName;
      record.contact_title = record.contact.title;
    }
    record.evidence = mergeEvidence(record.evidence, deepEvidence);
    records.push(record);
    await sleep(150);
  }

  if (!records.some((record) => record.contact?.name)) {
    const fallback = await collectSwissGraphFallback();
    if (fallback) {
      if (records.length >= limit) {
        records[records.length - 1] = fallback;
      } else {
        records.push(fallback);
      }
    }
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
  if (!record.website) {
    return {
      websiteHasEnglish: false,
      publishedEmail: false,
      foundEmail: null,
      evidence: 'Company website was not provided during this run.'
    };
  }

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
  const sourceRecords = await scrapeWkoVienna(limit);
  const records = [];

  for (const record of sourceRecords.slice(0, limit)) {
    const website = await inspectWebsite(record);
    const email = website.foundEmail || record.contact_email || null;
    const output = {
      company: {
        name: record.name,
        country: 'AT',
        canton_or_bezirk: record.bezirk || record.postal_code,
        postal_code: record.postal_code,
        city: record.city,
        uid_or_fn: record.fn,
        legal_form: record.legal_form,
        date_of_entry: record.date_of_entry,
        employee_count: record.employee_count,
        industry: record.industry,
        website: record.website || '',
        linkedin_url: record.linkedin_url || ''
      },
      contact: {
        name: record.contact_name || '',
        title: record.contact_title || 'Managing Director / Marketing owner',
        email,
        linkedin_url: record.contact_linkedin_url || ''
      },
      scoringSignals: {
        websiteHasEnglish: website.websiteHasEnglish,
        linkedinCompanyEnglish: Boolean(record.linkedin_url),
        decisionMakerEnglish: Boolean(record.contact_name || record.contact_linkedin_url),
        dotComTld: domainFromUrl(record.website || '').endsWith('.com'),
        internationalSignal: /international|\.com|österreich|austria|global/i.test(`${record.website || ''} ${record.evidence_detail || ''}`),
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
          url: record.website || undefined
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
    };

    const deepEvidence = record.website ? await deepCrawlWebsite(record.website) : [];
    if (deepEvidence.contactName && !output.contact.name) {
      output.contact.name = deepEvidence.contactName;
      output.contact.title = output.contact.title || 'Team page contact';
    }
    output.evidence = mergeEvidence(output.evidence, deepEvidence);
    records.push(output);
    await sleep(150);
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

async function getJson(apiOrigin, apiKey, path) {
  const response = await fetch(`${apiOrigin}${path}`, {
    headers: { 'x-api-key': apiKey }
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

function compactName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function addLeadKeys(keys, lead) {
  const company = lead.company || {};
  const contact = lead.contact || {};
  const uid = company.uid_or_fn || '';
  const domain = domainFromUrl(company.website || '') || String(contact.email || '').split('@')[1] || '';
  const name = compactName(company.name);
  if (uid) keys.add(`uid:${uid.toLowerCase()}`);
  if (domain) keys.add(`domain:${domain.toLowerCase()}`);
  if (name) keys.add(`name:${company.country || ''}:${name}`);
}

function sourceRecordKeys(record) {
  const company = record.company || {};
  const contact = record.contact || {};
  const country = company.country || (record.uid ? 'CH' : '');
  const uid = record.uid || company.uid_or_fn || '';
  const domain = domainFromUrl(record.website || company.website || '') || String(record.contact_email || contact.email || '').split('@')[1] || '';
  const name = compactName(record.name || company.name);
  return [
    uid ? `uid:${uid.toLowerCase()}` : '',
    domain ? `domain:${domain.toLowerCase()}` : '',
    name ? `name:${country}:${name}` : ''
  ].filter(Boolean);
}

function skipExisting(records, existingKeys) {
  const kept = [];
  const skipped = [];
  const seenThisRun = new Set();
  for (const record of records) {
    const keys = sourceRecordKeys(record);
    const duplicate = keys.some((key) => existingKeys.has(key) || seenThisRun.has(key));
    if (duplicate) {
      skipped.push(record);
      continue;
    }
    kept.push(record);
    keys.forEach((key) => seenThisRun.add(key));
  }
  return { kept, skipped };
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const apiOrigin = args.api || DEFAULT_API_ORIGIN;
  const apiKey = args.key || DEFAULT_API_KEY;
  const chLimit = Number(args['ch-limit'] || 50);
  const atLimitValue = Number(args['at-limit']);
  const atLimit = Number.isFinite(atLimitValue) ? atLimitValue : 9;

  const chRecords = await collectSwissRecords(chLimit);
  const atRecords = await collectAustriaRecords(atLimit);

  const apply = args.apply === 'true';
  if (!apply) {
    console.log(JSON.stringify({
      mode: 'dry_run',
      apply_hint: 'Re-run with --apply=true to import these source-backed records.',
      apiOrigin,
      counts: {
        ch: chRecords.length,
        at: atRecords.length
      },
      chRecords,
      atRecords
    }, null, 2));
    return;
  }

  const existing = await getJson(apiOrigin, apiKey, '/api/cold-acquisition/leads');
  const existingKeys = new Set();
  for (const lead of existing.leads || []) addLeadKeys(existingKeys, lead);

  const chFiltered = skipExisting(chRecords, existingKeys);
  const atFiltered = skipExisting(atRecords, existingKeys);

  const chResult = await postJson(apiOrigin, apiKey, '/api/cold-acquisition/ingest/zefix-bulk', { records: chFiltered.kept });
  const atResults = [];
  for (const record of atFiltered.kept) {
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
    skipped_existing: {
      ch: chFiltered.skipped.length,
      at: atFiltered.skipped.length
    },
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
