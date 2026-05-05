const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

app.post('/ingest', (req, res) => {
    const { url, title, text, html, links, videoSources = [], iframes = [], interceptedVideos = [] } = req.body;
    console.log(`[+] Received Skool payload from: ${url}`);
    console.log(`[+] Title: ${title}`);
    console.log(`[+] Links found: ${links.length}`);

    // Save raw data
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `skool_${timestamp}.json`;
    const filepath = path.join(dataDir, filename);

    fs.writeFileSync(filepath, JSON.stringify({ url, title, text, links, videoSources, iframes, timestamp }, null, 2));
    console.log(`[+] Saved payload to ${filepath}`);

    const videoLinks = [];
    
    // Look for YouTube/Loom/Vimeo in a tags
    if (links && Array.isArray(links)) {
        links.forEach(l => {
            if (l.includes('youtube.com/watch') || l.includes('youtu.be/') || l.includes('loom.com/share') || l.includes('vimeo.com/')) {
                videoLinks.push(l);
            }
        });
    }

    // Look in iframes
    if (iframes && Array.isArray(iframes)) {
        iframes.forEach(src => {
            if (src.includes('youtube.com/embed') || src.includes('loom.com/embed') || src.includes('player.vimeo.com') || src.includes('wistia.net') || src.includes('wistia.com')) {
                videoLinks.push(src);
            }
        });
    }

    // Look in videoSources (Skool native videos or standard HTML5 videos)
    if (videoSources && Array.isArray(videoSources)) {
        videoSources.forEach(src => {
            if (src && !src.startsWith('blob:')) {
                videoLinks.push(src);
            }
        });
    }
    
    // Also parse html directly for wistia fast.wistia.net embeds or youtube embeds just in case
    const iframeRegex = /src=["'](https:\/\/(www\.youtube\.com\/embed\/|fast\.wistia\.net\/embed\/)[^"']+)["']/g;
    let match;
    while ((match = iframeRegex.exec(html)) !== null) {
        videoLinks.push(match[1]);
    }

    // Process intercepted network requests for raw streams
    if (interceptedVideos && Array.isArray(interceptedVideos)) {
        const uniqueMuxIds = new Set();
        interceptedVideos.forEach(src => {
            if (src.includes('.m3u8')) {
                // To avoid downloading multiple renditions of the same stream, store base URL
                const baseUrl = src.split('.m3u8')[0] + '.m3u8';
                if (!uniqueMuxIds.has(baseUrl)) {
                    uniqueMuxIds.add(baseUrl);
                    videoLinks.push(baseUrl);
                }
            } else if (src.includes('.mp4')) {
                videoLinks.push(src);
            }
        });
    }

    const uniqueVideos = [...new Set(videoLinks)];
    console.log(`[+] Found ${uniqueVideos.length} unique videos (YouTube, Loom, Vimeo, Wistia, Skool Native).`);

    uniqueVideos.forEach(ytUrl => {
        console.log(`[+] Processing Video: ${ytUrl}`);
        // Execute the python script
        const pythonScript = path.join(__dirname, 'process_video.py');
        const pythonExec = path.join(__dirname, 'venv', 'bin', 'python3');
        exec(`"${pythonExec}" "${pythonScript}" "${ytUrl}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`[-] Error processing video ${ytUrl}:`, error.message);
                return;
            }
            if (stderr) {
                console.error(`[-] VideoDB Stderr:`, stderr);
            }
            console.log(`[+] VideoDB Processing Result:\n${stdout}`);
        });
    });

    res.json({ success: true, message: 'Ingested successfully', videos_found: uniqueVideos.length });
});

app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 NUDIMMUD Skool Ingestion Server Live`);
    console.log(`Listening on http://localhost:${PORT}`);
    console.log(`Waiting for bookmarklet payloads...`);
    console.log(`========================================`);
});
