import type { DesignSource } from './design-source';

const aiApply = ['Prompt-first shell', 'Model routing chip', 'Artifact pane'];
const devApply = ['Top command rail', 'Fast command palette', 'Calm task surfaces'];
const backendApply = ['Dense data panels', 'Status-aware cards', 'Plain-language labels'];
const productivityApply = ['One dominant action', 'Clear list hierarchies', 'Noisy chrome removal'];
const creativeApply = ['Image-led hierarchy', 'Fewer but stronger surfaces', 'Tighter spacing rhythm'];
const fintechApply = ['Trust-first hierarchy', 'High-contrast CTAs', 'Clear status states'];
const commerceApply = ['Full-bleed landing hero', 'Clean route naming', 'Simple conversion path'];
const mediaApply = ['Editorial rhythm', 'Strong type scale', 'Section-driven layout'];
const automotiveApply = ['Premium landing hero', 'Sharp visual hierarchy', 'Minimal chrome'];

const aiLlm: DesignSource[] = [
    {
        id: 'claude',
        name: 'Claude',
        url: 'https://getdesign.md/claude/design-md',
        signal: ['Warm editorial tone', 'Calm assistant framing', 'Readable dense composition'],
        applyToYuri: aiApply
    },
    {
        id: 'cohere',
        name: 'Cohere',
        url: 'https://getdesign.md/cohere/design-md',
        signal: ['Gradient-rich enterprise energy', 'Data-forward dashboard feel', 'High clarity for complex AI'],
        applyToYuri: aiApply
    },
    {
        id: 'elevenlabs',
        name: 'ElevenLabs',
        url: 'https://getdesign.md/elevenlabs/design-md',
        signal: ['Cinematic dark surfaces', 'Audio waveform emphasis', 'Motion-friendly highlights'],
        applyToYuri: aiApply
    },
    {
        id: 'minimax',
        name: 'MiniMax',
        url: 'https://getdesign.md/minimax/design-md',
        signal: ['Neon-accented dark UI', 'Premium model-provider energy', 'Bold experimental framing'],
        applyToYuri: aiApply
    },
    {
        id: 'mistral-ai',
        name: 'Mistral AI',
        url: 'https://getdesign.md/mistral-ai/design-md',
        signal: ['French minimalism', 'Purple-toned confidence', 'Open-weight technical clarity'],
        applyToYuri: aiApply
    },
    {
        id: 'ollama',
        name: 'Ollama',
        url: 'https://getdesign.md/ollama/design-md',
        signal: ['Terminal-first simplicity', 'Local runtime framing', 'Monochrome utility'],
        applyToYuri: aiApply
    },
    {
        id: 'opencode-ai',
        name: 'OpenCode AI',
        url: 'https://getdesign.md/opencode-ai/design-md',
        signal: ['Developer-centric dark theme', 'Code-native composition', 'Tooling over decoration'],
        applyToYuri: aiApply
    },
    {
        id: 'replicate',
        name: 'Replicate',
        url: 'https://getdesign.md/replicate/design-md',
        signal: ['White canvas', 'Code-forward product language', 'Model execution clarity'],
        applyToYuri: aiApply
    },
    {
        id: 'runwayml',
        name: 'RunwayML',
        url: 'https://getdesign.md/runwayml/design-md',
        signal: ['Cinematic media layout', 'Dark creative tooling', 'Artifact-led storytelling'],
        applyToYuri: aiApply
    },
    {
        id: 'together-ai',
        name: 'Together AI',
        url: 'https://getdesign.md/together-ai/design-md',
        signal: ['Blueprint-style technical design', 'Infrastructure tone', 'Serious agent workload framing'],
        applyToYuri: aiApply
    },
    {
        id: 'voltagent',
        name: 'VoltAgent',
        url: 'https://getdesign.md/voltagent/design-md',
        signal: ['Void-black canvas', 'Emerald terminal accent', 'Agent-native posture'],
        applyToYuri: aiApply
    },
    {
        id: 'xai',
        name: 'xAI',
        url: 'https://getdesign.md/x.ai/design-md',
        signal: ['Stark monochrome', 'Future-facing minimalism', 'Very low decoration'],
        applyToYuri: aiApply
    }
];

