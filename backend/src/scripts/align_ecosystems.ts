import fs from 'fs';
import path from 'path';
import { SystemConfig } from '../config/SystemConfig';
import { liquidMemory } from '../services/liquidMemoryService';

/**
 * ⬡ ECOSYSTEM_ALIGNMENT
 * Synchronizes and links the two primary ecosystems:
 * 1. NUDIMMUD (System + Primary Knowledge)
 * 2. iC2M (Claudio's Project Engine)
 */
async function alignEcosystems() {
    console.log('⬡ ALIGNMENT :: STARTING_ECOSYSTEM_BIFURCATION...');
    
    const primaryVault = SystemConfig.resolve(SystemConfig.VAULTS.PRIMARY);
    const claudioVault = SystemConfig.resolve(SystemConfig.VAULTS.CLAUDIO);

    // 1. Create Claudio's Vault Structure if it doesn't exist
    const claudioStructure = [
        '01_PROJECTS',
        '02_BRIEFS',
        '03_DELIVERABLES',
        '04_PARTNERS/MARCEL',
        '05_RESOURCES'
    ];

    console.log(`⬡ ALIGNMENT :: SEEDING_CLAUDIO_VAULT: ${claudioVault}`);
    claudioStructure.forEach(dir => {
        const fullDir = path.join(claudioVault, dir);
        if (!fs.existsSync(fullDir)) {
            try {
                fs.mkdirSync(fullDir, { recursive: true });
                console.log(`   [+] Created: ${dir}`);
            } catch (e: any) {
                console.warn(`   [!] Could not create ${dir}: ${e.message}`);
            }
        }
    });

    // 2. Create the "Bridge" files
    const bridgeMarcel = path.join(claudioVault, '04_PARTNERS/MARCEL/claudio-profile.md');
    if (!fs.existsSync(bridgeMarcel)) {
        try {
            const content = `# Claudio Profile (Bridge)\n\n- **Relationship**: Agency-to-Supplier\n- **Communication**: Swiss Register (Direct, Punctual, Solution-Oriented)\n- **Links**: [[NUDIMMUD/05_OPERATIONAL/partner_memory.md|Marcel's Profile]]`;
            fs.writeFileSync(bridgeMarcel, content);
            console.log('   [+] Created Bridge: claudio-profile.md');
        } catch (e: any) {
            console.warn(`   [!] Could not create bridgeMarcel: ${e.message}`);
        }
    }

    const bridgeClaudio = path.join(primaryVault, '05_OPERATIONAL/cross-vault-links.md');
    if (!fs.existsSync(bridgeClaudio)) {
        try {
            const content = `# Cross-Vault Bridge\n\n- **Claudio's Vault**: [[iC2M/Home]]\n- **Active Briefs**: [[iC2M/02_BRIEFS/current_sprint]]`;
            fs.writeFileSync(bridgeClaudio, content);
            console.log('   [+] Created Bridge: cross-vault-links.md');
        } catch (e: any) {
            console.warn(`   [!] Could not create bridgeClaudio: ${e.message}`);
        }
    }

    // 3. Activate Liquid Memory for the bridge
    liquidMemory.recordActivity(bridgeMarcel, 'CLAUDIO_VAULT');
    liquidMemory.recordActivity(bridgeClaudio, 'OPERATIONAL');

    console.log('⬡ ALIGNMENT :: SUCCESS');
}

alignEcosystems().catch(console.error);
