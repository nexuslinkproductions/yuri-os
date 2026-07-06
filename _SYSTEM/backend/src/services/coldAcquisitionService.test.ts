import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ColdAcquisitionService } from './coldAcquisitionService';

const db = new Database(':memory:');
const service = new ColdAcquisitionService(db, {
    now: () => new Date('2026-05-12T12:00:00.000Z')
});

const bannedColdDraftPatterns = [
    /likely friction/i,
    /potential solution/i,
    /why it matters/i,
    /B2B teams with clear growth signals/i,
    /share a 5-min overview/i,
    /booking option/i,
    /acquisition stack/i,
    /demand-generation stack/i,
    /trust-building stack/i,
    /paid traffic|retargeting|Google Ads/i,
    /quick thought on your (?:positioning|services page|workflow page|product page)/i,
    /Tiny thought:/i,
    /Worth sending you a short example angle\?/i,
    /I came across .* while looking at/i
];

function bodyWordCount(draft: string) {
    return draft
        .replace(/^Subject:.*$/im, '')
        .replace(/Best,[\s\S]*$/i, '')
        .trim()
        .split(/\s+/)
        .filter(Boolean).length;
}

const swissLead = service.createLead({
    company: {
        name: 'Alpine Bio Analytics AG',
        country: 'CH',
        canton_or_bezirk: 'ZH',
        postal_code: '8001',
        city: 'Zuerich',
        uid_or_fn: 'CHE123456789',
        legal_form: 'AG',
        date_of_entry: '2026-04-12',
        employee_count: 28,
        industry: 'biotech',
        website: 'https://alpinebio.com/en/platform',
        linkedin_url: 'https://linkedin.com/company/alpine-bio-analytics'
    },
    contact: {
        name: 'Mira Keller',
        title: 'Founder',
        email: 'hello@alpinebio.com',
        linkedin_url: 'https://linkedin.com/in/mira-keller'
    },
    scoringSignals: {
        websiteHasEnglish: true,
        linkedinCompanyEnglish: true,
        decisionMakerEnglish: true,
        dotComTld: true,
        internationalSignal: false,
        highFitIndustry: true
    },
    evidence: [
        {
            kind: 'website_language',
            label: 'English product pages',
            detail: 'The /en/platform page explains clinical analytics workflows in English.',
            url: 'https://alpinebio.com/en/platform'
        },
        {
            kind: 'linkedin_activity',
            label: 'Founder language signal',
            detail: 'Mira Keller describes recent biotech partnership work in English.',
            url: 'https://linkedin.com/in/mira-keller'
        }
    ],
    compliance: {
        source: 'zefix',
        source_url: 'https://www.zefix.ch/en/search/entity/list/firm/123456',
        source_timestamp: '2026-05-12T11:40:00.000Z',
        legal_basis: 'public_register'
    },
    notes: 'Newcomer track; English-first biotech positioning.'
});

