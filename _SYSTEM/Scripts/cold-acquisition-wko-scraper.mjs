#!/usr/bin/env node

const WKO_USER_AGENT = 'YURI cold-acquisition WKO scraper';
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PROFILE_CHALLENGE_PATTERN = /Einen Moment bitte/i;
const WKO_SOURCES = [
  {
    url: 'https://firmen.wko.at/Web/SearchCompany.aspx?searchtyp=firma&searchValue=&sparte=IT&bundesland=Wien&bezirk=',
    industry: 'software / IT services'
  },
  {
    url: 'https://firmen.wko.at/Web/SearchCompany.aspx?searchtyp=firma&searchValue=&sparte=Werbung&bundesland=Wien&bezirk=',
    industry: 'media / advertising'
  },
  {
    url: 'https://firmen.wko.at/Web/SearchCompany.aspx?searchtyp=firma&searchValue=&sparte=Medien&bundesland=Wien&bezirk=',
    industry: 'media / advertising'
  },
  {
    url: 'https://firmen.wko.at/?searchtyp=firma&q=software&bundesland=Wien',
    industry: 'software / IT services'
  },
  {
    url: 'https://firmen.wko.at/?searchtyp=firma&q=IT+Dienstleistung&bundesland=Wien',
    industry: 'software / IT services'
  },
  {
    url: 'https://firmen.wko.at/it/wien/',
    industry: 'software / IT services'
  },
  {
    url: 'https://firmen.wko.at/software/wien/',
    industry: 'software / IT services'
  },
  {
    url: 'https://firmen.wko.at/werbung/wien/',
    industry: 'media / advertising'
  },
  {
    url: 'https://firmen.wko.at/medien/wien/',
    industry: 'media / advertising'
  }
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function stripHtmlTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeText(text) {
  return decodeHtmlEntities(String(text || '').replace(/\s+/g, ' ').trim());
}

function truncateText(text, maxLength) {
  const value = normalizeText(text);
  return value.length > maxLength ? value.slice(0, maxLength).trim() : value;
}

function firstMatch(text, pattern, group = 1) {
  const match = String(text || '').match(pattern);
  return match?.[group] ? normalizeText(match[group]) : '';
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function stripProxyHeader(text) {
  const value = String(text || '');
  const marker = 'Markdown Content:';
  const index = value.indexOf(marker);
  return index >= 0 ? value.slice(index + marker.length) : value;
}

function stripMarkdownMarkup(text) {
  return String(text || '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/[*_`]/g, '');
}

function normalizePlainLine(text) {
  return normalizeText(stripMarkdownMarkup(text));
}

function cleanMarkdownHref(href) {
  return decodeHtmlEntities(String(href || '').replace(/\s+["'][^"']*["']\s*$/, '').trim());
}

function isProxyMarkdown(text) {
  const value = stripProxyHeader(text);
  return !/<[a-z][\w:-]*\b/i.test(value) && /^\s*#+\s/m.test(value);
}

function splitMarkdownListingBlocks(text) {
  const value = stripProxyHeader(text);
  return [...value.matchAll(/(?:^|\n)### \[[^\]]+\]\([^)]+\)[\s\S]*?(?=(?:\n### \[)|(?:\n#### )|(?:\n# )|$)/g)]
    .map((match) => match[0].trim())
    .filter(Boolean);
}

function extractEmails(text) {
  return unique((String(text || '').match(EMAIL_PATTERN) || []).map((email) => email.toLowerCase()));
}

function extractArticles(html) {
  if (isProxyMarkdown(html)) {
    return splitMarkdownListingBlocks(html);
  }
  return [...String(html || '').matchAll(/<article\b[^>]*class=['"][^'"]*\bsearch-result-article\b[^'"]*['"][^>]*>[\s\S]*?<\/article>/gi)].map((match) => match[0]);
}

function extractNextUrl(html) {
  const patterns = [
    /<link\b[^>]*rel=['"]next['"][^>]*href=['"]([^'"]+)['"][^>]*>/i,
    /<a\b[^>]*rel=['"]next['"][^>]*href=['"]([^'"]+)['"][^>]*>/i
  ];
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match?.[1]) return normalizeText(decodeHtmlEntities(match[1]));
  }
  return '';
}

function extractSection(html, pattern) {
  const match = String(html || '').match(pattern);
  return match?.[0] || '';
}

function extractVisibleParagraph(html) {
  for (const match of String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const value = normalizeText(stripHtmlTags(match[1]));
    if (value) return value;
  }
  return '';
}

function extractPostalCode(text) {
  const match = normalizeText(text).match(/\b(1\d{3})\b/);
  return match?.[1] || '';
}

function extractProfilePath(articleHtml, pageUrl) {
  if (isProxyMarkdown(articleHtml)) {
    const match = String(articleHtml || '').match(/^### \[([^\]]+)\]\(([^)]+)\)/m);
    if (!match?.[2]) return '';
    try {
      return new URL(cleanMarkdownHref(match[2]), pageUrl).toString();
    } catch {
      return '';
    }
  }

  const match = String(articleHtml || '').match(/<a\b[^>]*class=['"]title-link['"][^>]*href=['"]([^'"]+)['"][^>]*>/i);
  if (!match?.[1]) return '';
  try {
    return new URL(decodeHtmlEntities(match[1]), pageUrl).toString();
  } catch {
    return '';
  }
}

function extractTitle(articleHtml) {
  if (isProxyMarkdown(articleHtml)) {
    const match = String(articleHtml || '').match(/^### \[([^\]]+)\]\(([^)]+)\)/m);
    return match?.[1] ? normalizeText(match[1]) : '';
  }

  const match = String(articleHtml || '').match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
  return match?.[1] ? normalizeText(stripHtmlTags(match[1])) : '';
}

function extractTitleDetails(articleHtml) {
  if (isProxyMarkdown(articleHtml)) {
    const lines = stripProxyHeader(articleHtml)
      .split(/\r?\n/)
      .map((line) => normalizePlainLine(line))
      .filter(Boolean);
    const postalIndex = lines.findIndex((line) => /\b1\d{3}\s+Wien\b/i.test(line));
    if (postalIndex <= 1) return '';
    const candidates = lines
      .slice(1, postalIndex)
      .filter((line) =>
        !/^\[.*\]\(.*\)$/.test(line)
        && !/^Route planen$/i.test(line)
        && !/^\+?\d/.test(line)
        && !/@/.test(line)
        && !/^https?:\/\//i.test(line)
        && !/\b1\d{3}\s+Wien\b/i.test(line)
      );
    return candidates.length > 1 ? candidates[0] : '';
  }

  const match = String(articleHtml || '').match(/<div class=['"]title-details['"]>([\s\S]*?)<\/div>/i);
  return match?.[1] ? normalizeText(stripHtmlTags(match[1])) : '';
}

function extractAddress(articleHtml) {
  if (isProxyMarkdown(articleHtml)) {
    const lines = stripProxyHeader(articleHtml)
      .split(/\r?\n/)
      .map((line) => normalizePlainLine(line))
      .filter(Boolean);
    const postalIndex = lines.findIndex((line) => /\b1\d{3}\s+Wien\b/i.test(line));
    if (postalIndex < 0) return { street: '', place: '', postalCode: '' };
    const postalCode = lines[postalIndex].match(/\b(1\d{3})\b/)?.[1] || '';
    const street = postalIndex > 0 ? lines[postalIndex - 1] : '';
    const place = lines[postalIndex];
    return { street, place, postalCode };
  }

  const street = firstMatch(articleHtml, /<div class=['"]street['"][^>]*>([\s\S]*?)<\/div>/i);
  const place = firstMatch(articleHtml, /<div class=['"]place['"][^>]*>([\s\S]*?)<\/div>/i);
  return { street, place, postalCode: extractPostalCode(place) };
}

function extractEmailFromHtml(html) {
  if (isProxyMarkdown(html)) {
    const mailMatch = String(html || '').match(/\[([^\]]*?)\]\(mailto:([^)]+)\)/i);
    if (mailMatch?.[2]) return decodeHtmlEntities(mailMatch[2]).toLowerCase();
  }

  const anchorMail = firstMatch(html, /<a\b[^>]*href=['"]mailto:([^'"]+)['"][^>]*>/i);
  if (anchorMail) return anchorMail.toLowerCase();

  const mailSpan = firstMatch(html, /<a\b[^>]*data-gtm-event=['"]kontaktinfo-mail-click['"][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
  if (mailSpan) {
    const emails = extractEmails(mailSpan);
    if (emails[0]) return emails[0];
  }

  const visible = extractEmails(stripHtmlTags(html));
  return visible[0] || '';
}

function extractPhoneFromHtml(html) {
  if (isProxyMarkdown(html)) {
    const telMatch = String(html || '').match(/\[([^\]]*?)\]\(tel:([^)]+)\)/i);
    if (telMatch?.[2]) return normalizeText(decodeURIComponent(decodeHtmlEntities(telMatch[2])));
  }

  const telHref = firstMatch(html, /<a\b[^>]*href=['"]tel:([^'"]+)['"][^>]*>/i);
  if (telHref) return normalizeText(decodeURIComponent(telHref));

  const telSpan = firstMatch(html, /<a\b[^>]*itemprop=['"]telephone['"][^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
  if (telSpan) return normalizeText(telSpan);

  return '';
}

function extractWebsiteFromHtml(html) {
  if (isProxyMarkdown(html)) {
    for (const match of String(html || '').matchAll(/\[([^\]]*?)\]\((https?:[^)]+)\)/gi)) {
      const href = decodeHtmlEntities(match[2] || '');
      if (/wko\.at|maps\.google\.com/i.test(href)) continue;
      if (/^https?:\/\//i.test(href)) return normalizeText(href);
    }
  }

  for (const match of String(html || '').matchAll(/<a\b([^>]*)href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi)) {
    const attrs = match[1] || '';
    const href = decodeHtmlEntities(match[2] || '');
    const body = normalizeText(stripHtmlTags(match[3] || ''));
    if (!/^https?:\/\//i.test(href)) continue;
    if (/wko\.at|maps\.google\.com/i.test(href)) continue;
    if (/\bkontaktinfo-web-click\b/i.test(attrs) || /\bitemprop=['"]url['"]/i.test(attrs) || body) {
      return normalizeText(href);
    }
  }
  return '';
}

function extractContactNameFromProfile(html) {
  if (isProxyMarkdown(html)) {
    const lines = stripProxyHeader(html)
      .split(/\r?\n/)
      .map((line) => normalizePlainLine(line))
      .filter(Boolean);
    for (const line of lines) {
      const match = line.match(/(?:Ansprechperson|Kontaktperson|Kontakt|Inhaber|Geschäftsführer|Geschaeftsfuehrer|Gewerberechtliche Geschäftsführung)\s*:\s*(.+)$/i);
      if (match?.[1]) {
        const candidate = normalizeText(match[1]);
        if (candidate && candidate !== '-' && !/^\d+$/.test(candidate)) return candidate;
      }
    }
  }

  const value = normalizePlainLine(html);
  const patterns = [
    /(?:Ansprechperson|Kontaktperson|Kontakt|Inhaber|Geschäftsführer|Geschaeftsfuehrer|Gewerberechtliche Geschäftsführung)\s*:\s*([^\n|]+)/i,
    /(?:Ansprechperson|Kontaktperson|Kontakt|Inhaber|Geschäftsführer|Geschaeftsfuehrer|Gewerberechtliche Geschäftsführung)\s+([^\n|]+)/i
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      const candidate = normalizeText(match[1]);
      if (candidate && candidate !== '-' && !/^\d+$/.test(candidate)) return candidate;
    }
  }
  return '';
}

function extractDescriptionFromProfile(html) {
  if (isProxyMarkdown(html)) {
    const aboutMatch = stripProxyHeader(html).match(/### Über uns\s*\n([\s\S]*?)(?=\n### |\n#### |\n#IT|\n#EDV|\n#DSGVO|\n#Datenschutz|$)/i);
    if (aboutMatch?.[1]) {
      const lines = aboutMatch[1]
        .split(/\r?\n/)
        .map((line) => normalizePlainLine(line))
        .filter(Boolean)
        .filter((line) => !/^#/.test(line) && !/^\[.*\]\(.*\)$/.test(line));
      const longLine = lines.find((line) => line.length >= 40);
      if (longLine) return longLine;
      if (lines.length >= 2) return lines.slice(0, 2).join(' ');
      return lines[0] || '';
    }
  }

  const aboutSection = extractSection(html, /<section class=['"]about-us['"][\s\S]*?<\/section>/i);
  const aboutParagraph = extractVisibleParagraph(aboutSection);
  if (aboutParagraph) return aboutParagraph;

  const headerParagraph = firstMatch(html, /<div class=['"]company-header['"][\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
  if (headerParagraph) return headerParagraph;

  return '';
}

function extractProfileFields(html, pageUrl) {
  if (isProxyMarkdown(html)) {
    const sourceText = stripProxyHeader(html);
    const headingMatch = sourceText.match(/^#\s+(.+)$/m) || sourceText.match(/^### \[([^\]]+)\]/m);
    const postalMatch = sourceText.match(/\b(1\d{3})\s+Wien\b/i);
    const titleDetails = extractTitleDetails(html);
    const description = extractDescriptionFromProfile(html);
    const contactName = extractContactNameFromProfile(sourceText);
    const links = [...sourceText.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)];
    let email = '';
    let website = '';
    let phone = '';
    for (const match of links) {
      const href = cleanMarkdownHref(match[2] || '');
      if (/^mailto:/i.test(href) && !email) {
        email = decodeHtmlEntities(href.slice(7)).toLowerCase();
      } else if (/^tel:/i.test(href) && !phone) {
        phone = normalizeText(decodeURIComponent(decodeHtmlEntities(href.slice(4))));
      } else if (/^https?:\/\//i.test(href) && !/wko\.at|maps\.google\.com/i.test(href) && !website) {
        website = href;
      }
    }
    return {
      name: headingMatch?.[1]
        ? normalizeText(stripMarkdownMarkup(headingMatch[1])).replace(/\s*\|\s*WKO Firmen A-Z.*$/i, '')
        : '',
      postal_code: postalMatch?.[1] || '',
      city: postalMatch ? 'Wien' : '',
      contact_name: contactName,
      contact_email: email,
      website,
      phone,
      description,
      published_b2b_email: Boolean(email),
      source_url: pageUrl
    };
  }

  const name = firstMatch(html, /<h1\b[^>]*itemprop=['"]name['"][^>]*>([\s\S]*?)<\/h1>/i);
  const postalCode = firstMatch(html, /<span\b[^>]*itemprop=['"]postalCode['"][^>]*>([\s\S]*?)<\/span>/i);
  const city = firstMatch(html, /<span\b[^>]*itemprop=['"]addressLocality['"][^>]*>([\s\S]*?)<\/span>/i) || 'Wien';
  const description = extractDescriptionFromProfile(html);
  const contactName = extractContactNameFromProfile(html);
  const email = extractEmailFromHtml(html);
  const website = extractWebsiteFromHtml(html);
  const phone = extractPhoneFromHtml(html);

  return {
    name,
    postal_code: extractPostalCode(postalCode) || '',
    city: normalizeText(city) || 'Wien',
    contact_name: contactName,
    contact_email: email,
    website,
    phone,
    description,
    published_b2b_email: Boolean(email),
    source_url: pageUrl
  };
}

class WkoCookieJar {
  constructor() {
    this.cookies = new Map();
  }

  ingest(response) {
    const values = response?.headers?.getSetCookie?.() || [];
    for (const value of values) {
      const pair = String(value || '').split(';')[0].trim();
      if (!pair) continue;
      const equalsIndex = pair.indexOf('=');
      if (equalsIndex <= 0) continue;
      const name = pair.slice(0, equalsIndex).trim();
      const cookieValue = pair.slice(equalsIndex + 1).trim();
      if (name) this.cookies.set(name, cookieValue);
    }
  }

  header() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

function isChallengeHtml(html) {
  return PROFILE_CHALLENGE_PATTERN.test(String(html || '')) && /payload\s*=\s*\{\s*value:\s*"[^"]+"\s*\}/i.test(String(html || ''));
}

function challengePayload(html) {
  const match = String(html || '').match(/payload\s*=\s*\{\s*value:\s*"([^"]+)"\s*\}/i);
  return match?.[1] || '';
}

async function fetchWkoHtml(url, jar, options = {}) {
  const referer = options.referer || '';
  const timeoutMs = options.timeoutMs || 20000;
  const maxChallengeRetries = options.maxChallengeRetries ?? 2;
  let currentUrl = url;
  let challengeAttempts = 0;

  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          'user-agent': WKO_USER_AGENT,
          ...(referer ? { referer } : {}),
          ...(jar.header() ? { cookie: jar.header() } : {})
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    jar.ingest(response);
    const text = await response.text();
    if (isChallengeHtml(text)) {
      if (challengeAttempts >= maxChallengeRetries) {
        return text;
      }

      const payload = challengePayload(text);
      if (!payload) return text;

      const challengeResponse = await fetch(new URL('/Information.aspx/DetailsJs', currentUrl).toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': WKO_USER_AGENT,
          ...(jar.header() ? { cookie: jar.header() } : {}),
          ...(currentUrl ? { referer: currentUrl } : {})
        },
        body: JSON.stringify({ value: payload })
      });
      jar.ingest(challengeResponse);
      await challengeResponse.text().catch(() => '');
      challengeAttempts += 1;
      continue;
    }

    if (response.status >= 403) {
      try {
        const proxyResponse = await fetch(`https://r.jina.ai/http://${url}`, {
          headers: {
            'user-agent': WKO_USER_AGENT
          }
        });
        if (proxyResponse.ok) {
          const proxyText = await proxyResponse.text();
          if (proxyText) return proxyText;
        }
      } catch {
        // Fall through to the blocked response.
      }
    }

    if (!response.ok && !text) {
      throw new Error(`WKO ${response.status} ${response.statusText}`);
    }

    return text;
  }
}

function industryForSource(sourceUrl, fallbackIndustry) {
  const value = String(sourceUrl || '').toLowerCase();
  if (/(werbung|medien)/.test(value)) return 'media / advertising';
  if (/(it|software|dienstleistung)/.test(value)) return 'software / IT services';
  return fallbackIndustry || 'software / IT services';
}

function listingToRecord(articleHtml, pageUrl, fallbackIndustry) {
  if (isProxyMarkdown(articleHtml)) {
    const sourceText = stripProxyHeader(articleHtml);
    const headingMatch = sourceText.match(/^### \[([^\]]+)\]\(([^)]+)\)/m);
    const name = headingMatch?.[1] ? normalizeText(headingMatch[1]) : '';
    const profileUrlRaw = headingMatch?.[2] ? decodeHtmlEntities(headingMatch[2]) : '';
    const cleanedProfileUrlRaw = cleanMarkdownHref(profileUrlRaw);
    let profileUrl = '';
    try {
      profileUrl = cleanedProfileUrlRaw ? new URL(cleanedProfileUrlRaw, pageUrl).toString() : '';
    } catch {
      profileUrl = '';
    }

    const lines = sourceText
      .split(/\r?\n/)
      .map((line) => normalizePlainLine(line))
      .filter(Boolean);
    const postalIndex = lines.findIndex((line) => /\b1\d{3}\s+Wien\b/i.test(line));
    const postalCode = postalIndex >= 0 ? (lines[postalIndex].match(/\b(1\d{3})\b/)?.[1] || '') : '';
    const addressCandidates = postalIndex >= 0
      ? lines.slice(1, postalIndex).filter((line) =>
          !/^\[.*\]\(.*\)$/.test(line)
          && !/^Route planen$/i.test(line)
          && !/^https?:\/\//i.test(line)
          && !/^mailto:/i.test(line)
          && !/^tel:/i.test(line)
          && !/@/.test(line)
          && !/\b1\d{3}\s+Wien\b/i.test(line)
        )
      : [];
    const street = addressCandidates.at(-1) || '';
    const titleDetails = addressCandidates.length > 1 ? addressCandidates[0] : '';

    let email = '';
    let website = '';
    let phone = '';
    for (const match of sourceText.matchAll(/\[([^\]]*?)\]\(([^)]+)\)/g)) {
      const href = cleanMarkdownHref(match[2] || '');
      const label = normalizePlainLine(match[1]);
      if (/^mailto:/i.test(href) && !email) {
        email = decodeHtmlEntities(href.slice(7)).toLowerCase();
      } else if (/^tel:/i.test(href) && !phone) {
        phone = normalizeText(decodeURIComponent(decodeHtmlEntities(href.slice(4))));
      } else if (/^https?:\/\//i.test(href) && !/firmen\.wko\.at|maps\.google\.com/i.test(href) && !website) {
        website = href;
      } else if (!email) {
        const labelEmail = extractEmails(label)[0] || '';
        if (labelEmail) email = labelEmail;
      }
    }

    if (!name || !profileUrl || !postalCode || !postalCode.startsWith('1')) return null;

    return {
      source: 'wko',
      name,
      fn: null,
      bezirk: 'Wien',
      postal_code: postalCode,
      city: 'Wien',
      legal_form: null,
      date_of_entry: null,
      employee_count: null,
      industry: industryForSource(pageUrl, fallbackIndustry),
      website: website || null,
      linkedin_url: null,
      contact_name: null,
      contact_title: null,
      contact_email: email || null,
      contact_linkedin_url: null,
      source_url: profileUrl,
      published_b2b_email: Boolean(email),
      evidence_detail: truncateText(titleDetails || 'WKO company listing — Wien', 200),
      _listing: {
        street,
        titleDetails,
        phone
      }
    };
  }

  const name = extractTitle(articleHtml);
  const profileUrl = extractProfilePath(articleHtml, pageUrl);
  const titleDetails = extractTitleDetails(articleHtml);
  const { place, postalCode } = extractAddress(articleHtml);
  const email = extractEmailFromHtml(articleHtml);
  const website = extractWebsiteFromHtml(articleHtml);
  const phone = extractPhoneFromHtml(articleHtml);

  if (!name || !profileUrl || !postalCode || !postalCode.startsWith('1')) return null;

  return {
    source: 'wko',
    name,
    fn: null,
    bezirk: 'Wien',
    postal_code: postalCode,
    city: 'Wien',
    legal_form: null,
    date_of_entry: null,
    employee_count: null,
    industry: industryForSource(pageUrl, fallbackIndustry),
    website: website || null,
    linkedin_url: null,
    contact_name: null,
    contact_title: null,
    contact_email: email || null,
    contact_linkedin_url: null,
    source_url: profileUrl,
    published_b2b_email: Boolean(email),
    evidence_detail: truncateText(titleDetails || 'WKO company listing — Wien', 200),
    _listing: {
      place,
      phone,
      titleDetails
    }
  };
}

function mergeRecord(baseRecord, profileFields) {
  if (!baseRecord || !profileFields) return baseRecord;

  const next = { ...baseRecord };
  if (!next.name && profileFields.name) next.name = profileFields.name;
  if (profileFields.postal_code && profileFields.postal_code.startsWith('1')) next.postal_code = profileFields.postal_code;
  if (profileFields.city) next.city = profileFields.city;
  if (!next.website && profileFields.website) next.website = profileFields.website;
  if (!next.contact_email && profileFields.contact_email) next.contact_email = profileFields.contact_email;
  if (!next.contact_name && profileFields.contact_name) next.contact_name = profileFields.contact_name;
  if (!next.published_b2b_email) next.published_b2b_email = Boolean(profileFields.published_b2b_email);

  const evidence = profileFields.description || baseRecord.evidence_detail;
  next.evidence_detail = truncateText(evidence || 'WKO company listing — Wien', 200);
  if (profileFields.source_url) next.source_url = profileFields.source_url;
  return next;
}

async function fetchProfileRecord(baseRecord, jar) {
  try {
    const html = await fetchWkoHtml(baseRecord.source_url, jar, {
      referer: baseRecord.source_url
    });
    if (!html) return baseRecord;
    return mergeRecord(baseRecord, extractProfileFields(html, baseRecord.source_url));
  } catch (error) {
    console.error(`[wko] profile fetch failed for ${baseRecord.source_url}: ${error?.message || error}`);
    return baseRecord;
  } finally {
    await sleep(300);
  }
}

async function collectSourceRecords(source, limit, jar, seen) {
  const records = [];
  let pageUrl = source.url;

  while (pageUrl && records.length < limit) {
    let html = '';
    try {
      html = await fetchWkoHtml(pageUrl, jar, {
        referer: pageUrl
      });
    } catch (error) {
      console.error(`[wko] search fetch failed for ${pageUrl}: ${error?.message || error}`);
      break;
    }

    const articles = extractArticles(html);
    if (!articles.length) break;

    for (const articleHtml of articles) {
      if (records.length >= limit) break;
      const record = listingToRecord(articleHtml, pageUrl, source.industry);
      if (!record) continue;
      const dedupeKey = `${record.source_url}::${record.name}::${record.postal_code}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      records.push(record);
    }

    const nextUrl = extractNextUrl(html);
    if (!nextUrl || records.length >= limit) break;
    pageUrl = new URL(nextUrl, pageUrl).toString();
  }

  return records;
}

async function scrapeWkoVienna(limit = 60) {
  const target = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 60;
  if (target <= 0) return [];

  const jar = new WkoCookieJar();
  const seen = new Set();
  const records = [];

  try {
    for (const source of WKO_SOURCES) {
      if (records.length >= target) break;

      const sourceRecords = await collectSourceRecords(source, target - records.length, jar, seen);
      for (const record of sourceRecords) {
        if (records.length >= target) break;
        const enriched = await fetchProfileRecord(record, jar);
        records.push(enriched);
      }
    }
  } catch (error) {
    console.error(`[wko] scraper error: ${error?.message || error}`);
  }

  return records.slice(0, target).map(({ _listing, ...record }) => record);
}

export { scrapeWkoVienna };
