---
title: "c2luxury.com — Website Structure Proposal"
type: proposal
status: draft
domain: c2luxury.com
created: 2026-04-16
author: CTI / EXEO
related:
  - "[[real-estate-videography-strategy]]"
  - "[[silaswirth-partnership-agreement]]"
tags:
  - website
  - proposal
  - real-estate
  - silaswirth
  - c2luxury
---

# c2luxury.com — Website Structure Proposal

## Cinematic Real Estate Videography for the DACH Luxury Market

**Document version:** 1.0 — 16 April 2026
**Prepared for:** Claudio Tinner (CEO), Silas Wirth (Partner)
**Domain:** c2luxury.com
**Classification:** Internal / Confidential

---

## 1. Site Architecture

### 1.1 Page Map

```
c2luxury.com/
│
├── /                          ← Homepage (hero + showcase + conversion)
├── /services                  ← Service overview (4 tiers + add-ons)
│   ├── /services/essential    ← ESSENTIAL tier detail page
│   ├── /services/premium      ← PREMIUM tier detail page
│   ├── /services/luxury       ← LUXURY tier detail page
│   └── /services/custom       ← CUSTOM / MEGA tier detail page
├── /work                      ← Portfolio / showcase grid
│   └── /work/[project-slug]   ← Individual project case study
├── /about                     ← Team, story, approach, equipment
├── /process                   ← How we work — detailed production flow
├── /book                      ← Contact / booking form
├── /journal                   ← Blog / insights (SEO content hub)
│   └── /journal/[post-slug]   ← Individual blog post
├── /impressum                 ← Legal notice (Swiss legal requirement)
├── /datenschutz               ← Privacy policy (DSGVO / Swiss DSG)
└── /agb                       ← Terms and conditions
```

### 1.2 Page Purposes

| Page | Purpose | Priority |
|------|---------|----------|
| **Homepage** | First impression, emotional hook, showcase capability, drive to booking | Launch-critical |
| **Services** | Educate on tiers, justify pricing, enable self-qualification | Launch-critical |
| **Services/[tier]** | Detailed breakdown per tier, specific CTAs, example videos | Phase 2 (can launch with overview only) |
| **Work** | Prove capability through real projects, build trust | Launch-critical (even with spec work) |
| **Work/[project]** | Deep-dive case study — the full story of a property shoot | Phase 2 (add as projects complete) |
| **About** | Humanize the brand, establish credibility, show the team | Launch-critical |
| **Process** | Remove friction, answer "how does it work?", set expectations | Launch-critical |
| **Book** | Convert interest into leads, capture property details | Launch-critical |
| **Journal** | SEO content hub, establish authority, long-tail keyword capture | Phase 2 (launch with 3-5 posts) |
| **Impressum** | Swiss legal requirement for commercial websites | Launch-critical |
| **Datenschutz** | DSGVO/DSG compliance, required | Launch-critical |
| **AGB** | Terms and conditions for bookings | Launch-critical |

### 1.3 Navigation Structure

**Primary navigation (sticky header, transparent on hero, solid on scroll):**

```
[c2luxury logo]     The Work     Services     Process     About     [Book a Shoot →]
```