assert.equal(swissLead.scoring.english_score, 100);
assert.equal(swissLead.scoring.size_score, 100);
assert.equal(swissLead.scoring.industry_fit_score, 100);
assert.equal(swissLead.scoring.recency_score, 100);
assert.equal(swissLead.scoring.evidence_score, 100);
assert.equal(swissLead.scoring.personalization_score, 100);
assert.equal(swissLead.scoring.total_score, 100);
assert.equal(swissLead.priority_flag, true);
assert.equal(swissLead.channel, 'both');
assert.equal(swissLead.compliance.email_allowed, true);
assert.equal(swissLead.compliance.legal_review_required, true);
const swissDraftText = Object.values(swissLead.outreach_drafts).filter(Boolean).join('\n');
bannedColdDraftPatterns.forEach((pattern) => {
assert.doesNotMatch(swissDraftText, pattern);
});
assert.match(swissLead.outreach_drafts.linkedin_intro, /noticed.*clinical analytics workflows/i);
assert.match(swissLead.outreach_drafts.linkedin_intro, /short angle/i);
assert.doesNotMatch(swissLead.outreach_drafts.linkedin_intro, /\/en\/platform/i);
assert.ok(swissLead.outreach_drafts.linkedin_intro.split(/\s+/).length <= 75);
assert.ok(swissLead.outreach_drafts.linkedin_intro.length <= 450);
assert.match(swissLead.outreach_drafts.email_cold || '', /Subject: quick note on Alpine Bio Analytics/i);
assert.match(swissLead.outreach_drafts.email_cold || '', /I was reviewing Swiss company records and websites and noticed/i);
assert.match(swissLead.outreach_drafts.email_cold || '', /One thing that stood out:/i);
assert.match(swissLead.outreach_drafts.email_cold || '', /If you'd like, I can send a short angle\./i);
assert.doesNotMatch(swissLead.outreach_drafts.email_cold || '', /\/en\/platform/i);
assert.ok(bodyWordCount(swissLead.outreach_drafts.email_cold || '') <= 110);
assert.doesNotMatch(swissLead.outreach_drafts.email_cold || '', /\bEnglish\b|English-speaking|English-first|English-language/i);
assert.doesNotMatch(swissLead.outreach_drafts.linkedin_intro, /\bEnglish\b|English-speaking|English-first|English-language/i);
assert.doesNotMatch(swissLead.outreach_drafts.linkedin_intro, /Tiny thought:/i);
assert.ok(swissLead.draft_versions.length >= 3, 'generated drafts should be versioned');
assert.equal(swissLead.draft_specificity.valid, true);
const swissSpecificity = swissLead.draft_specificity as any;
assert.equal(swissSpecificity.readiness, 'ready_to_rework');
assert.equal(swissSpecificity.profile.confidence, 'high');
assert.match(swissSpecificity.profile.observed_signal, /clinical analytics workflows/i);
assert.ok(swissSpecificity.profile.source_urls.includes('https://alpinebio.com/en/platform'));
assert.ok(swissSpecificity.profile.do_not_claim.some((claim: string) => /revenue|conversion|struggling/i.test(claim)));

const thinEvidenceDb = new Database(':memory:');
const thinEvidenceService = new ColdAcquisitionService(thinEvidenceDb, {
    now: () => new Date('2026-05-12T12:00:00.000Z')
});
const thinEvidenceLead = thinEvidenceService.createLead({
    company: {
        name: 'Generic Growth GmbH',
        country: 'CH',
        canton_or_bezirk: 'ZH',
        postal_code: '8004',
        city: 'Zuerich',
        uid_or_fn: 'CHE000111222',
        legal_form: 'GmbH',
        date_of_entry: '2026-04-18',
        employee_count: 18,
        industry: 'SaaS',
        website: 'https://generic-growth.example',
        linkedin_url: 'https://linkedin.com/company/generic-growth'
    },
    contact: {
        name: 'Leo Graf',
        title: 'CEO',
        email: 'hello@generic-growth.example',
        linkedin_url: 'https://linkedin.com/in/leo-graf'
    },
    scoringSignals: {
        websiteHasEnglish: true,
        linkedinCompanyEnglish: true,
        decisionMakerEnglish: true,
        dotComTld: true,
        highFitIndustry: true
    },
    evidence: [
        {
            kind: 'website_language',
            label: 'Website exists',
            detail: 'Company website exists.',
            url: 'https://generic-growth.example'
        }
    ],
    compliance: {
        source: 'zefix',
        source_url: 'https://www.zefix.ch/en/search/entity/list/firm/000111222',
        source_timestamp: '2026-05-12T11:42:00.000Z',
        legal_basis: 'public_register'
    }
});
assert.equal(thinEvidenceLead.status, 'needs_review');
assert.ok(thinEvidenceLead.scoring.total_score <= 40);
assert.equal((thinEvidenceLead.draft_specificity as any).readiness, 'needs_research');
assert.ok((thinEvidenceLead.draft_specificity as any).warnings.includes('thin_evidence'));

const normalizationDb = new Database(':memory:');
const normalizationService = new ColdAcquisitionService(normalizationDb, {
    now: () => new Date('2026-05-12T12:00:00.000Z')
});
const wkoLead = normalizationService.createLead({
    company: {
        name: '2beWIRED GmbH',
        country: 'AT',
        canton_or_bezirk: '1220',
        postal_code: '1220',
        city: 'Wien',
        uid_or_fn: 'FN407935f',
        legal_form: 'GmbH',
        date_of_entry: '2014-01-01',
        employee_count: 10,
        industry: 'business IT services and software consulting',
        website: 'https://www.2bewired.at',
        linkedin_url: 'https://linkedin.com/company/2bewired'
    },
    contact: {
        name: '',
        title: 'Managing Director / Marketing owner',
        email: 'office@2bewired.at',
        linkedin_url: ''
    },
    scoringSignals: {
        websiteHasEnglish: false,
        linkedinCompanyEnglish: true,
        decisionMakerEnglish: false,
        dotComTld: false,
        internationalSignal: false,
        highFitIndustry: true
    },
    evidence: [
        {
            kind: 'wko_directory',
            label: 'WKO public record',
            detail: 'WKO software-trade search lists 2beWIRED GmbH in 1220 Wien as “2beWIRED - Business IT Lösungen” with office@2bewired.at and a public website.',
            url: 'https://firmen.wko.at/softwarehandel/wien-22-bezirk-donaustadt'
        },
        {
            kind: 'website_check',
            label: 'Website compliance check',
            detail: 'Company website fetched /, /kontakt, /impressum; B2B email appears on-site.',
            url: 'https://www.2bewired.at'
        }
    ],
    compliance: {
        source: 'wko',
        source_url: 'https://firmen.wko.at/softwarehandel/wien-22-bezirk-donaustadt',
        source_timestamp: '2026-05-12T11:43:00.000Z',
        legal_basis: 'website_published_email'
    }
});
const wkoDraftText = Object.values(wkoLead.outreach_drafts).filter(Boolean).join('\n');
assert.match(wkoDraftText, /2beWIRED/i);
assert.match(wkoDraftText, /Business IT Lösungen|business IT/i);
assert.match(wkoLead.outreach_drafts.email_cold || '', /^Subject: quick note on 2beWIRED/im);
assert.match(wkoLead.outreach_drafts.linkedin_intro, /One thing that stood out:/i);
assert.ok(wkoLead.outreach_drafts.linkedin_intro.length <= 450);
assert.ok(bodyWordCount(wkoLead.outreach_drafts.email_cold || '') <= 110);
[
    /\bWKO\b/i,
    /wko/i,
    /public WKO profile/i,
    /software-trade search lists/i,
    /office@2bewired\.at/i,
    /workbench/i,
    /Acquisition CRM/i
].forEach((pattern) => assert.doesNotMatch(wkoDraftText, pattern));
assert.doesNotMatch((wkoLead.draft_specificity as any).profile.observed_signal, /\bWKO\b|office@|software-trade search lists/i);
assert.equal((wkoLead.draft_specificity as any).readiness, 'ready_to_rework');
const staleWkoDrafts = {
    linkedin_intro: 'Hi, I was reviewing Vienna software and services firms and noticed 2beWIRED GmbH is described as 2beWIRED - Business IT Lösungen in 1220 Wien. One thing that stood out: that positioning is doing the first-pass explanation already. If useful, I can send a short angle.',
    linkedin_followup: 'Hi, quick follow-up on 2beWIRED. The same detail still stands: 2beWIRED GmbH is described as 2beWIRED - Business IT Lösungen in 1220 Wien.',
    email_cold: 'Subject: quick thought on your positioning\n\nHi,\n\nI was reviewing Vienna software and services firms and noticed 2beWIRED GmbH is described as 2beWIRED - Business IT Lösungen in 1220 Wien.\n\nTiny thought: that positioning is doing the first-pass explanation already.\n\nIf you\'d like, I can send a short angle.\n\nBest regards',
    email_followup: 'Subject: Re: quick thought on your positioning\n\nHi,\n\nQuick follow-up on 2beWIRED.\n\nThe same detail still stands: 2beWIRED GmbH is described as 2beWIRED - Business IT Lösungen in 1220 Wien.\n\nBest regards'
};
normalizationDb.prepare('UPDATE cold_acquisition_leads SET outreach_drafts_json = ?, draft_versions_json = ? WHERE id = ?').run(
    JSON.stringify(staleWkoDrafts),
    JSON.stringify(Object.entries(staleWkoDrafts).map(([draft_type, text]) => ({
        id: `stale_${draft_type}`,
        draft_type,
        text,
        source: 'generated',
        created_at: '2026-05-12T11:43:00.000Z'
    }))),
    wkoLead.id
);
const regeneratedWkoLead = normalizationService.getLead(wkoLead.id);
assert.ok(regeneratedWkoLead);
const regeneratedWkoText = Object.values(regeneratedWkoLead?.outreach_drafts || {}).filter(Boolean).join('\n');
assert.doesNotMatch(regeneratedWkoText, /\bWKO\b|public WKO profile|office@2bewired\.at|public company profile|quick thought on your positioning|Tiny thought:/i);
assert.match(regeneratedWkoText, /Subject: quick note on 2beWIRED/i);
assert.match(regeneratedWkoText, /Business IT Lösungen|business IT/i);

const zefixLead = normalizationService.createLead({
    company: {
        name: 'Romandie SaaS Growth AG',
        country: 'CH',
        canton_or_bezirk: 'VD',
        postal_code: '1003',
        city: 'Lausanne',
        uid_or_fn: 'CHE555111222',
        legal_form: 'AG',
        date_of_entry: '2026-03-02',
        employee_count: 18,
        industry: 'SaaS',
        website: 'https://romandie-growth.com/en',
        linkedin_url: 'https://linkedin.com/company/romandie-growth'
    },
    contact: {
        name: 'Claire Martin',
        title: 'CEO',
        email: 'hello@romandie-growth.com',
        linkedin_url: 'https://linkedin.com/in/claire-martin'
    },
    scoringSignals: {
        websiteHasEnglish: true,
        linkedinCompanyEnglish: true,
        decisionMakerEnglish: true,
        dotComTld: true,
        highFitIndustry: true
    },
    evidence: [
        {
            kind: 'zefix_bulk',
            label: 'Zefix open-data record',
            detail: 'Zefix open-data record shows Romandie SaaS Growth AG builds English-language SaaS growth tools for international hospitality groups.',
            url: 'https://www.zefix.ch/en/search/entity/list/firm/555111222'
        }
    ],
    compliance: {
        source: 'zefix',
        source_url: 'https://www.zefix.ch/en/search/entity/list/firm/555111222',
        source_timestamp: '2026-05-12T11:44:00.000Z',
        legal_basis: 'public_register'
    }
});
const zefixDraftText = Object.values(zefixLead.outreach_drafts).filter(Boolean).join('\n');
assert.match(zefixDraftText, /Romandie SaaS Growth/i);
assert.match(zefixDraftText, /SaaS growth tools/i);
assert.match(zefixLead.outreach_drafts.email_cold || '', /^Subject: quick note on Romandie SaaS Growth/im);
assert.match(zefixLead.outreach_drafts.linkedin_intro, /One thing that stood out:/i);
assert.ok(zefixLead.outreach_drafts.linkedin_intro.length <= 450);
assert.ok(bodyWordCount(zefixLead.outreach_drafts.email_cold || '') <= 110);
[
    /\bZefix\b/i,
    /open-data record/i,
    /company register profile/i,
    /public company profile/i,
    /workbench/i,
    /Acquisition CRM/i
].forEach((pattern) => assert.doesNotMatch(zefixDraftText, pattern));
assert.doesNotMatch((zefixLead.draft_specificity as any).profile.observed_signal, /\bZefix\b|open-data record/i);
assert.equal((zefixLead.draft_specificity as any).readiness, 'ready_to_rework');

const austriaLead = service.createLead({
    company: {
        name: 'Donaustadt Robotics GmbH',
        country: 'AT',
        canton_or_bezirk: '1220',
        postal_code: '1220',
        city: 'Wien',
        uid_or_fn: 'FN987654a',
        legal_form: 'GmbH',
        date_of_entry: '2025-12-01',
        employee_count: 34,
        industry: 'SaaS robotics',
        website: 'https://donaustadt-robotics.at/en',
        linkedin_url: 'https://linkedin.com/company/donaustadt-robotics'
    },
    contact: {
        name: 'Jonas Weiss',
        title: 'CEO',
        email: 'office@donaustadt-robotics.at',
        linkedin_url: 'https://linkedin.com/in/jonas-weiss'
    },
    scoringSignals: {
        websiteHasEnglish: true,
        linkedinCompanyEnglish: false,
        decisionMakerEnglish: true,
        dotComTld: false,
        internationalSignal: false,
        highFitIndustry: true
    },
    evidence: [
        {
            kind: 'website_language',
            label: 'English product section',
            detail: 'The English product section explains robotics deployment for international clients.',
            url: 'https://donaustadt-robotics.at/en'
        }
    ],
    compliance: {
        source: 'wko',
        source_url: 'https://firmen.wko.at/donaustadt-robotics',
        source_timestamp: '2026-05-12T11:45:00.000Z',
        legal_basis: 'public_register'
    },
    notes: 'Email exists but is not documented as a B2B inquiry route.'
});

assert.equal(austriaLead.channel, 'linkedin');
assert.equal(austriaLead.compliance.email_allowed, false);
assert.equal(austriaLead.compliance.email_block_reason, 'AT_EMAIL_REQUIRES_WEBSITE_PUBLISHED_B2B_INQUIRY');
assert.equal(austriaLead.outreach_drafts.email_cold, null);

const duplicate = service.createLead({
    company: {
        ...swissLead.company,
        name: 'Alpine Bio Analytics Holding AG',
        uid_or_fn: 'CHE999999999'
    },
    contact: {
        name: 'Mira Keller',
        title: 'Founder',
        email: 'hello@alpinebio.com',
        linkedin_url: 'https://linkedin.com/in/mira-keller'
    },
    scoringSignals: {
        websiteHasEnglish: true,
        linkedinCompanyEnglish: true,
        decisionMakerEnglish: true,
        dotComTld: true,
        internationalSignal: false,
        highFitIndustry: true
    },
    evidence: swissLead.evidence,
    compliance: swissLead.compliance,
    notes: 'Duplicate domain test.'
});

assert.equal(duplicate.dedupe.is_duplicate, true);
assert.equal(duplicate.status, 'needs_review');
assert.ok((duplicate.draft_specificity as any).warnings.includes('duplicate_observation'));

const dashboard = service.getDashboard();
assert.equal(dashboard.total_leads, 3);
assert.equal(dashboard.weekly_quota.target, 20);
assert.equal(dashboard.market_split.CH, 2);
assert.equal(dashboard.market_split.AT, 1);
assert.ok(dashboard.compliance_warnings.length >= 2);

const ready = service.markReady(swissLead.id);
assert.equal(ready.status, 'ready');

const payload = service.buildWebhookPayload(ready);
assert.equal(payload.company.name, 'Alpine Bio Analytics AG');
assert.equal(payload.company.country, 'CH');
assert.equal(payload.contact.name, 'Mira Keller');
assert.equal(payload.scoring.total_score, 100);
assert.equal(payload.channel, 'both');
assert.equal(payload.compliance.legal_basis, 'public_register');
assert.match(payload.notes, /\[PRIORITY\]/);

void service.pushReadyBatch({ dryRun: true, limit: 20 }).then((dryRun: any) => {
    assert.equal(dryRun.pushed, 1);
    assert.equal(dryRun.results[0].status, 'dry_run');

const replied = service.recordReply(ready.id, 'Thanks, please send the overview deck.');
assert.equal(replied.status, 'replied');
assert.match(replied.reply_text || '', /overview deck/);

const ingestDb = new Database(':memory:');
const ingestService = new ColdAcquisitionService(ingestDb, {
    now: () => new Date('2026-05-12T12:00:00.000Z')
});

const zefixIngest = ingestService.ingestZefixBulk([
    {
        name: 'Romandie SaaS Growth AG',
        uid: 'CHE555111222',
        status: 'ACTIVE',
        legal_form: 'AG',
        canton: 'VD',
        city: 'Lausanne',
        postal_code: '1003',
        date_of_entry: '2026-03-02',
        employee_count: 18,
        industry: 'SaaS',
        website: 'https://romandie-growth.com/en',
        linkedin_url: 'https://linkedin.com/company/romandie-growth',
        contact_name: 'Claire Martin',
        contact_title: 'CEO',
        contact_linkedin_url: 'https://linkedin.com/in/claire-martin',
        source_url: 'https://www.zefix.ch/en/search/entity/list/firm/555111222',
        purpose: 'Builds English-language SaaS growth tools for international hospitality groups.'
    },
    {
        name: 'Tiny Sole Proprietor',
        uid: 'CHE000000000',
        status: 'ACTIVE',
        legal_form: 'Einzelunternehmen',
        canton: 'ZH',
        source_url: 'https://www.zefix.ch/example/skip'
    }
]);
assert.equal(zefixIngest.created, 1);
assert.equal(zefixIngest.skipped, 1);
assert.equal(ingestService.listLeads()[0].company.country, 'CH');

const austriaIngest = ingestService.ingestAustriaDirectory([
    {
        source: 'wko',
        name: 'Ottakring Hospitality Tech GmbH',
        fn: 'FN123456x',
        bezirk: '1160',
        postal_code: '1160',
        city: 'Wien',
        legal_form: 'GmbH',
        employee_count: 22,
        industry: 'hospitality tech',
        website: 'https://ottakring-hospitality.at/en',
        linkedin_url: 'https://linkedin.com/company/ottakring-hospitality',
        contact_name: 'Eva Bauer',
        contact_title: 'Managing Director',
        contact_email: 'business@ottakring-hospitality.at',
        contact_linkedin_url: 'https://linkedin.com/in/eva-bauer',
        source_url: 'https://firmen.wko.at/ottakring-hospitality',
        published_b2b_email: true,
        evidence_detail: 'The English services page targets international hotel operators.'
    },
    {
        source: 'firmenabc',
        name: 'Outside Vienna GmbH',
        postal_code: '1010',
        source_url: 'https://firmenabc.at/outside'
    }
]);
assert.equal(austriaIngest.created, 1);
assert.equal(austriaIngest.skipped, 1);
const atLead = ingestService.listLeads({ country: 'AT' })[0];
assert.equal(atLead.compliance.legal_basis, 'website_published_email');
assert.equal(atLead.channel, 'both');

process.stdout.write('cold-acquisition-service: pass\n');
});
