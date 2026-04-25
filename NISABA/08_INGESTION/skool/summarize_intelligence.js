const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const outputFile = path.join(__dirname, 'skool_intelligence_report.md');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  console.log('Data directory not found.');
  process.exit(1);
}

const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && !f.startsWith('._'));

let markdown = `# Skool Community Intelligence Report\n\n`;
markdown += `*Generated on: ${new Date().toISOString()}*\n\n`;
markdown += `## Overview\n`;
markdown += `- **Total Posts Analyzed**: ${files.length}\n\n`;

markdown += `## Scraped Posts & Extracted Insights\n\n`;

const painPoints = [];
const templatesRequested = [];

files.forEach(file => {
  const filePath = path.join(dataDir, file);
  try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    const postData = JSON.parse(rawData);
    
    // Clean title
    const cleanTitle = postData.title.replace(' · Chase AI Community', '').trim();
    
    markdown += `### ${cleanTitle}\n`;
    markdown += `- **URL**: [Link](${postData.url})\n`;
    
    // Attempt to extract raw post text and comments simply by splitting by newlines
    // This is a naive extraction since the innerText is dumped as a single string.
    const lines = postData.text.split('\n').filter(l => l.trim().length > 0);
    
    // We can look for keywords indicating pain points or questions
    const postPainPoints = lines.filter(l => l.toLowerCase().includes('problem') || l.toLowerCase().includes('issue') || l.toLowerCase().includes('help') || l.toLowerCase().includes('error') || l.toLowerCase().includes('stuck'));
    if (postPainPoints.length > 0) {
      painPoints.push(...postPainPoints.map(p => `- From *${cleanTitle}*: ${p.substring(0, 150)}...`));
    }
    
    const requestLines = lines.filter(l => l.toLowerCase().includes('template') || l.toLowerCase().includes('where can i find') || l.toLowerCase().includes('how do i'));
    if (requestLines.length > 0) {
      templatesRequested.push(...requestLines.map(r => `- From *${cleanTitle}*: ${r.substring(0, 150)}...`));
    }
    
    markdown += `- **Raw Text Length**: ${postData.text.length} characters\n`;
    markdown += `- **Total Links on Page**: ${postData.links ? postData.links.length : 0}\n\n`;
    
  } catch (err) {
    console.error(`Error processing file ${file}:`, err);
  }
});

markdown += `## 🚨 Detected Pain Points & Issues\n`;
if (painPoints.length > 0) {
  // Deduplicate simply
  const uniquePainPoints = [...new Set(painPoints)].slice(0, 20); 
  markdown += uniquePainPoints.join('\\n') + '\\n\n';
} else {
  markdown += `No explicit pain points detected in this batch.\\n\n`;
}

markdown += `## 💡 Detected Requests & Feature Interests\n`;
if (templatesRequested.length > 0) {
  const uniqueRequests = [...new Set(templatesRequested)].slice(0, 20);
  markdown += uniqueRequests.join('\\n') + '\\n\n';
} else {
  markdown += `No explicit requests detected in this batch.\\n\n`;
}

fs.writeFileSync(outputFile, markdown);
console.log(`✅ Intelligence report generated at: ${outputFile}`);
