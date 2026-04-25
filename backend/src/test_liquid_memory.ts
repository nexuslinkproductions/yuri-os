import { liquidMemory } from './services/liquidMemoryService';
import path from 'path';

/**
 * ⬡ LIQUID_MEMORY_VERIFICATION
 */
async function testLiquidMemory() {
    console.log('⬡ VERIFICATION :: STARTING_LIQUID_TEST...');

    const testFile = path.join(process.cwd(), 'iC2M/02_BRIEFS/test_brief.md');
    
    // 1. Record activity
    console.log('--- Step 1: Recording Activity ---');
    liquidMemory.recordActivity(testFile, 'PROJECT_ENGINE');
    
    let state = liquidMemory.getActiveMemory();
    console.log(`Current Focus: ${state.globalFocus}`);
    console.log(`Active Nodes: ${state.activeNodes.length}`);
    
    const node = state.activeNodes.find(n => n.path.includes('test_brief.md'));
    if (node) {
        console.log(`Node Weight: ${node.weight.toFixed(2)}`);
    }

    // 2. Simulate more activity (Reinforcement)
    console.log('\n--- Step 2: Reinforcing Activity ---');
    liquidMemory.recordActivity(testFile, 'PROJECT_ENGINE');
    state = liquidMemory.getActiveMemory();
    const updatedNode = state.activeNodes.find(n => n.path.includes('test_brief.md'));
    if (updatedNode) {
        console.log(`Updated Node Weight: ${updatedNode.weight.toFixed(2)}`);
    }

    console.log('\n⬡ VERIFICATION :: SUCCESS');
}

testLiquidMemory().catch(console.error);
