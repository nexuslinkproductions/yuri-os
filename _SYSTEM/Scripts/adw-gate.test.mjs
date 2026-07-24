#!/usr/bin/env node
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { scorePrediction, readLedger } from './prediction-ledger.mjs';
const CLI = path.resolve(import.meta.dirname, 'adw-gate.mjs');

const PASS_MANIFEST = { name:'test-pass', discrete:{strategy:['A','B','C']}, paramSpace:{noise:[0,1]}, value:"(c,p)=>c.strategy==='A'?1.0:c.strategy==='B'?0.6:0.3-p.noise*0.2", nullValue:'()=>0.55' };
const FAIL_MANIFEST = { name:'test-fail', discrete:{strategy:['bad','worse']}, paramSpace:{penalty:[0,1]}, value:"(c,p)=>c.strategy==='bad'?-1.0-p.penalty:-2.0-p.penalty", nullValue:'()=>0' };
const CONT_MANIFEST = { name:'test-cont', continuous:{x:[0,1]}, paramSpace:{noise:[0,1]}, value:'(c,p)=>c.x-p.noise*0.5', nullValue:'()=>0' };
const MIXED_MANIFEST = { name:'test-mixed', discrete:{framework:['react','vue']}, continuous:{x:[0,1]}, paramSpace:{noise:[0,1]}, value:"(c,p)=>(c.framework==='react'?1:0.8)+c.x-p.noise*0.3", nullValue:'()=>0' };
const NAN2_MANIFEST = { name:'test-nan2', discrete:{strategy:['A','B']}, paramSpace:{noise:[0,1]}, value:"(c,p)=>c.strategy==='A'?1.0:c.strategy.length/0", nullValue:'()=>0' };
const PASS_STATE = { stateBefore:{claimPromotionDistribution:{draft:5,research:8,fixture_ready:3},claimedDistribution:[0.5,0.3,0.2],verifiedDistribution:[0.3,0.3,0.4],verifiedEvidenceCount:12,protectedPathViolations:0,promotionLadderInversions:0}, stateAfter:{claimPromotionDistribution:{draft:4,research:8,fixture_ready:4},claimedDistribution:[0.4,0.3,0.3],verifiedDistribution:[0.3,0.3,0.4],verifiedEvidenceCount:13,protectedPathViolations:0,promotionLadderInversions:0} };
const FAIL_STATE = { stateBefore:{claimPromotionDistribution:{draft:5,research:8,fixture_ready:3},claimedDistribution:[0.5,0.3,0.2],verifiedDistribution:[0.3,0.3,0.4],verifiedEvidenceCount:12,protectedPathViolations:0,promotionLadderInversions:0}, stateAfter:{claimPromotionDistribution:{draft:5,research:8,fixture_ready:3},claimedDistribution:[0.5,0.3,0.2],verifiedDistribution:[0.3,0.3,0.4],verifiedEvidenceCount:12,protectedPathViolations:1,promotionLadderInversions:0} };