const developerTools: DesignSource[] = [
    {
        id: 'cursor',
        name: 'Cursor',
        url: 'https://getdesign.md/cursor/design-md',
        signal: ['Sleek dark editor feel', 'Gradient accents', 'AI-first workflow language'],
        applyToYuri: devApply
    },
    {
        id: 'expo',
        name: 'Expo',
        url: 'https://getdesign.md/expo/design-md',
        signal: ['Code-centric dark theme', 'Tight letter-spacing', 'Mobile-dev clarity'],
        applyToYuri: devApply
    },
    {
        id: 'lovable',
        name: 'Lovable',
        url: 'https://getdesign.md/lovable/design-md',
        signal: ['Playful gradients', 'Friendly builder tone', 'Low-friction onboarding'],
        applyToYuri: devApply
    },
    {
        id: 'raycast',
        name: 'Raycast',
        url: 'https://getdesign.md/raycast/design-md',
        signal: ['Dark chrome surfaces', 'Launcher-style density', 'Fast scanning'],
        applyToYuri: devApply
    },
    {
        id: 'superhuman',
        name: 'Superhuman',
        url: 'https://getdesign.md/superhuman/design-md',
        signal: ['Premium keyboard-first feel', 'Purple glow accent', 'Speed as the visual story'],
        applyToYuri: devApply
    },
    {
        id: 'vercel',
        name: 'Vercel',
        url: 'https://getdesign.md/vercel/design-md',
        signal: ['Black and white precision', 'Geist typography energy', 'Developer-deployed clarity'],
        applyToYuri: devApply
    },
    {
        id: 'warp',
        name: 'Warp',
        url: 'https://getdesign.md/warp/design-md',
        signal: ['IDE-like terminal', 'Block-based command UI', 'Warm-dark editor tone'],
        applyToYuri: devApply
    }
];

const backendDevops: DesignSource[] = [
    {
        id: 'clickhouse',
        name: 'ClickHouse',
        url: 'https://getdesign.md/clickhouse/design-md',
        signal: ['Yellow technical accent', 'Documentation-first structure', 'High data density'],
        applyToYuri: backendApply
    },
    {
        id: 'composio',
        name: 'Composio',
        url: 'https://getdesign.md/composio/design-md',
        signal: ['Modern dark integration UI', 'Electric icon palette', 'Tooling clarity'],
        applyToYuri: backendApply
    },
    {
        id: 'hashicorp',
        name: 'HashiCorp',
        url: 'https://getdesign.md/hashicorp/design-md',
        signal: ['Enterprise-clean monochrome', 'Infrastructure confidence', 'Controlled density'],
        applyToYuri: backendApply
    },
    {
        id: 'mongodb',
        name: 'MongoDB',
        url: 'https://getdesign.md/mongodb/design-md',
        signal: ['Developer documentation focus', 'Green identity', 'Operational clarity'],
        applyToYuri: backendApply
    },
    {
        id: 'posthog',
        name: 'PostHog',
        url: 'https://getdesign.md/posthog/design-md',
        signal: ['Playful product analytics', 'Dark UI with personality', 'Clear event-story surfaces'],
        applyToYuri: backendApply
    },
    {
        id: 'sanity',
        name: 'Sanity',
        url: 'https://getdesign.md/sanity/design-md',
        signal: ['Red editorial accent', 'Content-first layout', 'Structured authoring tools'],
        applyToYuri: backendApply
    },
    {
        id: 'sentry',
        name: 'Sentry',
        url: 'https://getdesign.md/sentry/design-md',
        signal: ['Dark dashboard', 'Pink-purple accent', 'Incident clarity'],
        applyToYuri: backendApply
    },
    {
        id: 'supabase',
        name: 'Supabase',
        url: 'https://getdesign.md/supabase/design-md',
        signal: ['Emerald dark mode', 'Code-first tone', 'Border-defined depth'],
        applyToYuri: backendApply
    }
];

