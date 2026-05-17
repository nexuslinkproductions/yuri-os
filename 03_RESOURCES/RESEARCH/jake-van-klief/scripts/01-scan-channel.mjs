import { writeFileSync } from 'fs';

const CHANNEL = '@JEVanClief';
const BASE = '/Users/marcelspatz/YURI-OS-MUSUBI/RESEARCH/jake-van-klief';

async function scanChannel() {
  // Use web_fetch equivalent to get channel page with all videos
  const page1 = await fetch(`https://www.youtube.com/${CHANNEL}/videos`);
  const html = await page1.text();
  
  // Extract video IDs from the ytInitialData
  const match = html.match(/ytInitialData\s*=\s*({.+?});/);
  if (!match) throw new Error('Could not find ytInitialData');
  
  const data = JSON.parse(match[1]);
  const videos = [];
  
  // Navigate to video list
  const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  const videoTab = tabs.find(t => t.tabRenderer?.title === 'Videos');
  const contents = videoTab?.tabRenderer?.content?.richGridRenderer?.contents || [];
  
  for (const item of contents) {
    const video = item?.richItemRenderer?.content?.videoRenderer;
    if (!video) continue;
    
    videos.push({
      id: video.videoId,
      title: video.title?.runs?.[0]?.text || 'N/A',
      views: video.viewCountText?.simpleText || 'N/A',
      published: video.publishedTimeText?.simpleText || 'N/A',
      duration: video.lengthText?.simpleText || 'N/A',
      description: video.descriptionSnippet?.runs?.map(r => r.text).join('') || ''
    });
  }
  
  writeFileSync(`${BASE}/raw/videos.json`, JSON.stringify(videos, null, 2));
  console.log(`Found ${videos.length} videos`);
  
  // Return just the IDs for transcript extraction
  return videos.map(v => ({ id: v.id, title: v.title }));
}

scanChannel().then(vids => {
  // Output as JSON for the next agent
  process.stdout.write(JSON.stringify(vids));
}).catch(e => {
  console.error('SCAN FAILED:', e.message);
  process.exit(1);
});
