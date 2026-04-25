import { neuralForge } from './src/services/neuralForgeService';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function verify() {
    console.log('⬡ NEURAL_FORGE :: STARTING_CLOUD_VERIFICATION');
    try {
        const status = await neuralForge.ping();
        console.log('⬡ NEURAL_FORGE :: PING_STATUS:', JSON.stringify(status, null, 2));
        
        if (status.cloud) {
            console.log('⬡ NEURAL_FORGE :: CLOUD_REACHABLE');
            const result = await neuralForge.verifyCloudIntegration();
            console.log('⬡ NEURAL_FORGE :: INTEGRATION_RESULT:', JSON.stringify(result, null, 2));
        } else {
            console.error('⬡ NEURAL_FORGE :: CLOUD_UNREACHABLE');
        }
    } catch (e: any) {
        console.error('⬡ NEURAL_FORGE :: VERIFICATION_FAILED:', e.message);
    }
}

verify();