const productivitySaas: DesignSource[] = [
    {
        id: 'cal-com',
        name: 'Cal.com',
        url: 'https://getdesign.md/cal-com/design-md',
        signal: ['Neutral scheduling UI', 'Developer-friendly simplicity', 'Clean conversion flow'],
        applyToYuri: productivityApply
    },
    {
        id: 'intercom',
        name: 'Intercom',
        url: 'https://getdesign.md/intercom/design-md',
        signal: ['Friendly blue palette', 'Conversational system', 'Helpful product guidance'],
        applyToYuri: productivityApply
    },
    {
        id: 'linear',
        name: 'Linear',
        url: 'https://getdesign.md/linear/design-md',
        signal: ['Ultra-minimal precision', 'Purple accent discipline', 'Fast scanning'],
        applyToYuri: productivityApply
    },
    {
        id: 'mintlify',
        name: 'Mintlify',
        url: 'https://getdesign.md/mintlify/design-md',
        signal: ['Reading-optimized docs', 'Green accent restraint', 'Clear information hierarchy'],
        applyToYuri: productivityApply
    },
    {
        id: 'notion',
        name: 'Notion',
        url: 'https://getdesign.md/notion/design-md',
        signal: ['Warm minimalism', 'Serif headers', 'Soft surfaces and calm spacing'],
        applyToYuri: productivityApply
    },
    {
        id: 'resend',
        name: 'Resend',
        url: 'https://getdesign.md/resend/design-md',
        signal: ['Minimal dark theme', 'Monospace accents', 'API-first clarity'],
        applyToYuri: productivityApply
    },
    {
        id: 'zapier',
        name: 'Zapier',
        url: 'https://getdesign.md/zapier/design-md',
        signal: ['Warm orange brand energy', 'Friendly illustration feel', 'Automation simplicity'],
        applyToYuri: productivityApply
    }
];

const designCreative: DesignSource[] = [
    {
        id: 'airtable',
        name: 'Airtable',
        url: 'https://getdesign.md/airtable/design-md',
        signal: ['Colorful structured data', 'Friendly product polish', 'Spreadsheet-to-app clarity'],
        applyToYuri: creativeApply
    },
    {
        id: 'clay',
        name: 'Clay',
        url: 'https://getdesign.md/clay/design-md',
        signal: ['Organic shapes', 'Soft gradients', 'Art-directed composition'],
        applyToYuri: creativeApply
    },
    {
        id: 'figma',
        name: 'Figma',
        url: 'https://getdesign.md/figma/design-md',
        signal: ['Vibrant multi-color system', 'Playful professional tone', 'Tool-first composition'],
        applyToYuri: creativeApply
    },
    {
        id: 'framer',
        name: 'Framer',
        url: 'https://getdesign.md/framer/design-md',
        signal: ['Black-and-blue motion focus', 'Design-forward marketing style', 'Sharp landing rhythm'],
        applyToYuri: creativeApply
    },
    {
        id: 'miro',
        name: 'Miro',
        url: 'https://getdesign.md/miro/design-md',
        signal: ['Infinite canvas energy', 'Bright yellow accent', 'Collaborative play'],
        applyToYuri: creativeApply
    },
    {
        id: 'webflow',
        name: 'Webflow',
        url: 'https://getdesign.md/webflow/design-md',
        signal: ['Polished marketing surfaces', 'Blue-accented confidence', 'CMS and builder balance'],
        applyToYuri: creativeApply
    }
];

