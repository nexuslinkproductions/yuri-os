import { writeFileSync, existsSync } from 'fs';
import { YoutubeTranscript } from 'youtube-transcript';

const BASE = '/Users/marcelspatz/NUDIMMUD/RESEARCH/jake-van-klief';
const videos = [
  {id:'AZ1l-oaD3tk',title:'Afternoon Tea #2: Stop Building Production-Ready AI'},
  {id:'hALln9wrrQo',title:'How I Manage Creative, Software, and Business Work'},
  {id:'oQ6tsBFJZzk',title:'I Think, Therefore I Am: 400-Year History of Thinking Machines'},
  {id:'pdoSAWWCDO8',title:'Claude Design Complete Breakdown'},
  {id:'ZMDXs59Ntjc',title:'The True Art of AI: Knowing What Not to Automate'},
  {id:'ozkx_eUfjY0',title:'No Wix. No Squarespace. Just Claude Code and GitHub'},
  {id:'0fCQ-4J_jzk',title:'Why I Stopped Building AI Agents'},
  {id:'rHDA0WMXzy4',title:'Stop Copy-Pasting Into Claude'},
  {id:'MkN-ss2Nl10',title:'Stop Building AI Agents. Use This Folder System Instead'},
  {id:'izMBiWG3L24',title:'SVG to React: Illustrator to Web Animations'},
  {id:'6hF2K4YGZbY',title:'Afternoon Tea #1: Joe Fioramonti on Scaling Human Judgment'},
  {id:'vyN7ITKcGXU',title:'Claude Code + Remotion: Long-Form AI Animations'},
  {id:'KC0VEZuo4OI',title:"Watch Me Build Something Claude Code Can't Do Yet"},
  {id:'J2GLzkaUrBc',title:'Custom Front End for Claude Code'},
  {id:'SjlCJIU9ODs',title:'The Ladder That Explains Every AI Failure'},
  {id:'yEa6dgh7wuc',title:'Video as Code: My AI Animation Stack'},
  {id:'UGyTimVObus',title:'From Nazi Psychology to AI Auditing'},
  {id:'S3fXSc5z2n4',title:'How a 1953 Word Game Explains AI Memory'},
  {id:'5B6W2OGfxq0',title:'How One Line of Python Triggers 12,000 Lines'},
  {id:'bQXi5Nd8c40',title:'Clawdbot (Moltbot) Has 100K Stars'},
  {id:'DbIjTB-kh8E',title:"Everyone Knows AI Started in the 1950s (Wrong by 2000 Years)"},
  {id:'I-enT6szVQQ',title:'I Used AI to Fix Government Contracting'},
  {id:'Wtf6E-fwuwI',title:'Becoming an AI Psychologist'},
  {id:'_rtyhVD4v4A',title:'AI Coding Tools Failed Completely'},
  {id:'AjzBaEkWkNA',title:'AI Agency and Consulting Models are DEAD'},
  {id:'jjV1ckgPzI0',title:"I Charged $2000 For This AI Lecture"},
  {id:'RZ0AcCLVPFA',title:'AI is the New Compiler'},
  {id:'v2UnNFmkia0',title:'Claude Code + Cursor: Agentic Workflows'},
  {id:'PN9OzUNCBKE',title:'The Apocalyptic AI Laptop'},
  {id:'tQ6rQMW7vo8',title:'Apocalyptic AI'}
];

const results = [];

for (const v of videos) {
  const outPath = BASE + '/transcripts/' + v.id + '.json';
  if (existsSync(outPath)) {
    console.log('SKIP', v.id, 'already exists');
    results.push({id:v.id,status:'cached'});
    continue;
  }
  
  try {
    console.log('FETCH', v.id, v.title.slice(0,40));
    const transcript = await YoutubeTranscript.fetchTranscript(v.id);
    writeFileSync(outPath, JSON.stringify({videoId:v.id,title:v.title,segments:transcript}, null, 2));
    const text = transcript.map(s => s.text).join(' ');
    writeFileSync(BASE + '/transcripts/' + v.id + '.txt', text);
    results.push({id:v.id,status:'done',segments:transcript.length,chars:text.length});
    console.log(' ->', transcript.length, 'segments,', text.length, 'chars');
  } catch(e) {
    results.push({id:v.id,status:'failed',error:e.message});
    console.error(' FAIL:', e.message.slice(0,100));
  }
}

writeFileSync(BASE + '/raw/extraction-log.json', JSON.stringify(results, null, 2));
const done = results.filter(r => r.status === 'done').length;
const failed = results.filter(r => r.status === 'failed').length;
console.log('\nDONE:', done, 'success,', failed, 'failed');
