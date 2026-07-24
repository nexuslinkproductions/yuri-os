#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { robustScore, crossEntropyOptimize, minimaxRegret, makeRng } from './decision-sim.mjs';
import { cornerAwareReadout } from './izanagi-bridge.mjs';
import { recordPrediction, recordOutcome, readLedger } from './prediction-ledger.mjs';
import { computeU, computeDeltaU, gateProposal, DEFAULT_WEIGHTS } from './math/yuri-energy.mjs';
import { loadEnergyConfig } from './math/yuri-energy-config.mjs';
import { buildTraceRecord, appendTrace } from './math/yuri-energy-trace.mjs';

const DEFAULT_LEDGER='_SYSTEM/state/prediction-ledger.jsonl';
function ledgerFile(){return process.env.ADW_LEDGER_FILE||DEFAULT_LEDGER;}
function readJSON(f){try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){throw new Error('cannot read input: '+e.message)}}
function round(x){if(typeof x!=='number'||!Number.isFinite(x))return null;return Math.round(x*10000)/10000;}
function configKey(c){return JSON.stringify(Object.keys(c).sort().reduce((o,k)=>(o[k]=c[k],o),{}));}
/** Match izaangi-bridge labelOf: c.build ?? c.label ?? Object.values(c)[0] */
function labelOf(c){return c&&typeof c==='object'?(c.build??c.label??Object.values(c)[0]):String(c);}

function cartesianDiscrete(d){const ks=Object.keys(d);if(!ks.length)return[{}];let r=[{}];for(const k of ks){const n=[];for(const p of r)for(const v of d[k])n.push({...p,[k]:v});r=n;}return r;}

function buildProblem(manifest){
  if(!manifest.name||typeof manifest.name!=='string')throw new Error('manifest.name required');
  if(!manifest.paramSpace||typeof manifest.paramSpace!=='object')throw new Error('manifest.paramSpace required');
  if(!manifest.value||typeof manifest.value!=='string')throw new Error('manifest.value required');
  const mk=b=>{try{return new Function('config','params','"use strict";return ('+b+')(config,params);')}catch(e){throw new Error('fn parse: '+e.message)}};
  const vf=mk(manifest.value),nf=manifest.nullValue?mk(manifest.nullValue):()=>0;
  const dk=Object.keys(manifest.discrete||{}),ck=Object.keys(manifest.continuous||{});
  let sf;
  if(manifest.sampleParams){try{sf=new Function('rng','"use strict";return ('+manifest.sampleParams+')(rng);')}catch(e){throw new Error('sampleParams '+e.message)}}
  else{const k=Object.keys(manifest.paramSpace);sf=r=>{const p={};for(const x of k){const[l,h]=manifest.paramSpace[x];p[x]=l+r()*(h-l)}return p;}}
  const ts=sf(makeRng(42));
  const ct=dk.length?cartesianDiscrete(manifest.discrete):[Object.fromEntries(ck.map(k=>[k,(manifest.continuous[k][0]+manifest.continuous[k][1])/2]))];
  for(const c of ct){for(const k of ck)if(c[k]===void 0)c[k]=(manifest.continuous[k][0]+manifest.continuous[k][1])/2;
    for(const[n,fn]of[['value',vf],['nullValue',nf]]){const r=fn(c,ts);if(typeof r!=='number'||!Number.isFinite(r))throw new Error('evaluator '+n+' non-finite: '+JSON.stringify(r)+' cfg:'+JSON.stringify(c));}}
  return{name:manifest.name,discrete:manifest.discrete||{},continuous:manifest.continuous||{},paramSpace:manifest.paramSpace,sampleParams:sf,value:vf,nullValue:nf};
}

function doPlan(manifest){
  const problem=buildProblem(manifest);
  const hd=Object.keys(problem.discrete).length>0,hc=Object.keys(problem.continuous).length>0;
  let configs;
  if(hd){const disc=cartesianDiscrete(problem.discrete);
    if(hc){configs=disc.map(dc=>{const sub={name:problem.name+'-sub',discrete:{},continuous:problem.continuous,paramSpace:problem.paramSpace,sampleParams:problem.sampleParams,value:(cfg,p)=>problem.value({...dc,...cfg},p),nullValue:(cfg,p)=>problem.nullValue({...dc,...cfg},p)};const r=crossEntropyOptimize(sub,{draws:400,iters:20});const{__score,...rest}=r.best;return{...dc,...rest};});}
    else{configs=disc;}
  }else if(hc){const r=crossEntropyOptimize(problem,{draws:400,iters:20});configs=[r.best];}
  else{configs=[{_label:'default'}];}

  const clean=configs.map(c=>{const{__score,...rest}=c;return rest;});
  const readout=cornerAwareReadout(problem,clean,{draws:4000});
  const winnerConfig=readout.robust[0].config,winnerKey=configKey(winnerConfig);
  const perConfig=readout.perConfig,cornerLawBite=perConfig.some(c=>c.cornerLawBite);
  const pass=perConfig.some(c=>c.robustFloor);
  const reasons=[];

  if(!pass){reasons.push('no config has a positive floor (best worst-case '+round(Math.max(...perConfig.map(c=>c.worstVertex)))+')');}
  if(cornerLawBite)reasons.push('corner-law bite detected');

  // Winner-only predictedEffects. Confidence via labelOf match (izanagi labelOf, not configKey).
  const wl=labelOf(winnerConfig);
  const wPC=perConfig.find(p=>p.build===wl);
  const wConf=(wPC&&wPC.robustFloor)?0.7:0.3;
  const predictedEffects=[{target:winnerKey,effect:'PASS',confidence:wConf}];

  let predictionId=null;
  try{
    const res=recordPrediction({subject:problem.name,change:'adw-plan',predictedEffects,source:'adw-gate',ts:Date.now()},{file:ledgerFile()});
    predictionId=res.row.id;
    if(predictionId){const rows=readLedger({file:ledgerFile()});if(!rows.find(r=>r.type==='prediction'&&r.id===predictionId)){predictionId=null;reasons.push('ledger-write-failed (row not found after write)');}}
  }catch(err){predictionId=null;reasons.push('ledger-write-failed: '+err.message);}

  return{gate:'plan',pass,score:round(readout.robust[0].score),cornerLawBite,predictionId,reasons};
}

