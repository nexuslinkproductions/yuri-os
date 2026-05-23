import path from 'path';
import fs from 'fs';
import https from 'https';

const CONTENT_DIR = '/Users/marcelspatz/GeneratedContent';
const IMAGES_DIR  = path.join(CONTENT_DIR, 'images');
const VIDEOS_DIR  = path.join(CONTENT_DIR, 'videos');
const PROFILE_DIR = path.join(CONTENT_DIR, '.browser-profile');

export interface BrowserGenOptions {
    prompt: string;
    modelId?: string;
    provider: 'chatgpt-web';
}

export interface BrowserGenResult {
    urls: string[];
    localPaths: string[];
    provider: string;
    model: string;
}

function ensureDirs() {
    [IMAGES_DIR, VIDEOS_DIR, PROFILE_DIR].forEach(d => {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });
}

async function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, res => {
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', reject);
    });
}

async function checkPlaywright(): Promise<boolean> {
    try {
        require.resolve('playwright');
        return true;
    } catch {
        return false;
    }
}

async function generateChatGPT(prompt: string, modelId: string): Promise<BrowserGenResult> {
    const { chromium } = require('playwright');
    ensureDirs();

    const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        args: ['--no-sandbox'],
        viewport: { width: 1280, height: 800 }
    });

    const page = browser.pages()[0] || await browser.newPage();
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Check login state
    const isLoggedOut = await page.locator('[data-testid="login-button"], button:has-text("Log in")').count() > 0;
    if (isLoggedOut) {
        await browser.close();
        throw new Error('ChatGPT: not logged in — open the browser profile and log in once manually');
    }

    // Type prompt (image generation request)
    const textarea = page.locator('#prompt-textarea, [contenteditable="true"]').first();
    await textarea.click();
    await textarea.fill(`Generate an image: ${prompt}`);
    await page.keyboard.press('Enter');

    // Wait for image to appear (up to 60s)
    const imgLocator = page.locator('img[alt*="generated"], img[src*="oaiusercontent"], .dalle-image img').first();
    await imgLocator.waitFor({ state: 'visible', timeout: 60000 });

    const imgSrc = await imgLocator.getAttribute('src') || '';
    const timestamp = Date.now();
    const filename = `chatgpt-${timestamp}.png`;
    const localPath = path.join(IMAGES_DIR, filename);

    if (imgSrc.startsWith('http')) {
        await downloadFile(imgSrc, localPath);
    }

    await browser.close();
    return { urls: [imgSrc], localPaths: [localPath], provider: 'chatgpt-web', model: modelId || 'chatgpt-images-2' };
}

class BrowserAutomation {
    async generate(options: BrowserGenOptions): Promise<BrowserGenResult> {
        const available = await checkPlaywright();
        if (!available) {
            throw new Error(
                'browser_automation_unavailable — run: cd backend && npm install playwright && npx playwright install chromium'
            );
        }

        const { prompt, modelId = '', provider } = options;

        if (provider === 'chatgpt-web') {
            return generateChatGPT(prompt, modelId);
        }

        throw new Error(`Unknown provider: ${provider}`);
    }

    async isAvailable(): Promise<boolean> {
        return checkPlaywright();
    }
}

export const browserAutomation = new BrowserAutomation();
