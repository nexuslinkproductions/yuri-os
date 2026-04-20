# Nexus Link Productions — Landing Page

Premium video production & post-production website.

## Stack

- **Framework:** Next.js 14+ (TypeScript)
- **Styling:** Tailwind CSS + custom CSS
- **Hosting:** Ready for Vercel / self-hosted

## Brand Compliance

- **Background:** Dark (`#000000`, `#0A0A0A`, `#121212`)
- **Accent:** Crimson (`#DC143C`), used sparingly
- **Typography:** Clean, modern sans-serif, high-contrast hierarchy
- **Aesthetic:** Premium · Futuristic · Minimal

## Structure

```
src/
├── app/
│   ├── layout.tsx       (root layout)
│   ├── page.tsx         (home)
│   └── globals.css      (global styles)
├── components/
│   ├── Header.tsx       (navigation + logo)
│   ├── Hero.tsx         (main hero section)
│   ├── Services.tsx     (services grid)
│   ├── Portfolio.tsx    (work showcase)
│   ├── Contact.tsx      (contact section)
│   └── Footer.tsx       (footer)
public/
├── logos/               (LOGO INTEGRATION HERE)
├── images/              (portfolio / hero images)
└── videos/              (hero reel video)
```

## Setup

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm build

# Start production server
npm start
```

Server runs on `http://localhost:3000` by default.

## Next Steps

1. **Logo Integration:**
   - Add logo files to `public/logos/`
   - Update Header.tsx with actual logo (replace placeholder)

2. **Content Integration:**
   - Update Hero section with real copy and reel
   - Add portfolio projects (cases studies with images/videos)
   - Update Services with final descriptions

3. **Forms & Interactivity:**
   - Wire up contact form (email service integration)
   - Add analytics (GA, Posthog, etc.)
   - Add scroll animations if needed

4. **Deployment:**
   - Deploy to Vercel (native Next.js support)
   - Configure custom domain
   - Set up SSL/TLS

## Customization

All colors are defined in `tailwind.config.ts` and `src/app/globals.css`. Update the `colors` object in the Tailwind config to modify the brand palette.

Brand standards live in `/Volumes/T7/.claude/rules/brand-standards.md`.