function doValidate(input){
  if(!input.stateBefore||!input.stateAfter)throw new Error('requires stateBefore and stateAfter');
  const cfg=loadEnergyConfig();
  const weights=input.weights?{...DEFAULT_WEIGHTS,...input.weights}:{...DEFAULT_WEIGHTS,...(cfg.weights||{})};
  const threshold=input.threshold!==void 0?input.threshold:cfg.threshold!==void 0&&Number.isFinite(cfg.threshold)?cfg.threshold:0;
  const proposal=gateProposal({stateBefore:input.stateBefore,stateAfter:input.stateAfter,weights,threshold});
  const pr=proposal.result;const pass=pr.accept===true;const deltaU=pr.deltaU;
  const contributions=pr.componentDeltas||{};const reasons=[];

  if(!pass){
    if(pr.protectedPathVeto)reasons.push('protected-path violation veto');
    if(pr.structuralFloorVeto)reasons.push('structural floor veto');
    if(pr.maxSeverityVeto)reasons.push('max severity veto');
    if(pr.gateErrorVeto)reasons.push('gate error veto');
    if(pr.claimGateVeto)reasons.push('claim gate veto');
    if(!reasons.length)reasons.push('deltaU '+round(deltaU)+' exceeds threshold '+round(threshold));
  }

  // Record outcome — winner target only (no deltaU, which is unmatchable for scoring)
  if(input.predictionId){
    let winnerTarget=null;
    try{const rows=readLedger({file:ledgerFile()});const p=rows.find(r=>r.type==='prediction'&&r.id===input.predictionId);
      if(p&&p.predictedEffects){const w=p.predictedEffects.find(e=>e.effect==='PASS');if(w)winnerTarget=w.target;}}catch{}

    const observedEffects=winnerTarget?[{target:winnerTarget,effect:pass?'PASS':'FAIL'}]:[];
    try{
      recordOutcome({predictionId:input.predictionId,observedEffects,ts:Date.now()},{file:ledgerFile()});
      const rows=readLedger({file:ledgerFile()});
      if(!rows.find(r=>r.type==='outcome'&&r.predictionId===input.predictionId))
        reasons.push('ledger-write-failed (outcome not found after write)');
    }catch(err){reasons.push('ledger-write-failed: '+err.message);}
  }

  if(process.env.YURI_ENERGY_OBSERVABILITY==='1'){
    try{
      const uBefore=computeU(input.stateBefore,weights),uAfter=computeU(input.stateAfter,weights);
      const dU=computeDeltaU(input.stateBefore,input.stateAfter,weights);
      appendTrace(buildTraceRecord({lane:'adw-gate',runId:input.predictionId||'adw-validate',stateBefore:input.stateBefore,stateAfter:input.stateAfter,computeUResult:uAfter,computeDeltaUResult:dU,gateProposalResult:proposal,weights,threshold}));
    }catch(err){reasons.push('trace write failed: '+err.message);}
  }

  return{gate:'validate',pass,deltaU:round(deltaU),contributions,reasons};
}

function parseArgs(argv){const a=argv.slice(2);if(a.includes('--help')||!a.length)return{help:true};const sc=a[0];if(sc!=='plan'&&sc!=='validate')return{error:'unknown: '+sc};const idx=a.indexOf('--input');if(idx<0||idx>=a.length-1)return{error:'--input required'};return{subcommand:sc,inputFile:a[idx+1]};}
function run(argv=process.argv){const p=parseArgs(argv);if(p.help){console.log(HELP);return 0;}if(p.error){console.error(p.error);return 2;}let input;try{input=readJSON(p.inputFile)}catch(e){console.error('adw-gate error: '+e.message);return 2;}try{const res=p.subcommand==='plan'?doPlan(input):doValidate(input);console.log(JSON.stringify(res));return res.pass?0:3;}catch(e){console.error('adw-gate error: '+e.message);return 2;}}

const HELP='adw-gate.mjs — AI Developer Workflow gate\n\nUSAGE\n  node adw-gate.mjs plan --input manifest.json\n  node adw-gate.mjs validate --input outcome.json\n  node adw-gate.mjs --help\n\nSUBCOMMANDS\n  plan    Evaluate build options via decision-sim + izaangi-bridge.\n  validate Evaluate state transition via energy gate.\n\nENV\n  ADW_LEDGER_FILE  prediction-ledger path\n  YURI_ENERGY_OBSERVABILITY=1  write energy traces\n';

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=run();
export{doPlan,doValidate,HELP};
