import { Innertube, UniversalCache } from 'youtubei.js';

async function main() {
  const yt = await Innertube.create({ cache: new UniversalCache(false) });
  const channel = await yt.getChannel('@JEVanClief');
  
  console.log('=== CHANNEL INFO ===');
  console.log(JSON.stringify({
    name: channel.header?.title || 'N/A',
    subscribers: channel.header?.subscribers || 'N/A',
    description: channel.header?.description?.toString()?.slice(0, 500) || 'N/A'
  }, null, 2));
  
  // Get all videos
  const allVideos = [];
  try {
    for await (const video of channel.getVideos()) {
      allVideos.push({
        id: video.id,
        title: video.title?.text || video.title,
        views: video.views || 0,
        duration: video.duration?.seconds || 0,
        published: video.published?.text || 'N/A'
      });
    }
  } catch(e) {
    console.error('Error fetching videos:', e.message);
  }
  
  console.log('\n=== VIDEOS ===');
  console.log(JSON.stringify(allVideos, null, 2));
  
  // Save to file
  const fs = await import('fs');
  fs.writeFileSync('/Users/marcelspatz/NUDIMMUD/RESEARCH/jake-van-klief/raw/channel-metadata.json', 
    JSON.stringify({ channel: channel.header, videos: allVideos }, null, 2));
}

main().catch(console.error);