const fintechCrypto: DesignSource[] = [
    {
        id: 'binance',
        name: 'Binance',
        url: 'https://getdesign.md/binance/design-md',
        signal: ['Bold yellow on monochrome', 'Trading-floor urgency', 'Highly visible state cues'],
        applyToYuri: fintechApply
    },
    {
        id: 'coinbase',
        name: 'Coinbase',
        url: 'https://getdesign.md/coinbase/design-md',
        signal: ['Clean blue trust system', 'Institutional clarity', 'Simple money flows'],
        applyToYuri: fintechApply
    },
    {
        id: 'kraken',
        name: 'Kraken',
        url: 'https://getdesign.md/kraken/design-md',
        signal: ['Purple-accented dark dashboards', 'Data-dense trading surfaces', 'High contrast control'],
        applyToYuri: fintechApply
    },
    {
        id: 'mastercard',
        name: 'Mastercard',
        url: 'https://getdesign.md/mastercard/design-md',
        signal: ['Warm cream editorial canvas', 'Orbital pill shapes', 'Premium payments framing'],
        applyToYuri: fintechApply
    },
    {
        id: 'revolut',
        name: 'Revolut',
        url: 'https://getdesign.md/revolut/design-md',
        signal: ['Sleek dark banking', 'Gradient card polish', 'Fintech precision'],
        applyToYuri: fintechApply
    },
    {
        id: 'stripe',
        name: 'Stripe',
        url: 'https://getdesign.md/stripe/design-md',
        signal: ['Purple gradient signature', 'Weight-300 elegance', 'Infrastructure confidence'],
        applyToYuri: fintechApply
    },
    {
        id: 'wise',
        name: 'Wise',
        url: 'https://getdesign.md/wise/design-md',
        signal: ['Bright green clarity', 'Friendly money-transfer tone', 'Borderless utility'],
        applyToYuri: fintechApply
    }
];

const ecommerceRetail: DesignSource[] = [
    {
        id: 'airbnb',
        name: 'Airbnb',
        url: 'https://getdesign.md/airbnb/design-md',
        signal: ['Photography-driven retail flow', 'Warm coral accent', 'Rounded approachable UI'],
        applyToYuri: commerceApply
    },
    {
        id: 'meta',
        name: 'Meta',
        url: 'https://getdesign.md/meta/design-md',
        signal: ['Photography-first retail store feel', 'Binary light/dark surfaces', 'Strong CTA contrast'],
        applyToYuri: commerceApply
    },
    {
        id: 'nike',
        name: 'Nike',
        url: 'https://getdesign.md/nike/design-md',
        signal: ['Monochrome with impact', 'Massive uppercase type', 'Full-bleed hero energy'],
        applyToYuri: commerceApply
    },
    {
        id: 'shopify',
        name: 'Shopify',
        url: 'https://getdesign.md/shopify/design-md',
        signal: ['Dark-first cinematic commerce', 'Neon green accent', 'Very light display type'],
        applyToYuri: commerceApply
    },
    {
        id: 'starbucks',
        name: 'Starbucks',
        url: 'https://getdesign.md/starbucks/design-md',
        signal: ['Four-tier green system', 'Warm cream canvas', 'Premium retail warmth'],
        applyToYuri: commerceApply
    }
];