- Logo: Wordmark "c2luxury" in gold (#C9A96E) on dark, or white on dark — links to homepage
- "Book a Shoot" is a gold-outlined button, always visible
- Mobile: hamburger menu with full-screen dark overlay, large tap targets
- Language switcher (DE / EN / FR) — top right corner, subtle

**Footer navigation:** Full sitemap + legal pages + social links + c2moviez brand attribution

---

## 2. Homepage — Section-by-Section Breakdown

The homepage is a single continuous scroll experience designed to take a visitor from emotional hook to booking in under 90 seconds of scrolling. Every section builds on the previous one.

---

### Section 1: HERO

**What it shows:**
Full-screen (100vh) autoplay video background — a 15-20 second seamless loop of the best footage: FPV flythrough into a luxury villa, drone reveal of a Swiss lakeside property, slow interior gimbal shot with golden-hour light. Muted by default. Sound toggle icon in bottom-right corner.

**Content overlay:**
```
[Top-center: c2luxury wordmark — gold on dark, fades in]

YOUR PROPERTY
DESERVES A FILM.

Cinematic real estate videography for the DACH luxury market.

[See Our Work ↓]          [Book a Shoot →]
```

**Typography:**
- Headline: 80-120px (desktop), uppercase, tracking +0.15em, white (#FFFFFF), font-weight 300 (light)
- Subheadline: 18-22px, letter-spacing +0.08em, text secondary (#A0A0A0)
- CTAs: "See Our Work" as ghost button (white border), "Book a Shoot" as solid gold (#C9A96E) button

**Interaction / Animation:**
- Video loads with a 0.5s fade-in from black
- Headline fades in with subtle upward slide (0.8s delay after video)
- Subtle Ken Burns zoom on video (1% over 20 seconds) for cinematic feel
- On scroll: parallax — video moves at 0.5x speed, text fades out at 0.3x speed
- Mouse cursor changes to a subtle gold dot on hover over interactive elements
- Sound toggle: click to unmute with volume fade-in (ambient cinematic music)

**CTA behavior:**
- "See Our Work" smooth-scrolls to Section 4 (Showcase)
- "Book a Shoot" navigates to /book

**Content needed:**
- [ ] 15-20 second hero loop (edited from spec shoot footage)
- [ ] Ambient background audio track (licensed cinematic)
- [ ] c2luxury wordmark / logo (gold version, white version, SVG)

---

### Section 2: PROBLEM STATEMENT

**What it shows:**
A dark, text-focused section that creates emotional tension — the "why" before the "what." Split into two halves with a subtle diagonal divider.

**Content:**
```
Left side (problem):
"Static photos. Generic drone passes. Slideshows with stock music."

"This is how CHF 10 million properties are being marketed in Switzerland today."

Right side (solution):
"Your buyers expect cinema."

"Properties with professional video receive 403% more inquiries.
Luxury listings with cinematic presentation sell 31% faster."

[We build the films that sell extraordinary properties. →]
```

**Typography:**
- Problem text: 28-36px, italic, text secondary (#A0A0A0), slightly faded
- Solution text: 28-36px, bold, white (#FFFFFF)
- Stats: highlighted in gold (#C9A96E), large font weight
- Link text: gold, underlined on hover

**Interaction / Animation:**
- Problem side fades in first (on scroll into viewport, 0.3s)
- Solution side fades in 0.5s after problem side
- Stats numbers animate with a counting-up effect (0 to 403%, 0 to 31%)
- Subtle horizontal line animates between the two sides

**CTA:** "We build the films that sell extraordinary properties" links to /about

**Content needed:**
- [ ] Final copy (refine the above, possibly in German/English versions)
- [ ] Statistics source citations (for credibility — small footnote)

---

### Section 3: SERVICE TIERS

**What it shows:**
Four premium cards arranged horizontally (desktop) or stacked (mobile), each representing a service tier. Dark card backgrounds with subtle border glow on hover.

**Layout:**

```
ESSENTIAL              PREMIUM               LUXURY               CUSTOM
"First Impression"     "Cinematic Story"     "The Full Experience" "Development & Hospitality"

Drone + walkthrough    FPV + lifestyle       Full pre-production   Multi-day, multi-location
60-90 sec edit         2-3 min cinematic     3-5 min cinematic     Fully custom scope
Basic color grade      Motion graphics       Lifestyle talent      Multi-language versions
3 social cuts          Pro color grading     Virtual tour          Campaign-ready content
                       5 social cuts          8+ social cuts
                       Photo stills           BTS content

From CHF 2,500         From CHF 5,500        From CHF 12,000       From CHF 20,000

[Learn More]           [Most Popular ★]       [Learn More]          [Get a Quote]
                       [Learn More]
```

**Design:**
- Cards: #1A1A1A background, 1px border #2A2A2A, rounded corners 8px
- "Most Popular" badge on Premium card: gold (#C9A96E) ribbon or corner badge
- On hover: card lifts (translateY -4px), border transitions to gold glow (box-shadow: 0 0 20px rgba(201,169,110,0.15))
- Pricing: gold color, 32px font
- Feature list: checkmark icons in gold, text in white/light gray

**Interaction / Animation:**
- Cards fade in sequentially left-to-right (0.15s stagger) on scroll
- Hover: smooth lift + glow transition (0.3s ease)
- "Most Popular" badge pulses subtly once on viewport entry

**CTA:** Each "Learn More" links to /services/[tier]. "Get a Quote" links to /book with pre-selected "Custom" package.

**Content needed:**
- [ ] Finalized feature lists per tier (from strategy doc, condensed for cards)
- [ ] Pricing confirmation (or "Starting from" ranges)
- [ ] Gold checkmark icon (SVG)

---

### Section 4: SHOWCASE REEL

**What it shows:**
A portfolio grid of 6-9 featured property projects. Each is a video thumbnail with overlay information. This is the proof section — visitors need to see real work.

**Layout:**
```
THE WORK

Featured property showcases from across the DACH region.

[Grid: 3 columns x 2-3 rows]

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│             │  │             │  │             │
│  [Video     │  │  [Video     │  │  [Video     │
│   Still]    │  │   Still]    │  │   Still]    │
│             │  │             │  │             │
│ Villa Zürichberg │ Penthouse Vienna │ Chalet Engadin │
│ Zurich · Premium │ Vienna · Luxury  │ Engadin · Luxury │
└─────────────┘  └─────────────┘  └─────────────┘

[View All Projects →]
```

**Design:**
- Thumbnails: 16:9 aspect ratio, subtle dark overlay gradient from bottom (for text legibility)
- On hover: overlay darkens, play button icon fades in (gold circle with white triangle), thumbnail zooms 1.05x
- Property name: white, 20px, font-weight 500
- Location + tier: text secondary, 14px, uppercase tracking

**Interaction / Animation:**
- Grid items stagger-fade-in on scroll (0.1s per item)
- On click: smooth transition to full-screen video player (dark overlay, centered video, close button)
- Alternative: click navigates to /work/[project-slug] for full case study
- Lazy-load video thumbnails for performance

**CTA:** "View All Projects" links to /work

**Content needed:**
- [ ] 6-9 property video thumbnails (high-quality stills from video footage)
- [ ] Property names, locations, tier labels
- [ ] Video files for inline playback (or Vimeo embeds)
- [ ] At minimum: 3-4 spec shoot projects ready for launch

---

### Section 5: THE PROCESS

**What it shows:**
A horizontal 4-step timeline showing how working with c2luxury works. Removes friction and uncertainty — agencies want to know exactly what happens after they say yes.

**Layout:**
```
HOW IT WORKS

From first call to final delivery — a seamless production experience.

    ①                    ②                    ③                    ④
 CONSULT              PRODUCE              REFINE               DELIVER
    ·─────────────────────·─────────────────────·─────────────────────·

"We learn your         "Full production     "Cinema-grade post:   "Final films,
property, your         day: drone, FPV,     color grading,        social cuts,
buyer, your            gimbal, lifestyle    motion graphics,      virtual tour —
vision."               — directed by CTI."  sound design."        ready to list."

 Day 1                 Day 2-3              Day 4-7               Day 5-10
 Discovery call        On-location shoot    Post-production       Review + delivery
 Shot list planning    Art direction        Client preview        Revisions included
 Logistics             Multi-setup          Platform optimization All formats
```

**Design:**
- Timeline: thin gold line (#C9A96E) connecting the four steps
- Step numbers: large gold circles (48px) with white numbers inside
- Step titles: white, uppercase, tracking +0.1em, 18px
- Description text: #A0A0A0, 15px
- Day indicators: small gold text below each step

**Interaction / Animation:**
- On scroll: timeline line draws from left to right (SVG stroke-dasharray animation, 2s duration)
- Step circles fill from outline to solid gold as the line reaches them
- Text fades in under each step as its circle activates
- On mobile: vertical timeline (steps stack vertically, line goes top-to-bottom)

**CTA:** After step 4, a subtle line: "Ready to start? [Book your consultation →]" — links to /book

**Content needed:**
- [ ] Final copy per step (refine from above)
- [ ] Step icons (optional: camera, drone, color wheel, package — line icons in gold)

---

### Section 6: THE TEAM

**What it shows:**
Three team members with professional portraits, roles, and brief bios. Establishes credibility and puts faces to the brand.

**Layout:**
```
THE TEAM

Three specialists. One cinematic vision.

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│                  │  │                  │  │                  │
│  [Portrait CTI]  │  │ [Portrait Silas] │  │ [Portrait Marcel]│
│                  │  │                  │  │                  │
│  CLAUDIO TINNER  │  │  SILAS WIRTH     │  │  MARCEL SPATZ    │
│  Director &      │  │  Motion Design   │  │  Post-Production │
│  Cinematographer │  │  & Visual Effects│  │  & Color Grading │
│                  │  │                  │  │                  │
│  "FPV pilot,     │  │  "Motion         │  │  "Cinema-grade   │
│  cinematic       │  │  graphics that   │  │  color grading   │
│  director, and   │  │  transform       │  │  from Vienna.    │
│  Swiss precision │  │  property videos │  │  Every frame     │
│  in every        │  │  into brand      │  │  tells a story." │
│  frame."         │  │  experiences."   │  │                  │
│                  │  │                  │  │                  │
│  c2moviez GmbH   │  │  SILASWIRTH     │  │  NexusLink       │
│  Switzerland     │  │  Switzerland     │  │  Productions     │
│                  │  │                  │  │  Vienna, Austria  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Design:**
- Portraits: square or 3:4 ratio, desaturated with subtle warm tone, dark vignette
- On hover: portrait transitions to full color (0.4s ease), subtle gold border appears
- Names: white, uppercase, 20px, tracking +0.1em
- Roles: gold (#C9A96E), 14px, uppercase
- Bios: #A0A0A0, 15px, italic
- Company/Location: #666666, 13px

**Interaction / Animation:**
- Portraits fade in with subtle scale (0.95 to 1.0) on scroll
- Stagger: 0.15s between each team member
- Hover: desaturated-to-color transition on portrait

**CTA:** None directly — this section builds trust, not conversion.

**Content needed:**
- [ ] Professional portrait of Claudio Tinner (dark background, cinematic lighting)
- [ ] Professional portrait of Silas Wirth (matching style)
- [ ] Professional portrait of Marcel Spatz (matching style)
- [ ] Final bio copy per person (2-3 sentences each)

---

### Section 7: STATS / SOCIAL PROOF

**What it shows:**
Key numbers that establish scale and credibility. Large, animated counters. Even with placeholder numbers initially, this section creates the impression of an established operation.

**Layout:**
```
[Dark section with subtle texture/grain overlay]

    47+                  CHF 850M+              12                   4
 Properties           Combined Property       DACH Cities          Languages
 Filmed               Value Showcased         Covered              DE · EN · FR · IT

```

*Note: These are aspirational/placeholder numbers for launch. Update as real data accumulates. For honest launch, could use:*
- "6+ Properties Filmed" (spec shoots)
- "CHF 120M+ in Property Value Showcased"
- "3 DACH Countries Covered"
- "4 Languages"

**Design:**
- Full-width dark section (#0A0A0A) with subtle noise/grain texture
- Numbers: 64-80px, gold (#C9A96E), font-weight 200 (thin)
- Labels: 14px, white, uppercase, tracking +0.15em
- Horizontal layout with thin gold vertical dividers between each stat

**Interaction / Animation:**
- Numbers count up from 0 on scroll into viewport (2s duration, ease-out)
- Slight stagger between each counter (0.2s)

**CTA:** None — pure credibility.

**Content needed:**
- [ ] Finalized numbers (honest for launch, update quarterly)

---

### Section 8: TESTIMONIALS

**What it shows:**
Client quotes in a minimal carousel. Even one strong testimonial establishes trust. Build this section as projects complete.

**Layout:**
```
WHAT THEY SAY

   ←  "c2luxury transformed how we present our flagship listings.
       The FPV flythrough alone generated more inquiries in one week
       than our previous listing photos did in a month."

       — Anna Mueller, Director of Marketing
         Sotheby's International Realty Switzerland
         CHF 12M Lake Zurich Villa

                                                                   →

       · · ● · ·
```

**Design:**
- Quote text: 24-28px, white, italic, centered, max-width 800px
- Attribution: 16px, gold for name, #A0A0A0 for title/company
- Property value: 14px, #666666
- Navigation arrows: subtle, gold on hover
- Dot indicators: small gold circles, active dot filled
- Quotation mark icon: large, faded gold (#C9A96E at 15% opacity), decorative

**Interaction / Animation:**
- Auto-advance every 8 seconds
- Swipe support on mobile
- Fade transition between quotes (0.5s)
- Pause auto-advance on hover

**CTA:** None directly.

**Content needed:**
- [ ] Real testimonials (collect from first projects)
- [ ] Placeholder testimonials for launch (clearly mark as examples, or use generic praise)
- [ ] Consider: use a quote from the strategy doc statistics instead ("Properties with video receive 403% more inquiries — NAR") as a placeholder

---

### Section 9: COVERAGE MAP

**What it shows:**
An SVG map of the DACH region (Switzerland, Austria, Germany) with highlighted coverage areas and team base locations.

**Layout:**
```
WHERE WE WORK

Luxury properties across the DACH region. Based in Switzerland and Austria.

        [SVG Map of DACH Region]

        Germany
          ·Munich  ·Hamburg  ·Frankfurt

                Switzerland
                  ★ Zurich (HQ)
                  · Geneva  · Engadin  · Ticino  · Verbier

                          Austria
                            ★ Vienna
                            · Salzburg  · Tyrol

        ★ = Team base     · = Active coverage
```

**Design:**
- Map: custom SVG, countries filled in dark charcoal (#1A1A1A) with subtle gold border strokes
- Switzerland highlighted slightly brighter (#222222)
- Team base markers: gold stars, pulsing gently
- City markers: small gold dots
- City labels: 12px, white, appear on hover over the dot
- Background: #0A0A0F

**Interaction / Animation:**
- Map draws in with SVG path animation on scroll (1.5s)
- Country borders animate first, then fill colors fade in
- City dots appear with staggered pop-in (0.05s each)
- Team base stars pulse continuously (subtle scale animation)
- On hover over a city dot: tooltip with city name + "Available for shoots"

**CTA:** Below map: "Based in Zurich & Vienna. Available across the entire DACH region. [Book a shoot in your city →]"

**Content needed:**
- [ ] Custom DACH SVG map (simplified, stylized — not Google Maps)
- [ ] City list finalization (which cities to highlight)

---

### Section 10: CTA / BOOKING SECTION

**What it shows:**
Final conversion section. Strong headline, brief reassurance, and a streamlined booking form or link to the full form.

**Layout:**
```
[Full-width section, slightly lighter background #0F0F14]

READY TO SHOWCASE
YOUR PROPERTY?

Let's discuss your vision. Every project starts with a 15-minute
consultation — no commitment, no cost.

    [Book Your Property Showcase →]

    or call +41 XX XXX XX XX
```

**Design:**
- Headline: 48-64px, white, uppercase, centered
- Body: 18px, #A0A0A0, centered, max-width 600px
- CTA button: large (56px height), gold (#C9A96E) background, dark text, rounded 4px
- Phone number: gold, clickable (tel: link)
- Subtle gold gradient line above the section (1px, fading from transparent to gold to transparent)

**Interaction / Animation:**
- Section fades in on scroll
- CTA button has a subtle shimmer animation on idle (gold gradient sweep, every 4 seconds)
- On hover: button darkens slightly, text lightens

**CTA:** Button links to /book

**Content needed:**
- [ ] Final CTA copy
- [ ] Phone number (business line)

---

### Section 11: FOOTER

**What it shows:**
Brand attribution, navigation, legal links, social media.

**Layout:**
```
─────────────────────────────────────────────────────────────

c2luxury                    Navigation              Connect
A c2moviez GmbH brand      The Work                Instagram
                            Services                YouTube
Swiss-made luxury           Process                 LinkedIn
real estate content.        About                   TikTok
                            Journal                 Vimeo

                            Legal
                            Impressum
                            Datenschutz
                            AGB

─────────────────────────────────────────────────────────────
© 2026 c2moviez GmbH · Swiss-made luxury content · All rights reserved
```

**Design:**
- Background: #050508 (near-black, darker than page)
- c2luxury wordmark: gold, 24px
- "A c2moviez GmbH brand": 12px, #666666
- Navigation links: #A0A0A0, hover to white
- Social icons: custom line icons, #A0A0A0, hover to gold
- Copyright: 12px, #444444, centered
- Top border: 1px #1A1A1A

**Content needed:**
- [ ] Social media links (Instagram, YouTube, LinkedIn, TikTok, Vimeo)
- [ ] c2luxury logo / wordmark (SVG)
- [ ] Legal text for Impressum, Datenschutz, AGB

---

## 3. Services Page Structure

### 3.1 Services Overview (/services)

**Hero:**
- Headline: "Packages Built for Luxury Properties"
- Subheadline: "From your first listing video to a full cinematic campaign — choose the production level that matches your property."
- Background: subtle video loop of mixed production footage

**Tier Comparison Section:**
Full-width comparison table with all four tiers side by side. Expandable rows for detailed feature comparison.

```
                        ESSENTIAL       PREMIUM         LUXURY          CUSTOM
                        From CHF 2,500  From CHF 5,500  From CHF 12,000 From CHF 20,000

Drone Aerial              ✓               ✓               ✓              ✓
Interior Walkthrough      ✓               ✓               ✓              ✓
FPV Drone Flythrough      —               ✓               ✓              ✓
Lifestyle Staging         —               Direction       Full talent     Custom
Color Grading             Basic           Professional    Cinema-grade    Cinema-grade
Motion Graphics           —               Title + specs   Full package    Full custom
Social Media Cuts         3               5               8+             Custom
Final Edit Length         60-90 sec       2-3 min         3-5 min        Custom
Photo Stills              —               10 frames       Full set       Custom
Virtual Tour (360)        —               —               ✓              ✓
BTS Content               —               —               ✓              ✓
Multi-language            —               —               —              ✓
Delivery Time             5 days          7 days          10 days        Custom
Pre-production            Brief           Planning        Full scouting  Custom

[Get a Quote]            [Book Now]       [Book Now]      [Contact Us]
```

**Design:**
- Sticky header row on scroll
- Gold checkmarks, gray dashes for excluded features
- "Most Popular" highlight on Premium column
- Alternating row backgrounds (#0A0A0A / #0F0F0F)

**Add-Ons Section:**
Below the comparison table, list all add-on options with pricing.

```
ENHANCE YOUR PACKAGE

Additional social media cuts (per platform)     CHF 350
Matterport 3D virtual tour                      CHF 1,200 - 2,500
Additional language version                     CHF 800
Twilight / golden hour session                  CHF 1,500
Lifestyle talent (per person / day)             CHF 800 - 1,500
Rush delivery (48 hours)                        +50% surcharge
Yearly retainer (12 projects)                   10% discount
Agency white-label (your branding)              +15% surcharge
```

**Booking Flow Section:**
Step-by-step explanation of what happens after they click "Book."

```
1. Fill out the property form (2 minutes)
2. We review and respond within 24 hours
3. 15-minute discovery call (video or phone)
4. Custom proposal with timeline and pricing
5. 50% deposit to confirm — we handle the rest
```

### 3.2 Individual Tier Pages (/services/[tier])

Each tier gets a dedicated page with:

1. **Hero:** Tier name + tagline + representative video clip
2. **What You Get:** Detailed deliverables list with descriptions
3. **Example Project:** Featured case study at this tier level
4. **Timeline:** Day-by-day production breakdown specific to this tier
5. **Pricing:** "Starting from CHF X,XXX" + what affects final pricing (property size, location, add-ons)
6. **FAQ:** 4-6 tier-specific questions (e.g., "Is FPV drone flying safe indoors?" for Premium)
7. **CTA:** "Book This Package" — links to /book with tier pre-selected

---

## 4. Portfolio Page Structure

### 4.1 Work Overview (/work)

**Hero:**
- Headline: "The Work"
- Subheadline: "Every property has a story. Here is how we tell them."
- Autoplay showreel (30 seconds, muted)

**Filter Bar:**
Sticky filter bar below hero:

```
[All]  [Residential]  [Commercial]  [Hospitality]  [Development]

[Switzerland]  [Austria]  [Germany]

[Essential]  [Premium]  [Luxury]  [Custom]
```

- Filters: pill-shaped buttons, gold border on active, gray on inactive
- Multi-select within categories, single-select between categories
- URL updates with filter state (shareable filtered views)

**Project Grid:**
```
3-column masonry grid (desktop), 2-column (tablet), 1-column (mobile)

Each card:
┌────────────────────────────┐
│                            │
│    [Video Thumbnail]       │
│    ▶ Play indicator        │
│                            │
│────────────────────────────│
│ Property Name              │
│ Location · Package Tier    │
│ Property Type · Value      │
└────────────────────────────┘
```

- Thumbnails: 16:9 video stills, lazy-loaded
- On hover: subtle zoom (1.03x), play icon appears, overlay darkens
- On click: navigates to /work/[project-slug]

### 4.2 Individual Project Page (/work/[project-slug])

**Structure:**

```
1. HERO VIDEO
   Full-width video player (Vimeo embed, privacy-enhanced)
   Property name + location overlay
   Play button centered

2. PROJECT DETAILS
   ┌──────────────────┬──────────────────┐
   │ Property Type     │ Villa            │
   │ Location          │ Zürichberg, ZH   │
   │ Property Value    │ CHF 12,500,000   │
   │ Package           │ Luxury           │
   │ Production Time   │ 10 days          │
   │ Deliverables      │ Film, 8 social   │
   │                   │ cuts, VR tour    │
   └──────────────────┴──────────────────┘

3. THE STORY
   2-3 paragraphs about the project: the brief, the challenge,
   the creative approach, the result.

4. GALLERY
   Behind-the-scenes photos (4-8 images), production stills
   Lightbox on click

5. SOCIAL MEDIA CUTS
   Embedded examples of the short-form content delivered
   (Instagram Reel, TikTok format, YouTube Short)

6. BEFORE & AFTER (if applicable)
   Split-screen slider: previous listing photos vs. c2luxury cinematic stills
   Interactive drag handle to compare

7. CLIENT TESTIMONIAL
   Quote from the agent or property owner
   With portrait, name, company

8. RELATED PROJECTS
   3 thumbnail cards linking to similar projects
   "You might also like..."

9. CTA
   "Want this for your property? [Book a Shoot →]"
```

### 4.3 Before & After Concept

For select projects where the property was previously marketed with standard photos/video:

```
┌──────────────────────────────────────────────┐
│           BEFORE          │  AFTER            │
│                           │                   │
│  [Old listing photo]      │ [c2luxury still]  │
│                           │                   │
│              ◄──||──►     │                   │
│         [drag to compare] │                   │
└──────────────────────────────────────────────┘
```

- Interactive slider handle (drag or click-and-hold)
- Works on mobile (touch drag)
- Strong visual impact — the single most convincing element for agencies

---

## 5. SEO Strategy

### 5.1 Target Keywords

**Primary keywords (highest priority):**

| Keyword | Language | Est. Monthly Searches | Competition |
|---------|----------|----------------------|-------------|
| luxury real estate videography Switzerland | EN | 50-100 | Very low |
| Immobilien Video Schweiz | DE | 200-400 | Low |
| Drohnenaufnahmen Immobilien | DE | 300-600 | Low-Medium |
| luxury property video production | EN | 100-200 | Medium |
| FPV drone real estate | EN | 200-400 | Low |
| Immobilien Drohne Schweiz | DE | 100-300 | Low |
| cinematic property tour Switzerland | EN | 30-50 | Very low |

**Secondary keywords (long-tail, blog-targeted):**

| Keyword | Content Type |
|---------|-------------|
| Immobilien Video Kosten Schweiz | Blog post |
| how much does luxury property video cost | Blog post |
| FPV Drohne Innenraum Immobilien | Blog post |
| real estate video marketing ROI | Blog post |
| Luxusimmobilien vermarkten Schweiz | Blog post |
| property video vs photography comparison | Blog post |
| best real estate videographer Zurich | Service page |
| Immobilien Videografie Zürich | Service page |
| real estate drone video DACH | Service page |
| Sotheby's listing video Switzerland | Blog post |

### 5.2 Meta Descriptions Per Page

| Page | Title Tag | Meta Description |
|------|-----------|-----------------|
| Homepage | c2luxury — Cinematic Real Estate Videography \| Switzerland & DACH | Premium real estate videography for luxury properties in Switzerland, Austria, and Germany. FPV drone, cinematic storytelling, motion graphics. Book your property showcase. |
| Services | Packages & Pricing — c2luxury Real Estate Videography | Four service tiers from CHF 2,500 to CHF 45,000+. Drone, FPV flythrough, cinematic editing, motion graphics. Choose the production level for your luxury property. |
| Work | Portfolio — c2luxury Luxury Property Films | See our cinematic property showcases across the DACH region. Luxury villas, penthouses, chalets, and developments filmed with FPV drone and cinema-grade production. |
| About | About c2luxury — The Team Behind DACH's Premier Property Films | Meet the team: Claudio Tinner (Director/FPV Pilot), Silas Wirth (Motion Design), Marcel Spatz (Post-Production). Swiss precision, cinematic vision. |
| Process | How It Works — From Brief to Cinematic Property Film | Consultation, production, post-production, delivery. See exactly how c2luxury creates cinematic real estate videos in 5-10 business days. |
| Book | Book a Shoot — c2luxury Real Estate Videography | Request a proposal for your luxury property. 15-minute discovery call, custom production plan, professional delivery. Serving Switzerland, Austria, and Germany. |
| Journal | Insights — Luxury Real Estate Video Marketing \| c2luxury | Expert insights on real estate videography, drone technology, luxury property marketing, and the DACH luxury market. |

### 5.3 Blog Topics — First 10 Posts

| # | Title | Target Keyword | Type |
|---|-------|---------------|------|
| 1 | "Why Swiss Luxury Properties Still Look Like It's 2015 — And How to Fix It" | Immobilien Video Schweiz | Thought leadership |
| 2 | "FPV Drone Tours: The Interior Flythrough That Sells Luxury Homes" | FPV drone real estate | Educational |
| 3 | "How Much Does a Luxury Property Video Cost in Switzerland? (2026 Guide)" | Immobilien Video Kosten Schweiz | Commercial intent |
| 4 | "403% More Inquiries: The ROI of Professional Real Estate Video" | real estate video marketing ROI | Data-driven |
| 5 | "Cinematic vs. Standard Property Video: A Side-by-Side Comparison" | property video vs photography | Comparison |
| 6 | "Behind the Scenes: How We Film a CHF 15M Swiss Villa" | luxury real estate videography | Process / BTS |
| 7 | "The Complete Guide to Drone Videography for Swiss Real Estate" | Drohnenaufnahmen Immobilien Schweiz | Comprehensive guide |
| 8 | "Why Motion Graphics Are the Secret Weapon in Luxury Listing Videos" | real estate motion graphics | Educational |
| 9 | "5 Mistakes Real Estate Agents Make with Property Videos (and How to Avoid Them)" | real estate video mistakes | List article |
| 10 | "Twilight Shoots: Why Golden Hour Changes Everything for Property Marketing" | twilight real estate photography | Visual storytelling |

**Content calendar:** Publish 2 posts/month. First 3 posts ready at launch, remainder on a rolling 2-week schedule.

### 5.4 Schema Markup Recommendations

| Schema Type | Where | Purpose |
|-------------|-------|---------|
| `LocalBusiness` | Homepage, About | Local SEO for "real estate videography Zurich/Switzerland" |
| `VideoObject` | Portfolio items, blog posts with video | Rich snippets in search results showing video thumbnails |
| `Service` | Services pages | Structured data for each service tier |
| `Offer` | Services pages | Pricing information for rich snippets |
| `FAQPage` | Services tier pages, blog posts | FAQ rich snippets |
| `BreadcrumbList` | All pages | Navigation breadcrumbs in search results |
| `Organization` | Homepage | Company info, logo, social profiles |
| `BlogPosting` | Journal posts | Article rich snippets with author, date, image |
| `Review` / `AggregateRating` | Homepage (testimonials) | Star rating snippets (when real reviews exist) |

### 5.5 Technical SEO

- **Sitemap:** Auto-generated XML sitemap at /sitemap.xml
- **Robots.txt:** Allow all, disallow /api/ and draft pages
- **Canonical URLs:** Self-referencing canonicals on all pages
- **Hreflang tags:** For DE/EN/FR versions when multilingual content launches
- **Open Graph + Twitter Cards:** Rich previews for social sharing (per page)
- **Image alt text:** Descriptive alt text on all portfolio images ("FPV drone interior flythrough of luxury villa in Zurich, Switzerland")
- **Page speed:** Target <2.5s LCP (see Technical Recommendations)

---

## 6. Technical Recommendations

### 6.1 Tech Stack

| Layer | Recommendation | Rationale |
|-------|---------------|-----------|
| **Framework** | Next.js 15 (App Router) | SSR/SSG for SEO, React ecosystem, image/video optimization built in, excellent Core Web Vitals |
| **Styling** | Tailwind CSS + custom design tokens | Rapid development, consistent design system, easy dark theme |
| **Animation** | Framer Motion + GSAP (ScrollTrigger) | Scroll-triggered animations, parallax, smooth transitions |
| **CMS** | Sanity.io (headless) | Visual editing for portfolio management, structured content, real-time previews, generous free tier |
| **Hosting** | Netlify or Vercel | CDN, auto-deploys, form handling, edge functions — consistent with existing c2moviez infrastructure |
| **Forms** | Netlify Forms or custom API → Supabase | Lead capture with email notification, CRM integration potential |
| **Analytics** | Plausible Analytics (GDPR-friendly) + Google Search Console | Privacy-compliant (no cookie banner needed for Plausible), search performance tracking |
| **Heatmaps** | Hotjar or Microsoft Clarity (free) | User behavior analysis, conversion optimization |

**Alternative stack (simpler, faster to build):**
- Astro + React islands (lighter, faster build, excellent for content-heavy sites)
- Consideration: if the site is mostly static with a few interactive elements, Astro may be a better fit

### 6.2 Video Hosting

| Provider | Use Case | Plan |
|----------|----------|------|
| **Vimeo Pro** (recommended) | Portfolio videos, hero loop, showreel | CHF ~200/year — no ads, privacy controls, custom player styling, excellent quality |
| **Cloudflare Stream** (alternative) | If high traffic / many videos | Pay-per-minute pricing, global CDN, adaptive bitrate |
| **Self-hosted (Netlify/Vercel)** | Only for hero loop (short, optimized) | Convert to WebM/MP4, max 10MB for hero background |

**Video optimization rules:**
- Hero loop: max 10MB, 1080p, VP9/H.265, no audio track in file
- Portfolio videos: Vimeo embed with custom player (dark theme, gold accent on play button)
- Lazy-load all videos below the fold
- Provide poster images (first frame) for instant visual while video loads

### 6.3 CMS Strategy (Sanity.io)

**Content types to model:**

```
Project {
  title: string
  slug: slug
  heroVideo: vimeoUrl
  thumbnail: image
  propertyType: "villa" | "penthouse" | "chalet" | "commercial" | "hotel" | "development"
  location: { city: string, region: string, country: "CH" | "AT" | "DE" }
  propertyValue: string
  packageTier: "essential" | "premium" | "luxury" | "custom"
  description: richText
  gallery: image[]
  socialCuts: vimeoUrl[]
  testimonial: { quote: string, author: string, company: string, portrait: image }
  beforeAfter: { before: image, after: image }
  featured: boolean
  publishedAt: date
}

BlogPost {
  title: string
  slug: slug
  excerpt: string
  body: richText (with embedded video support)
  featuredImage: image
  category: "insights" | "behind-the-scenes" | "guides" | "industry"
  tags: string[]
  author: reference -> TeamMember
  publishedAt: date
  seoTitle: string
  seoDescription: string
}

TeamMember {
  name: string
  role: string
  bio: richText
  portrait: image
  company: string
  location: string
}

Testimonial {
  quote: string
  author: string
  company: string
  portrait: image
  project: reference -> Project
}

SiteSettings {
  heroVideoUrl: string
  showreelUrl: string
  stats: { label: string, value: string }[]
  contactEmail: string
  contactPhone: string
  socialLinks: { platform: string, url: string }[]
}
```

### 6.4 Performance Targets

| Metric | Target | How |
|--------|--------|-----|
| **LCP (Largest Contentful Paint)** | < 2.5s | Optimized hero video poster, priority image loading, CDN |
| **FID (First Input Delay)** | < 100ms | Minimal JS on initial load, deferred non-critical scripts |
| **CLS (Cumulative Layout Shift)** | < 0.1 | Reserved dimensions for video/image containers, font preloading |
| **TTFB (Time to First Byte)** | < 200ms | Edge deployment (Netlify/Vercel CDN), static generation |
| **Lighthouse Performance** | > 90 | All above metrics combined |
| **Lighthouse Accessibility** | > 95 | Semantic HTML, ARIA labels, keyboard navigation, color contrast |
| **Mobile PageSpeed** | > 85 | Responsive images, reduced video quality on mobile, touch-optimized |

### 6.5 Mobile-First Responsive Approach

| Breakpoint | Layout Adjustments |
|------------|-------------------|
| **Mobile (< 768px)** | Single column, stacked cards, hamburger nav, reduced video quality, touch-friendly tap targets (min 44px), hero video replaced with optimized poster + play button |
| **Tablet (768-1024px)** | 2-column grid for portfolio and services, side navigation possible, full video hero |
| **Desktop (1025-1440px)** | Full 3-column grid, horizontal timeline, side-by-side comparisons, all animations active |
| **Wide (> 1440px)** | Max-width container (1400px), centered, increased spacing |

**Mobile-specific considerations:**
- Hero: still image with play button on mobile (save bandwidth), autoplay only on desktop/wifi
- Portfolio grid: 1 column with larger thumbnails
- Service tiers: horizontal scroll carousel instead of 4-column layout
- Process timeline: vertical instead of horizontal
- Touch: swipe for testimonials, pull-to-refresh feel
- Bottom sticky CTA bar on mobile: "Book a Shoot" always accessible

---

## 7. Content Production Needed

### 7.1 Video Content

| Asset | Description | Priority | Status |
|-------|-------------|----------|--------|
| **Hero loop** | 15-20 second seamless loop — best FPV/drone/interior shots | Launch-critical | Needs spec shoot footage |
| **Showreel** | 30-60 second highlight reel — comprehensive capability showcase | Launch-critical | Needs spec shoot footage |
| **Spec project videos (3-4)** | Full production at Premium level — different property types | Launch-critical | Schedule spec shoots |
| **Social media cuts (per project)** | 15-60 second cuts for Instagram, TikTok, YouTube Shorts | Launch-critical | Cut from spec shoots |
| **Process explainer** | 30-second motion graphic showing the 4-step process | Phase 2 | Silas to produce |
| **BTS footage** | Behind-the-scenes clips of shoots (drone launch, gear setup) | Phase 2 | Capture during spec shoots |

### 7.2 Photography

| Asset | Description | Priority |
|-------|-------------|----------|
| **Team portraits (x3)** | CTI, Silas, Marcel — matching style, dark background, cinematic lighting | Launch-critical |
| **Production stills** | On-set photos from spec shoots (drone in flight, team working, equipment) | Launch-critical |
| **Property stills** | High-quality video frame exports for portfolio thumbnails | Launch-critical |
| **Equipment shots** | Hero shots of drone, FPV rig, camera setup — for about page | Nice-to-have |

### 7.3 Design Assets

| Asset | Description | Priority |
|-------|-------------|----------|
| **c2luxury logo / wordmark** | Gold version, white version, SVG, multiple sizes | Launch-critical |
| **c2luxury favicon** | 32x32, 180x180 (Apple touch), SVG | Launch-critical |
| **Open Graph image** | 1200x630 branded image for social sharing | Launch-critical |
| **DACH coverage map** | Custom SVG map of Switzerland, Austria, Germany | Launch-critical |
| **Service tier icons** | 4 icons representing each tier level | Nice-to-have (can use text only) |
| **Process step icons** | 4 icons for Consult/Produce/Refine/Deliver | Nice-to-have |
| **Gold checkmark icon** | For service comparison table | Launch-critical |
| **Social media icons** | Instagram, YouTube, LinkedIn, TikTok, Vimeo — line style | Launch-critical |

### 7.4 Copywriting

| Asset | Description | Priority |
|-------|-------------|----------|
| **Homepage copy** | All section headlines, body text, CTAs (EN + DE) | Launch-critical |
| **Service descriptions** | Detailed copy per tier, add-on descriptions | Launch-critical |
| **Team bios** | 2-3 sentences per team member (EN + DE) | Launch-critical |
| **Process descriptions** | Step-by-step copy for the process section | Launch-critical |
| **FAQ content** | 8-12 questions and answers for services pages | Launch (can be Phase 2) |
| **Blog posts (3)** | First 3 SEO-optimized articles ready at launch | Launch-critical |
| **Legal pages** | Impressum, Datenschutz (DSGVO/DSG compliant), AGB | Launch-critical |
| **Meta descriptions** | Per-page SEO meta descriptions (EN + DE) | Launch-critical |
| **404 page copy** | On-brand "page not found" message | Nice-to-have |

### 7.5 Content Ownership Checklist

| Item | Owner | Deadline |
|------|-------|----------|
| Spec property access (2-3 properties) | CTI (personal network, agency contacts) | Week 1-2 |
| Spec shoot scheduling | CTI + Silas | Week 2 |
| Spec shoot production | CTI (shoot) + Marcel (post) + Silas (MoGraph) | Week 2-4 |
| Team portrait session | CTI (arrange photographer or self-shoot) | Week 2 |
| Logo / wordmark design | Silas | Week 1 |
| DACH map SVG | Silas or developer | Week 3 |
| Homepage + services copy (EN) | CTI + EXEO | Week 2-3 |
| Homepage + services copy (DE) | CTI (review) | Week 3-4 |
| Legal pages | CTI (legal template or lawyer) | Week 3 |
| Blog posts (3) | CTI + EXEO | Week 4-5 |

---

## 8. Launch Timeline

### Phase 1: Foundation — Weeks 1-2

| Task | Owner | Deliverable |
|------|-------|-------------|
| Register c2luxury.com domain | CTI | Domain secured, DNS configured |
| Logo and wordmark design | Silas | SVG logo files (gold, white, dark variants) |
| Wireframes / design mockups | Silas + CTI | Figma mockups of homepage + services + work |
| Tech stack setup | Developer / CTI | Next.js project scaffolded, Netlify connected, Sanity studio configured |
| Content strategy finalized | CTI + EXEO | Final copy outline, blog topic calendar |
| Photography session (team) | CTI | 3 professional portraits |
| Begin spec property outreach | CTI | 2-3 properties confirmed for spec shoots |

### Phase 2: Content Production — Weeks 2-4 (parallel with development)

| Task | Owner | Deliverable |
|------|-------|-------------|
| Spec shoot #1 (e.g., luxury apartment) | CTI + Silas | Raw footage, BTS photos |
| Spec shoot #2 (e.g., villa or chalet) | CTI + Silas | Raw footage, BTS photos |
| Post-production: spec project #1 | Marcel + Silas | Final video, social cuts, stills |
| Post-production: spec project #2 | Marcel + Silas | Final video, social cuts, stills |
| Hero loop edit | Marcel | 15-20s seamless loop |
| Showreel edit | Marcel + Silas | 30-60s highlight reel |
| Homepage copy (EN + DE) | CTI + EXEO | Final approved copy |
| Services copy (EN + DE) | CTI + EXEO | Final approved copy |
| Blog posts 1-3 drafted | EXEO | Draft articles for CTI review |

### Phase 3: Development — Weeks 2-5 (parallel with content)

| Task | Owner | Deliverable |
|------|-------|-------------|
| Homepage development | Developer | All 11 sections built, responsive, animated |
| Services page development | Developer | Overview + comparison table, tier sub-pages |
| Portfolio page development | Developer | Grid, filters, individual project template |
| About page development | Developer | Team section, company story |
| Process page development | Developer | Animated timeline |
| Contact/Book page development | Developer | Form with validation, email notification |
| Blog/Journal template | Developer | List page + individual post template |
| Legal pages | Developer / CTI | Impressum, Datenschutz, AGB |
| CMS integration (Sanity) | Developer | Portfolio + blog content editable via CMS |
| Video integration (Vimeo) | Developer | Custom player styling, lazy loading |
| SEO implementation | Developer | Meta tags, schema markup, sitemap, OG tags |
| Mobile optimization | Developer | All breakpoints tested, touch interactions |
| Performance optimization | Developer | Core Web Vitals targets met |

### Phase 4: QA + Soft Launch — Week 5

| Task | Owner | Deliverable |
|------|-------|-------------|
| Cross-browser testing | Developer | Chrome, Safari, Firefox, Edge verified |
| Mobile device testing | Developer + CTI | iOS Safari, Android Chrome verified |
| Content review (all pages) | CTI | Copy approved, no placeholders remaining |
| Video playback testing | Developer | All videos load, play, responsive |
| Form testing | Developer + CTI | Submissions received, notifications working |
| SEO audit | Developer / EXEO | All meta tags, schema, sitemap verified |
| Analytics verification | Developer | Plausible + GSC tracking confirmed |
| Soft launch (unlisted) | Developer | Site live at c2luxury.com, not yet promoted |
| Internal review | CTI + Silas + Marcel | Team walkthrough, final feedback |

### Phase 5: Public Launch + Marketing — Week 6

| Task | Owner | Deliverable |
|------|-------|-------------|
| DNS cutover / go-live | Developer / CTI | c2luxury.com live and indexed |
| Google Search Console submission | Developer | Sitemap submitted, indexing requested |
| Social media announcement | CTI | Launch posts on Instagram, LinkedIn, YouTube |
| First blog posts published | CTI | 3 articles live |
| Email to existing network | CTI | Personal outreach to warm contacts |
| Agency outreach begins | CTI | First 10 personalized emails to target agencies |
| Google Business Profile | CTI | "c2luxury" / "c2moviez real estate videography" listed |
| Monitor analytics + fix issues | Developer | First-week performance review |

### Phase 6: Growth + Iteration — Weeks 7-12

| Task | Owner | Deliverable |
|------|-------|-------------|
| Add real client projects to portfolio | CTI | CMS updates as projects complete |
| Collect and publish testimonials | CTI | Real client quotes on homepage |
| Blog publishing cadence (2/month) | CTI + EXEO | Ongoing SEO content |
| Social media content cadence | CTI + Silas | 4-5 posts/week |
| A/B test CTAs | Developer / CTI | Optimize conversion rate |
| Add German language version | Developer / CTI | Full DE translation of key pages |
| Monthly analytics review | CTI + EXEO | Traffic, leads, conversion analysis |
| Update stats section with real data | CTI | Replace placeholder numbers |
| Iterate based on user behavior (Hotjar) | Developer + CTI | UX improvements |

---

## 9. Budget Estimate

| Category | Item | Estimated Cost (CHF) |
|----------|------|---------------------|
| **Domain** | c2luxury.com (annual) | 15 - 30 |
| **Hosting** | Netlify Pro (annual) | 230 |
| **Video hosting** | Vimeo Pro (annual) | 200 |
| **CMS** | Sanity.io (free tier to start) | 0 |
| **Analytics** | Plausible (annual) | 100 |
| **Design** | Logo, icons, map (Silas — partner rate) | 500 - 1,000 |
| **Development** | Website build (3-4 weeks) | 3,000 - 6,000 (depends on in-house vs. external) |
| **Content** | Spec shoot production costs (2 shoots) | 1,000 - 2,000 (talent, travel, props) |
| **Photography** | Team portraits session | 300 - 500 |
| **Legal** | Legal page templates / lawyer review | 300 - 800 |
| **Total launch budget** | | **CHF 5,645 - 10,860** |

*Note: This aligns with the CHF 5,000 "Landing page + branding" budget line in the strategy document. The lower range is achievable if development is handled in-house and Silas handles design at partner rate.*

---

## 10. Success Metrics (Post-Launch)

| Metric | Target (Month 1) | Target (Month 3) | Target (Month 6) |
|--------|-------------------|-------------------|-------------------|
| Monthly unique visitors | 100 | 500 | 1,500 |
| Avg. session duration | > 2 min | > 2.5 min | > 3 min |
| Bounce rate | < 60% | < 50% | < 45% |
| Contact form submissions / month | 3 | 10 | 20 |
| Form-to-call conversion rate | 50% | 60% | 65% |
| Portfolio video plays | 50 | 200 | 500 |
| Blog organic traffic | 20 | 100 | 400 |
| Google ranking for primary keywords | Top 50 | Top 20 | Top 10 |
| Social media referral traffic | 10% | 15% | 20% |

---

## Appendix A: Design Reference Board

**Visual references to share with designer/developer:**

| Reference | What to Take From It | URL |
|-----------|---------------------|-----|
| Sotheby's International Realty | Dark luxury aesthetic, typography, property presentation | sothebysrealty.com |
| Luxury Presence | Service packaging for real estate, clean layout | luxurypresence.com |
| A24 Films | Dark cinematic portfolio, video-first, minimal text | a24films.com |
| Apple Pro (product pages) | Scroll animations, parallax, premium feel | apple.com/macbook-pro |
| Studiocanal | Film studio portfolio layout, dark theme | studiocanal.com |
| The Boutique RE Group | Real estate video integration on agency site | theboutiquere.com |
| Jason Oppenheim Group | Luxury listings with video, dark aesthetic | ogroup.com |

**Mood keywords:** Cinematic, dark, editorial, precise, quiet luxury, restrained, confident, premium, Swiss, timeless.

---

## Appendix B: Competitor Website Audit Checklist

Before finalizing design, audit these competitor sites for UX patterns:

- [ ] How do US luxury RE studios display video portfolios?
- [ ] How do Sotheby's/E&V display individual property listings with video?
- [ ] What CTAs do luxury service sites use? (language, placement, color)
- [ ] How do film studio portfolios handle video loading and playback?
- [ ] What mobile patterns work best for video-heavy sites?
- [ ] How do competitors handle multilingual content?

---

*This proposal is ready for developer/designer handoff. All sections include specific content requirements, interaction descriptions, and technical specifications. The phased approach ensures a launch-critical site can go live in 5-6 weeks with content production running in parallel.*

*Prepared by EXEO (AI COO) for Claudio Tinner, c2moviez GmbH — 16 April 2026*