function wt(d){const t=path.join(os.tmpdir(),'dw-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.json');fs.writeFileSync(t,JSON.stringify(d));return t;}
function cli(sc,f,env){return execFileSync(process.execPath,[CLI,sc,'--input',f],{encoding:'utf8',env:Object.assign({},process.env,env),timeout:60000});}
function wl(e){const l=path.join(os.tmpdir(),'lg-'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.jsonl');return Object.assign({ADW_LEDGER_FILE:l},e);}
function wsd(e){const s=path.join(os.tmpdir(),'st-'+Date.now()+'-'+Math.random().toString(36).slice(2));return Object.assign({YURI_STATE_DIR:s},e);}

describe('F1',()=>{
  test('mixed',()=>{const f=wt(MIXED_MANIFEST),e=wl();try{const r=JSON.parse(cli('plan',f,e).trim());assert.equal(r.gate,'plan');assert.equal(r.pass,true)}finally{try{fs.unlinkSync(f)}catch(e2){}}});
  test('continuous',()=>{const f=wt(CONT_MANIFEST),e=wl();try{const r=JSON.parse(cli('plan',f,e).trim());assert.equal(r.gate,'plan');assert.equal(r.pass,true)}finally{try{fs.unlinkSync(f)}catch(e2){}}});
});

describe('F4',()=>{
  test('NaN 2nd config exits 2',()=>{const f=wt(NAN2_MANIFEST),e=wl();try{assert.throws(()=>cli('plan',f,e),er=>er.status===2)}finally{try{fs.unlinkSync(f)}catch(e2){}}});
});

describe('F2',()=>{
  test('trace correct',()=>{
    const f=wt(PASS_STATE),e=wl(wsd({YURI_ENERGY_OBSERVABILITY:'1'})),sd=e.YURI_STATE_DIR;
    try{
      const cr=JSON.parse(cli('validate',f,e).trim());assert.equal(cr.pass,true);
      const td=path.join(sd,'energy-trace'),fl=fs.readdirSync(td);
      const rec=JSON.parse(fs.readFileSync(path.join(td,fl[0]),'utf8').trim().split('\n').filter(Boolean).pop());
      assert.equal(rec.lane,'adw-gate');assert.equal(rec.decision,'accept');
      assert.ok(Math.abs(rec.deltaU-cr.deltaU)<0.001);
      assert.ok(Math.abs(Math.round((rec.U_after-rec.U_before)*10000)/10000-rec.deltaU)<0.0001);
    }finally{try{fs.unlinkSync(f)}catch(e2){}}
  });
});

describe('F3',()=>{
  test('scored - strict calibration acceptance',()=>{
    const sh=path.join(os.tmpdir(),'fs-'+Date.now()+'.jsonl'),e={ADW_LEDGER_FILE:sh};
    const pf=wt(PASS_MANIFEST);let pl;try{pl=JSON.parse(cli('plan',pf,e).trim())}finally{try{fs.unlinkSync(pf)}catch(e2){}}
    assert.ok(pl.predictionId);
    const vf=wt(Object.assign({},PASS_STATE,{predictionId:pl.predictionId}));try{cli('validate',vf,e)}finally{try{fs.unlinkSync(vf)}catch(e2){}}
    const rows=readLedger({file:sh}),pred=rows.find(r=>r.type==='prediction'),out=rows.find(r=>r.type==='outcome');
    assert.ok(pred,'prediction exists');
    assert.ok(out,'outcome exists');
    // Verify winner confidence >= 0.6 (robustFloor-derived)
    const winnerPE=pred.predictedEffects.find(e=>e.effect==='PASS');
    assert.ok(winnerPE,'winner predicted effect exists');
    assert.ok(winnerPE.confidence>=0.6,'winner confidence should be >=0.6, got '+winnerPE.confidence);
    const sc=scorePrediction(pred,out);
    assert.ok(sc.hits>=1,'hits: '+sc.hits);
    assert.equal(sc.falseAlarms,0,'falseAlarms: '+sc.falseAlarms);
    assert.equal(sc.misses,0,'misses: '+sc.misses);
    assert.ok(sc.brier<=0.16,'brier: '+sc.brier+' (expected <=0.16)');
  });
describe('F5',()=>{
  test('ledger dir -> null predictionId + reason',()=>{
    const d=fs.mkdtempSync(path.join(os.tmpdir(),'ad-')),f=wt(PASS_MANIFEST),env={ADW_LEDGER_FILE:d};
    try{
      // EISDIR when writing to a directory; prediction-ledger catches internally
      // but M2 read-back detects the missing row -> predictionId=null, reason pushed
      const r=execFileSync(process.execPath,[CLI,'plan','--input',f],{encoding:'utf8',env:Object.assign({},process.env,env),timeout:30000});
      const result=JSON.parse(r.trim());
      assert.equal(result.predictionId,null,'predictionId should be null when write fails');
      assert.ok(result.reasons.some(r=>r.indexOf('ledger-write-failed')>=0),'reasons should contain ledger-write-failed, got: '+JSON.stringify(result.reasons));
    }catch(err){
      // If exit code non-zero, verify at least something useful
      assert.ok(err.status===2||err.status===3);
    }
    finally{try{fs.unlinkSync(f)}catch(e){}try{fs.rmdirSync(d)}catch(e){}}
  });
});
});

describe('baseline',()=>{
  test('plan pass',()=>{const f=wt(PASS_MANIFEST),e=wl();try{assert.equal(JSON.parse(cli('plan',f,e).trim()).pass,true)}finally{try{fs.unlinkSync(f)}catch(e2){}}});
  test('plan fail',()=>{const f=wt(FAIL_MANIFEST),e=wl();try{assert.throws(()=>cli('plan',f,e),er=>er.status===3)}finally{try{fs.unlinkSync(f)}catch(e2){}}});
  test('val pass',()=>{const f=wt(PASS_STATE),e=wl();try{assert.equal(JSON.parse(cli('validate',f,e).trim()).pass,true)}finally{try{fs.unlinkSync(f)}catch(e2){}}});
  test('val fail',()=>{const f=wt(FAIL_STATE),e=wl();try{assert.throws(()=>cli('validate',f,e),er=>er.status===3)}finally{try{fs.unlinkSync(f)}catch(e2){}}});
});
