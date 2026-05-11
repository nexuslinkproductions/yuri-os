export type ViennaClientTier = 'A' | 'B' | 'C';

export interface ViennaClientResearchItem {
    n: number;
    name: string;
    url: string;
    district: string;
    sector: string;
    tier: ViennaClientTier;
    rev: string;
    web: string;
    social: string;
    contact: string;
    star?: boolean;
    gaps: string[];
    pitch: string;
    why: string;
    priorities: string[];
}

export const VIENNA_CLIENTS: ViennaClientResearchItem[] = [
    {
        n: 1,
        name: "TD The Detailer",
        url: "thedetailer.at",
        district: "1220",
        sector: "Automotive",
        tier: "A",
        rev: "€300k–€800k",
        web: "2/5",
        social: "IG · FB",
        contact: "Marc Bachhofner · Paul Pichler",
        star: true,
        gaps: ["🎥", "📱", "💻", "📣", "🎨"],
        pitch: "We made OREA's car care content cinematic. Same thing for your detailing — your work is visual, we make it impossible to scroll past.",
        why: "Exact structural parallel to OREA. Founder accessible. Premium niche with high visual appeal. Services gap crystal-clear from a 30-second website review.",
        priorities: [
            "Cinematic video content (premium detailing = natural c2moviez content)",
            "Social media strategy + content calendar",
            "Online booking system / IT support",
            "Meta / Instagram ad campaign management",
            "Brand motion — titles, before/after reels, brand shorts"
        ]
    },
    {
        n: 2,
        name: "Lorry Internationale Spedition",
        url: "lorry.at",
        district: "1220",
        sector: "Logistics",
        tier: "A",
        rev: "€2M–€8M",
        web: "4/5",
        social: "ZERO",
        contact: "lorry@lorry.at · +43 1 28 58 000",
        star: true,
        gaps: ["🌐", "📱", "🎥", "💻", "📊"],
        pitch: "30 years, 22 countries, 43 million tons. Your website doesn't show any of it. One visit and we'll show you exactly what we'd change.",
        why: "Enormous gap between actual company strength and digital presence. Zero social = first-mover advantage. Claudio walks in, shows two screens, closes within the meeting.",
        priorities: [
            "Website redesign (urgent — dated for 30-year company)",
            "Social from scratch (LinkedIn B2B, Instagram fleet/brand)",
            "Company video / fleet showcase / team culture",
            "IT infrastructure / cybersecurity",
            "Digital strategy / brand positioning"
        ]
    },
    {
        n: 3,
        name: "ARG BAU GmbH",
        url: "arg-bau.at",
        district: "1210",
        sector: "Construction",
        tier: "A",
        rev: "€1M–€4M",
        web: "2/5",
        social: "ZERO",
        contact: "Founder-run GmbH since 2010 · Partners: Strabag, ÖBB, Swietelsky",
        star: true,
        gaps: ["📱", "🎥", "💻", "🌐", "🎨"],
        pitch: "You've built with Strabag and ÖBB. Nobody can see it — your Instagram doesn't exist. Companies your size in Germany use project content to win their next €500k contract.",
        why: "Construction with tier-1 partners, zero social. Decision-maker (GmbH founder) almost certainly not outsourcing marketing yet.",
        priorities: [
            "Social presence (Instagram/LinkedIn)",
            "Project documentation video + timelapse",
            "IT/cybersecurity (sensitive project data)",
            "Website upgrade with dynamic portfolio",
            "Brand design + motion for social"
        ]
    },
    {
        n: 4,
        name: "Baecker & Partner GmbH",
        url: "bewachung-baecker.at",
        district: "1030",
        sector: "Security",
        tier: "A",
        rev: "€500k–€2M",
        web: "3/5",
        social: "ZERO",
        contact: "GmbH — direct owner contact likely",
        star: true,
        gaps: ["🌐", "🎥", "📱", "💻", "📣"],
        pitch: "You work with police, fire, and emergency services. Your website needs to feel like that level of professionalism. We've done it for a security brand — let us show you.",
        why: "Zero digital presence for a company that sells trust is a gaping pitch opportunity. Yuri Flow security support is a direct add-on.",
        priorities: [
            "Website modernization",
            "Company video / trust-building content",
            "LinkedIn + corporate social",
            "IT security consulting (Yuri Flow fit)",
            "B2B lead generation campaigns"
        ]
    },
    {
        n: 5,
        name: "PSM Austria",
        url: "psm-austria.at",
        district: "Vienna",
        sector: "Security",
        tier: "A",
        rev: "€300k–€1.5M",
        web: "1/5",
        social: "ZERO",
        contact: "No named CEO surfaced",
        gaps: ["📱", "🎥", "📣", "💻", "📊"],
        pitch: "Your website is clean. Your social doesn't exist. Every corporate client you want is on LinkedIn right now — and your competition is already there.",
        why: "Modern website = digital understanding exists, but social gap is total. Easy add-on: social + content + ads.",
        priorities: [
            "Social from scratch (LinkedIn B2B + Instagram)",
            "Video content (team, capability, trust)",
            "Meta / LinkedIn ads",
            "IT/cybersecurity (Yuri Flow)",
            "Brand strategy — differentiation"
        ]
    },
    {
        n: 6,
        name: "AutoSPA Wien",
        url: "autospa.at",
        district: "1190 · 1210",
        sector: "Automotive",
        tier: "A",
        rev: "€400k–€1.2M",
        web: "2/5",
        social: "IG · FB · TikTok",
        contact: "2-location retail, shopping center ops",
        gaps: ["🎥", "📱", "📣", "💻", "🎨"],
        pitch: "You're already on TikTok. The gap is that your content doesn't show what your best work looks like. We have a client who does this — let us show you 30 seconds of what car care content looks like shot right.",
        why: "OREA-adjacent. Has social channels but weak content. Multi-location = bigger campaign budget potential.",
        priorities: [
            "Professional video (before/after, process, seasonal)",
            "Social strategy — upgrade volume/quality",
            "Meta / TikTok Ads for both locations",
            "IT — booking system, loyalty tech",
            "Motion design for social"
        ]
    },
    {
        n: 7,
        name: "Keusch GmbH (Das Autohaus)",
        url: "keusch.com",
        district: "1200",
        sector: "Automotive",
        tier: "B",
        rev: "€10M–€30M",
        web: "2/5",
        social: "FB · IG · YT · LI",
        contact: "+43 1 330 34 47-0 · 80+ employees · 3 locations",
        gaps: ["🎥", "📣", "🎨", "💻", "📊"],
        pitch: "Maserati and Lexus are cinematic brands. You're selling emotion — your current social doesn't reflect that. We produce content that matches what those brands expect from their dealers.",
        why: "Larger company = longer sales cycle, but premium brands = premium budgets. Claudio's in-person style is perfect here.",
        priorities: [
            "Premium video production (Maserati/Lexus deserve cinematic)",
            "Meta / YouTube Ads management",
            "Motion design for showroom + events",
            "IT/cybersecurity (customer + finance data)",
            "Content calendar / campaign strategy"
        ]
    },
    {
        n: 8,
        name: "AG Motors",
        url: "agmotors.at",
        district: "1110",
        sector: "Automotive",
        tier: "B",
        rev: "€2M–€6M",
        web: "2/5",
        social: "FB · IG · YT",
        contact: "DI A. Gefairi (Geschäftsführer)",
        gaps: ["🎥", "📣", "📱", "💻", "🎨"],
        pitch: "You're rated #1 in Vienna. Your content should look like #1. Right now it doesn't — and that gap costs you on every new customer who finds you on Instagram before calling.",
        why: "Named decision-maker (DI Gefairi) = direct approach. Multi-channel social = clear service expansion path.",
        priorities: [
            "Video — reveals, inventory, workshop stories",
            "Meta / YouTube Ads management",
            "Social strategy — volume and consistency",
            "IT support / cybersecurity",
            "Motion for vehicle listings"
        ]
    },
    {
        n: 9,
        name: "VIPROTECT GmbH",
        url: "viprotect.at",
        district: "1190",
        sector: "Security",
        tier: "B",
        rev: "€800k–€2.5M",
        web: "2/5",
        social: "FB · IG · LI · X · YT",
        contact: "Martin Wagner · Deni Khachukaev",
        gaps: ["🎥", "🎨", "💻", "📣", "📱"],
        pitch: "You protect Erste Bank and the City of Vienna. Your content should reflect that caliber of client. Right now it's stock images — we make it real footage of your team and operations.",
        why: "High-status clients validate quality. Replacing stock with real production is a clear immediate win.",
        priorities: [
            "Original video production (replace stock footage)",
            "Brand design elevation",
            "IT/cybersecurity consulting",
            "B2B LinkedIn ad campaigns",
            "Social content strategy"
        ]
    },
    {
        n: 10,
        name: "KLASAN & Partner Immobilien",
        url: "klasan-immobilien.at",
        district: "1220",
        sector: "Real Estate",
        tier: "B",
        rev: "€400k–€1.5M",
        web: "3/5",
        social: "YT · FB · IG · LI · TikTok",
        contact: "Katharina Klasan (CEO) · office@klasan-immobilien.at",
        gaps: ["🌐", "🎥", "📣", "💻", "📊"],
        pitch: "Katharina, you're already on TikTok — ahead of most Vienna agencies. The next step is the production quality that makes those videos stop people mid-scroll.",
        why: "Named CEO is the decision-maker. Already has all social channels. Direct email available.",
        priorities: [
            "Website redesign",
            "Professional property video + drone",
            "Meta / TikTok Ads for listings",
            "IT support + CRM (Yuri Flow)",
            "Content calendar + social strategy"
        ]
    },
    {
        n: 11,
        name: "BURG IMMO (RAVENA GmbH)",
        url: "burgimmo.at",
        district: "1030",
        sector: "Real Estate",
        tier: "B",
        rev: "€300k–€1M",
        web: "2/5",
        social: "IG · FB",
        contact: "RAVENA GmbH — direct owner",
        gaps: ["🎥", "🌐", "📱", "💻", "📣"],
        pitch: "Luxury real estate sells through emotion. A €1.5M apartment video shot like an Airbnb listing loses €100k in perceived value. We shoot luxury — you know the difference.",
        why: "Luxury niche with cluttered frontend. Clear cinematic mandate. HNW clients = premium pricing.",
        priorities: [
            "Luxury property video + drone",
            "Website restructure (cluttered Elementor)",
            "Instagram content strategy",
            "IT support + data security",
            "Meta Ads targeting HNW buyers"
        ]
    },
    {
        n: 12,
        name: "WIENRAUM Immobilien",
        url: "wienraum.at",
        district: "1070",
        sector: "Real Estate",
        tier: "B",
        rev: "€300k–€900k",
        web: "2/5",
        social: "FB · YT",
        contact: "Sebastian Huppmann · Clemens Lettmayer (MDs)",
        gaps: ["🎥", "📱", "📣", "🌐", "💻"],
        pitch: "You're already doing video for listings — smart. The question is whether those videos are losing you clients vs. your premium competitors. Let's look at three examples together.",
        why: "Two named co-founders, direct addressability. Already doing video = open to upgrades.",
        priorities: [
            "Property video production upgrade",
            "Instagram / TikTok expansion",
            "Social Ads management",
            "Website refinement",
            "IT / CRM (Yuri Flow)"
        ]
    },
    {
        n: 13,
        name: "Smile Lounge Wien",
        url: "wien-zahnarzt.at",
        district: "1010",
        sector: "Dental",
        tier: "B",
        rev: "€400k–€1.2M",
        web: "2/5",
        social: "IG likely",
        contact: "Practice owner — direct",
        gaps: ["🎥", "📱", "🌐", "📣", "💻"],
        pitch: "Your practice is in the 1st district — every patient who finds you on Google is expecting premium before they call. Does your website reflect that?",
        why: "Prime district = premium patients, high AOV. Trust-building content is fastest patient acquisition.",
        priorities: [
            "Practice video + team introduction",
            "Instagram / social (before/after, trust)",
            "Website redesign for premium positioning",
            "Meta Ads targeting nearby residents",
            "Patient data security / IT (GDPR)"
        ]
    },
    {
        n: 14,
        name: "Zahnärzte Wien Mitte",
        url: "zahnarztwienmitte.at",
        district: "1030",
        sector: "Dental",
        tier: "B",
        rev: "€500k–€1.5M",
        web: "TBD",
        social: "Minimal",
        contact: "Practice management — direct owner access",
        gaps: ["🎥", "📱", "🌐", "💻", "📣"],
        pitch: "You've positioned as private — no waiting, full attention. Does your digital presence feel that way to a new patient before they make the appointment?",
        why: "Private-only = premium AOV. Same service pattern as Smile Lounge.",
        priorities: [
            "Practice video + team content",
            "Social strategy",
            "Website upgrade",
            "IT/GDPR compliance",
            "Meta Ads for private patients"
        ]
    },
    {
        n: 15,
        name: "Zahnklinik Wien Döbling",
        url: "zahnklinik-wien-doebling.at",
        district: "1190",
        sector: "Dental",
        tier: "B",
        rev: "€600k–€2M",
        web: "TBD",
        social: "Minimal",
        contact: "Clinic director / Prokurist",
        gaps: ["🎥", "📱", "🌐", "💻", "📣"],
        pitch: "Implants and orthodontics are €5k+ decisions. Patients spend weeks researching online before calling. Your digital presence either earns that research — or loses it to a competitor.",
        why: "Multi-specialist premium clinic. High AOV procedures = content pays back fast.",
        priorities: [
            "Specialist video (implants, orthodontics)",
            "Patient trust-building social",
            "Website for premium positioning",
            "Patient data security / IT",
            "Ads targeting premium"
        ]
    },
    {
        n: 16,
        name: "eigensinnig wien",
        url: "eigensinnig-wien.com",
        district: "1070",
        sector: "Fashion",
        tier: "B",
        rev: "€400k–€1.5M",
        web: "2/5",
        social: "IG · FB · X · Pinterest · YT",
        contact: "Boutique = direct founder access",
        gaps: ["🎥", "🌐", "📣", "💻", "🎨"],
        pitch: "You carry Mühlbauer and avant-garde European labels. Your Instagram should feel like those brands sound. Right now it doesn't — let us show you what fashion content looks like when it's shot intentionally.",
        why: "Shopify Plus (backend modern), visually cluttered frontend. Avant-garde niche = cinematic wins.",
        priorities: [
            "Fashion video / editorial film",
            "Website visual redesign",
            "Meta / Pinterest Ads",
            "IT/e-commerce security + CRM",
            "Motion/animation for social"
        ]
    },
    {
        n: 17,
        name: "FitnessGoesOffice",
        url: "fitnessgoesoffice.com",
        district: "Vienna",
        sector: "B2B Services",
        tier: "B",
        rev: "€500k–€2M",
        web: "2/5",
        social: "FB · LI · IG · YT",
        contact: "office@fitnessgoesoffice.com · +43-664-4000 875",
        gaps: ["🎥", "📱", "📣", "💻", "📊"],
        pitch: "You've landed Erste Bank and STRABAG — 20,000+ employees. Do you have a case study video that closes the next corporate deal? We can make that in a day.",
        why: "Fortune-grade clients already in. Case study video is quickest-ROI deliverable for B2B wellness.",
        priorities: [
            "Corporate video (training, testimonials, case studies)",
            "LinkedIn content strategy",
            "LinkedIn Ads targeting HR + wellness budget",
            "IT / platform optimization",
            "Brand strategy — differentiation"
        ]
    },
    {
        n: 18,
        name: "R.E.P. Steuerberatungs GmbH",
        url: "rep.at",
        district: "1010",
        sector: "Finance",
        tier: "B",
        rev: "€300k–€1M",
        web: "TBD",
        social: "Minimal",
        contact: "Managing partner (Kanzlei-Inhaber)",
        gaps: ["🌐", "💻", "📱", "🎥", "📣"],
        pitch: "Your clients trust you with their financial lives. Does your digital presence reflect that trust? An accountant with a great website and clean IT setup closes better clients.",
        why: "1010 location = premium clients. Accounting firms have some of the worst websites — huge upside.",
        priorities: [
            "Website redesign",
            "IT security + GDPR tools (Yuri Flow's strongest pitch)",
            "LinkedIn content strategy",
            "Firm introduction video",
            "LinkedIn Ads targeting founders + CFOs"
        ]
    },
    {
        n: 19,
        name: "HALLAS & Partner",
        url: "hallas-partner.at",
        district: "1020",
        sector: "Finance",
        tier: "B",
        rev: "€300k–€800k",
        web: "TBD",
        social: "Minimal",
        contact: "Hallas (partner/founder)",
        gaps: ["💻", "🌐", "📱", "🎥"],
        pitch: "GDPR and cybersecurity are your clients' biggest risk right now. But do you have the IT setup to protect their data on your end? That's where Yuri Flow starts.",
        why: "Same pattern as #18. IT security (Yuri Flow lead) is the strongest opener for audit/tax firms.",
        priorities: [
            "IT security (Yuri Flow lead)",
            "Website",
            "LinkedIn content",
            "Firm video"
        ]
    },
    {
        n: 20,
        name: "Artivive",
        url: "artivive.com",
        district: "Vienna",
        sector: "SaaS / Startup",
        tier: "B",
        rev: "€500k–€3M",
        web: "TBD",
        social: "LI heavy likely",
        contact: "Co-founders — direct access",
        gaps: ["🎥", "🎨", "📱", "📣", "💻"],
        pitch: "You're selling augmented reality — your own marketing content should be reality-augmented. Let's shoot something that proves the product in 30 seconds without anyone opening an app.",
        why: "VC-backed AR startup. Visual product = visual marketing mandate. Founders move fast.",
        priorities: [
            "Brand/product video (AR is visual)",
            "Motion design for demos, explainers",
            "Social content strategy",
            "Meta / LinkedIn Ads",
            "IT security scaling"
        ]
    },
    {
        n: 21,
        name: "Orderlion",
        url: "orderlion.com",
        district: "Vienna",
        sector: "SaaS / Startup",
        tier: "B",
        rev: "€1M–€5M",
        web: "TBD",
        social: "TBD",
        contact: "Founders / CMO",
        gaps: ["🎥", "📱", "📣", "💻", "🎨"],
        pitch: "You have a working product and paying customers. The next growth phase is content that makes your customers sell for you. A 90-second testimonial video pays for itself in one new deal.",
        why: "Series A stage. 100+ employees. Budget exists. Testimonial video = fast ROI.",
        priorities: [
            "Customer testimonial videos, explainer production",
            "Social strategy (LinkedIn + case study)",
            "LinkedIn Ads + retargeting",
            "IT infrastructure support",
            "Motion design for product marketing"
        ]
    },
    {
        n: 22,
        name: "Rendity",
        url: "rendity.com",
        district: "Vienna",
        sector: "SaaS / Startup",
        tier: "B",
        rev: "€500k–€2M",
        web: "TBD",
        social: "TBD",
        contact: "Founders",
        gaps: ["🎥", "📱", "📣", "💻", "📊"],
        pitch: "Retail investors make €10k+ decisions based on trust. Video is the fastest trust-builder — a well-produced 2-minute explainer will outperform any landing page copy you've written.",
        why: "Fintech = regulated + trust-dependent = video advantage is structural.",
        priorities: [
            "Investor education video content",
            "Social content strategy (investor trust)",
            "Meta / YouTube Ads targeting investors",
            "Platform security / IT support",
            "Brand positioning strategy"
        ]
    },
    {
        n: 23,
        name: "VIBE Vienna",
        url: "vibevienna.at",
        district: "Vienna",
        sector: "PR / Agency",
        tier: "B",
        rev: "€200k–€600k",
        web: "TBD",
        social: "Active",
        contact: "Agency founder/MD",
        gaps: ["🎥", "🎨", "💻", "📊"],
        pitch: "You're running lifestyle campaigns and events. When clients ask for video, who do you call? Let's be that call — with quality that makes you look better to your clients.",
        why: "PR agencies are multiplier clients — one deal brings 3-5 downstream projects.",
        priorities: [
            "Video production partnership",
            "Motion design for client campaigns",
            "IT support + content management",
            "Strategic partnership for full-service delivery"
        ]
    },
    {
        n: 24,
        name: "Putz & Stingl",
        url: "putzstingl.at",
        district: "Vienna",
        sector: "PR / Agency",
        tier: "B",
        rev: "€300k–€800k",
        web: "TBD",
        social: "Active",
        contact: "Agency founders",
        gaps: ["🎥", "💻", "📊"],
        pitch: "You do PR, events, social, and design. The one gap in most agencies' offer is video production. We can be your production partner — on your terms, under your delivery.",
        why: "Full-service SME agency. Video is almost certainly outsourced. Clean partnership fit.",
        priorities: [
            "Video production partner",
            "IT/cybersecurity (client data)",
            "Strategic partnership for scaling"
        ]
    },
    {
        n: 25,
        name: "Momentum Wien",
        url: "momentum.wien",
        district: "Vienna",
        sector: "PR / Agency",
        tier: "B",
        rev: "€200k–€600k",
        web: "TBD",
        social: "TBD",
        contact: "Agency founder",
        gaps: ["🎥", "💻", "🎨"],
        pitch: "Content strategy without video is half a strategy in 2026. Let's build the production side of your offer together — you keep the client relationship, we deliver the footage.",
        why: "Content-strategy agency with no in-house video = natural production partnership.",
        priorities: [
            "Video production partnership",
            "IT support for digital campaigns",
            "Motion design for client content"
        ]
    },
    {
        n: 26,
        name: "Finmatics",
        url: "finmatics.com",
        district: "Vienna",
        sector: "SaaS / Startup",
        tier: "C",
        rev: "€1M–€4M",
        web: "TBD",
        social: "TBD",
        contact: "CEO / Marketing",
        gaps: ["🎥", "📱", "📣", "💻", "🎨"],
        pitch: "AI tools win when they're explained simply. A 90-second video of how Finmatics saves an accountant 4 hours per week will close more trials than any landing page.",
        why: "Established AI product, 100 employees. Budget exists. Explainer video = SaaS conversion lift.",
        priorities: [
            "Explainer video",
            "LinkedIn content",
            "Social strategy",
            "IT security",
            "Brand motion"
        ]
    },
    {
        n: 27,
        name: "iClean.at",
        url: "iclean.at",
        district: "Vienna",
        sector: "Automotive",
        tier: "C",
        rev: "€300k–€1M",
        web: "TBD",
        social: "TBD",
        contact: "E-commerce ops",
        gaps: ["🎥", "📱", "📣", "🌐", "💻"],
        pitch: "Car care products look like commodities until someone films them in slow motion on a wet hood at golden hour. That's OREA's playbook — we made it. Same for you.",
        why: "6000+ SKUs e-commerce. Product video = direct conversion lift. OREA-adjacent.",
        priorities: [
            "Product video",
            "Social content",
            "Meta Ads e-commerce",
            "Website optimization",
            "IT/e-commerce security"
        ]
    },
    {
        n: 28,
        name: "Unique Logistik Transport",
        url: "uniquelogistik.at",
        district: "Vienna",
        sector: "Logistics",
        tier: "C",
        rev: "€300k–€1M",
        web: "TBD",
        social: "TBD",
        contact: "GmbH — direct owner",
        gaps: ["🌐", "📱", "🎥", "💻"],
        pitch: "Same playbook as Lorry: 30-year business, dated digital, zero social, clear gap. Walk in, show two screens, close it.",
        why: "Smaller Lorry analogue. Clean pitch if Lorry closes well first.",
        priorities: [
            "Website",
            "Social",
            "Company video",
            "IT"
        ]
    },
    {
        n: 29,
        name: "Baumeister Jovicic GmbH",
        url: "baumeister-jovicic.at",
        district: "Vienna",
        sector: "Construction",
        tier: "C",
        rev: "€500k–€2M",
        web: "TBD",
        social: "TBD",
        contact: "Baumeister / founder",
        gaps: ["📱", "🎥", "🌐", "💻"],
        pitch: "Your work is visible all over Vienna. Your social isn't. That's a marketing asset sitting uncaptured on every job site.",
        why: "Construction + zero social = pattern repeat. Predictable close.",
        priorities: [
            "Social",
            "Project documentation video",
            "Website",
            "IT"
        ]
    },
    {
        n: 30,
        name: "AK-M Bau GmbH",
        url: "ak-m.at",
        district: "Vienna",
        sector: "Construction",
        tier: "C",
        rev: "€500k–€2M",
        web: "TBD",
        social: "TBD",
        contact: "GmbH — direct owner",
        gaps: ["📱", "🎥", "🌐"],
        pitch: "Construction company social presence is a wide-open field in Vienna. You go first, you win the next €500k contract.",
        why: "Same construction sector play as ARG BAU and Jovicic.",
        priorities: [
            "Social",
            "Video documentation",
            "Website"
        ]
    },
    {
        n: 31,
        name: "Zeitgeist Events & PR",
        url: "zeitgeist.at",
        district: "Vienna",
        sector: "PR / Agency",
        tier: "C",
        rev: "€200k–€600k",
        web: "TBD",
        social: "Active",
        contact: "Agency founder",
        gaps: ["🎥", "🎨", "💻"],
        pitch: "Events are one of the hardest things to sell without video. We shoot events. When you need production, we're faster than any internal alternative.",
        why: "Event agency = recurring production need. Partnership play.",
        priorities: [
            "Video production partner",
            "Motion design",
            "IT for event platforms"
        ]
    },
    {
        n: 32,
        name: "Dr. Lukas Hallmann Zahnarzt",
        url: "zahnarzt-hallmann.at",
        district: "Vienna",
        sector: "Dental",
        tier: "C",
        rev: "€400k–€1M",
        web: "TBD",
        social: "Minimal",
        contact: "Practice owner",
        gaps: ["🌐", "📱", "💻"],
        pitch: "You're private, which means you choose your patients. Your digital presence should do the same screening — attracting premium patients before they even call.",
        why: "Private-only dental = premium AOV. GDPR/IT via Yuri Flow is natural add.",
        priorities: [
            "Website",
            "Social content",
            "IT / GDPR compliance"
        ]
    },
    {
        n: 33,
        name: "HEL-WACHT Bewachung",
        url: "helwacht.at",
        district: "Vienna",
        sector: "Security",
        tier: "C",
        rev: "€300k–€1M",
        web: "TBD",
        social: "TBD",
        contact: "Management",
        gaps: ["🌐", "📱", "🎥", "💻"],
        pitch: "Security companies without social are easy first pitches. Trust is their product — their digital presence doesn't reflect that yet.",
        why: "Security sector play continues. Lower priority than Tier A but clean close.",
        priorities: [
            "Website",
            "Social",
            "Video",
            "IT security consulting"
        ]
    },
    {
        n: 34,
        name: "AFS Wien",
        url: "afs-wien.at",
        district: "Vienna",
        sector: "Security",
        tier: "C",
        rev: "€300k–€800k",
        web: "4/5",
        social: "TBD",
        contact: "Management",
        gaps: ["🌐", "📱", "🎥", "💻"],
        pitch: "Your website still uses Flash-era design patterns. Your competitors are on Instagram. That's the conversation.",
        why: "Very dated web = impossible to argue against the pitch.",
        priorities: [
            "Website modernization",
            "Social",
            "Video",
            "IT"
        ]
    },
    {
        n: 35,
        name: "Bodycult",
        url: "bodycult.at",
        district: "Vienna / AT",
        sector: "E-Commerce",
        tier: "C",
        rev: "€500k–€2M",
        web: "TBD",
        social: "TBD",
        contact: "office@bodycult.at · +43 316 225 290",
        gaps: ["🎥", "📱", "📣", "💻"],
        pitch: "25 years of supplements. Your product video doesn't exist. Nutrition brands that invest in content 3x their order volume — we have the case studies.",
        why: "25-year e-commerce, 20k customers. Product video = direct conversion lift.",
        priorities: [
            "Product video",
            "Social strategy upgrade",
            "Meta Ads",
            "IT (e-commerce security)"
        ]
    },
    {
        n: 36,
        name: "tubics",
        url: "tubics.com",
        district: "Vienna",
        sector: "SaaS / Startup",
        tier: "C",
        rev: "€500k–€2M",
        web: "TBD",
        social: "TBD",
        contact: "Founder / Marketing",
        gaps: ["🎥", "🎨", "📱"],
        pitch: "You help other brands win on YouTube — who's making your own brand's video? Let's fix the cobbler's shoes.",
        why: "YouTube SEO SaaS without cinematic brand video = ironic pitch that works.",
        priorities: [
            "Brand video",
            "Motion design",
            "Content marketing"
        ]
    },
    {
        n: 37,
        name: "Artivive (followup)",
        url: "artivive.com",
        district: "Vienna",
        sector: "SaaS / Startup",
        tier: "C",
        rev: "€500k–€3M",
        web: "TBD",
        social: "TBD",
        contact: "Co-founders",
        gaps: ["🎥", "🎨"],
        pitch: "Second touch if Tier B doesn't convert on first pass.",
        why: "Backup slot for AR platform.",
        priorities: ["Follow-up on Tier B pitch"]
    },
    {
        n: 38,
        name: "Glanzmanufaktur",
        url: "glanzmanufaktur.at",
        district: "1230",
        sector: "Automotive",
        tier: "C",
        rev: "€200k–€500k",
        web: "TBD",
        social: "TBD",
        contact: "+43 660 118 45 46",
        gaps: ["📱", "🎥", "🌐", "💻"],
        pitch: "Certification + premium work + zero digital presence = growth blocked. OREA playbook applies.",
        why: "Smaller detailing shop, clean add-on to detailing cluster day.",
        priorities: [
            "Social from scratch",
            "Video",
            "Website content",
            "IT/booking"
        ]
    },
    {
        n: 39,
        name: "IFIN Immobilien",
        url: "ifin.at",
        district: "Vienna",
        sector: "Real Estate",
        tier: "C",
        rev: "€200k–€600k",
        web: "TBD",
        social: "TBD",
        contact: "Agency management",
        gaps: ["🌐", "📱", "🎥", "💻"],
        pitch: "Real estate pattern — video + social is table stakes now. You're not at table stakes.",
        why: "Standard RE pattern. Fast close if motivated.",
        priorities: [
            "Website",
            "Social",
            "Video",
            "IT"
        ]
    },
    {
        n: 40,
        name: "Orderlion (followup)",
        url: "orderlion.com",
        district: "Vienna",
        sector: "SaaS / Startup",
        tier: "C",
        rev: "€1M–€5M",
        web: "TBD",
        social: "TBD",
        contact: "CMO / Founders",
        gaps: ["🎥", "📱"],
        pitch: "Second touch if Tier B doesn't convert on first pass.",
        why: "Backup slot for B2B food SaaS.",
        priorities: ["Follow-up on Tier B pitch"]
    }
];

export const VIENNA_TIER_ORDER: ViennaClientTier[] = ['A', 'B', 'C'];

export const VIENNA_TIER_LABELS: Record<ViennaClientTier, string> = {
    A: 'Week 1',
    B: 'Week 2',
    C: 'Week 2-3'
};

export const VIENNA_GAP_LABELS: Record<string, string> = {
    '🎥': 'Video',
    '🌐': 'Website',
    '📱': 'Social',
    '💻': 'IT',
    '📣': 'Ads',
    '🎨': 'Motion',
    '📊': 'Strategy'
};

export const VIENNA_BRIEFING_COPY = {
    title: 'Vienna client research panel',
    subtitle: '40 targets across automotive, security, real estate, dental, SaaS, PR, logistics, and e-commerce. Built from the April 2026 Vienna HUD and dashboard brief.',
    focus: 'Start with video. Layer social and website upgrades next. Use Yuri Flow on the data-sensitive accounts.'
};