const mediaConsumer: DesignSource[] = [
    {
        id: 'apple',
        name: 'Apple',
        url: 'https://getdesign.md/apple/design-md',
        signal: ['Premium white space', 'Cinematic imagery', 'Carefully controlled hierarchy'],
        applyToYuri: mediaApply
    },
    {
        id: 'ibm',
        name: 'IBM',
        url: 'https://getdesign.md/ibm/design-md',
        signal: ['Carbon design system feel', 'Structured blue palette', 'Enterprise clarity'],
        applyToYuri: mediaApply
    },
    {
        id: 'nvidia',
        name: 'NVIDIA',
        url: 'https://getdesign.md/nvidia/design-md',
        signal: ['Green-black energy', 'Technical power aesthetic', 'High performance tone'],
        applyToYuri: mediaApply
    },
    {
        id: 'pinterest',
        name: 'Pinterest',
        url: 'https://getdesign.md/pinterest/design-md',
        signal: ['Red accent discovery grid', 'Image-first layout', 'Masonry rhythm'],
        applyToYuri: mediaApply
    },
    {
        id: 'playstation',
        name: 'PlayStation',
        url: 'https://getdesign.md/playstation/design-md',
        signal: ['Three-surface channel layout', 'Quiet authority display type', 'Cyan hover scale'],
        applyToYuri: mediaApply
    },
    {
        id: 'spacex',
        name: 'SpaceX',
        url: 'https://getdesign.md/spacex/design-md',
        signal: ['Black-white futurism', 'Full-bleed imagery', 'Exploration posture'],
        applyToYuri: mediaApply
    },
    {
        id: 'spotify',
        name: 'Spotify',
        url: 'https://getdesign.md/spotify/design-md',
        signal: ['Vibrant green on dark', 'Album-art-driven layout', 'Bold type rhythm'],
        applyToYuri: mediaApply
    },
    {
        id: 'the-verge',
        name: 'The Verge',
        url: 'https://getdesign.md/the-verge/design-md',
        signal: ['Acid-mint and ultraviolet accents', 'Editorial story tiles', 'Strong magazine cadence'],
        applyToYuri: mediaApply
    },
    {
        id: 'uber',
        name: 'Uber',
        url: 'https://getdesign.md/uber/design-md',
        signal: ['Black-white urban energy', 'Tight type', 'Movement-first composition'],
        applyToYuri: mediaApply
    },
    {
        id: 'vodafone',
        name: 'Vodafone',
        url: 'https://getdesign.md/vodafone/design-md',
        signal: ['Monumental uppercase display', 'Red chapter bands', 'Telecom authority'],
        applyToYuri: mediaApply
    },
    {
        id: 'wired',
        name: 'WIRED',
        url: 'https://getdesign.md/wired/design-md',
        signal: ['Broadsheet density', 'Custom serif display', 'Ink-blue editorial links'],
        applyToYuri: mediaApply
    }
];

const automotive: DesignSource[] = [
    {
        id: 'bmw',
        name: 'BMW',
        url: 'https://getdesign.md/bmw/design-md',
        signal: ['Dark premium surfaces', 'Precise German engineering tone', 'Sharp cleanliness'],
        applyToYuri: automotiveApply
    },
    {
        id: 'bugatti',
        name: 'Bugatti',
        url: 'https://getdesign.md/bugatti/design-md',
        signal: ['Cinema-black canvas', 'Monumental austerity', 'Luxury minimalism'],
        applyToYuri: automotiveApply
    },
    {
        id: 'ferrari',
        name: 'Ferrari',
        url: 'https://getdesign.md/ferrari/design-md',
        signal: ['Chiaroscuro editorial', 'Ferrari red accents', 'High-drama sparseness'],
        applyToYuri: automotiveApply
    },
    {
        id: 'lamborghini',
        name: 'Lamborghini',
        url: 'https://getdesign.md/lamborghini/design-md',
        signal: ['True black cathedral', 'Gold accent', 'Aggressive premium geometry'],
        applyToYuri: automotiveApply
    },
    {
        id: 'renault',
        name: 'Renault',
        url: 'https://getdesign.md/renault/design-md',
        signal: ['Aurora gradients', 'Zero-radius button language', 'Bold automotive vitality'],
        applyToYuri: automotiveApply
    },
    {
        id: 'tesla',
        name: 'Tesla',
        url: 'https://getdesign.md/tesla/design-md',
        signal: ['Radical subtraction', 'Near-zero UI', 'Cinematic full-viewport photography'],
        applyToYuri: automotiveApply
    }
];

export const getdesignMdCatalog: DesignSource[] = [
    ...aiLlm,
    ...developerTools,
    ...backendDevops,
    ...productivitySaas,
    ...designCreative,
    ...fintechCrypto,
    ...ecommerceRetail,
    ...mediaConsumer,
    ...automotive
];
