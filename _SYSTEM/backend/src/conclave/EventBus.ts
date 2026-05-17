import { EventEmitter } from 'events';
import { Artifact } from './types';

/**
 * ⬡ CONCLAVE_EVENT_BUS ⬡
 * Telemetry-enabled pub/sub engine for Artifact propagation.
 */
export class EventBus extends EventEmitter {
    public static GlobalBus = new EventEmitter();
    private telemetryLog: Artifact[] = [];

    public publish(artifact: Artifact) {
        console.log(`⬡ BUS_EVENT :: [${artifact.type}] from [${artifact.producer}]`);
        this.telemetryLog.push({ ...artifact });
        
        // General artifact event
        this.emit('ARTIFACT_PUBLISHED', artifact);
        
        // Specific type event for direct subscribers
        this.emit(artifact.type, artifact);

        // Notify Global Bus for telemetry monitoring
        EventBus.GlobalBus.emit('CONCLAVE_EVENT', artifact);
    }

    public getTelemetry(): Artifact[] {
        return this.telemetryLog;
    }

    public clearTelemetry() {
        this.telemetryLog = [];
    }
}
