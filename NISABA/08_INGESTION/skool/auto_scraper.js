const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const userDataDir = path.join(__dirname, 'playwright_data');

(async () => {
  console.log('🚀 Starting NUDIMMUD Autonomous Skool Scraper...');
  
  // Launch browser with persistent context to keep login session
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // User can see the browser initially, or change to true later
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  
  console.log('Navigating to Chase AI Community...');
  await page.goto('https://www.skool.com/chase-ai-community', { waitUntil: 'domcontentloaded' });

  // Check if we need to log in
  const needLogin = await page.evaluate(() => {
    const text = document.body.innerText.toLowerCase();
    return text.includes('log in') || text.includes('sign in');
  });

  if (needLogin) {
    console.log('\n⚠️  ACTION REQUIRED: It looks like you are not logged in.');
    console.log('Please log into Skool in the opened Chromium browser window.');
    console.log('Once you are logged in and see the community feed, come back to this terminal and press ENTER to continue...');
    
    // Wait for user input in terminal
    await new Promise(resolve => {
      process.stdin.resume();
      process.stdin.once('data', resolve);
    });
    console.log('Continuing script...');
  } else {
    console.log('✅ Logged in successfully.');
  }

  // Ensure we are on the community tab
  await page.goto('https://www.skool.com/chase-ai-community?tab=community', { waitUntil: 'domcontentloaded' });

  console.log('Waiting for feed to render...');
  await page.waitForTimeout(5000);
  console.log('Scrolling feed to load posts...');
  // Scroll a few times to load more posts
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(1500);
  }

  console.log('Taking HTML dump...');
  const htmlContent = await page.content();
  fs.writeFileSync('skool_debug.html', htmlContent);
  // Extract all post links
  const postLinks = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a'));
    return [...new Set(anchors.map(a => a.href).filter(href => href.includes('/chase-ai-community/p/') || href.includes('?p=')))];
  });

  console.log(`Found ${postLinks.length} post(s) to process.`);

  // Process each post
  for (const link of postLinks) {
    console.log(`\n📄 Processing: ${link}`);
    try {
      const interceptedVideos = new Set();
      const requestListener = (request) => {
        const url = request.url();
        if (url.includes('.m3u8') || url.includes('.mp4') || url.includes('video.skool.com')) {
          interceptedVideos.add(url);
        }
      };
      
      page.on('request', requestListener);

      await page.goto(link, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000); // Give Skool's SPA time to render comments and fetch video manifests

      page.off('request', requestListener);

      // Extract data from the page
      const data = await page.evaluate(() => {
        const title = document.title;
        const text = document.body.innerText;
        const html = document.body.innerHTML;
        const links = Array.from(document.querySelectorAll('a')).map(a => a.href);
        const videoSources = Array.from(document.querySelectorAll('video')).map(v => v.src).filter(Boolean);
        const iframes = Array.from(document.querySelectorAll('iframe')).map(i => i.src).filter(Boolean);
        return { url: window.location.href, title, text, html, links, videoSources, iframes };
      });

      data.interceptedVideos = Array.from(interceptedVideos);

      console.log(`   Title: ${data.title}`);
      
      // Send it to our ingestion server
      const response = await fetch('http://localhost:3000/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      const res = await response.json();
      if (res.success) {
        console.log(`   ✅ Ingested successfully. Videos found: ${res.videos_found}`);
      }
    } catch (e) {
      console.error(`   ❌ Failed to process ${link}:`, e.message);
    }
  }

  console.log('\n🎉 Autonomous scraping complete!');
  await context.close();
  process.exit(0);
})();
