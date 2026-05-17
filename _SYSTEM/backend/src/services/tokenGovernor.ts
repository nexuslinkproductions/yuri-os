/**
 * ⬡ TOKEN_GOVERNOR
 * Tracks API usage and manages "Cool-off" periods for exhausted providers.
 */
class TokenGovernor {
    private coolOffMap: Map<string, number> = new Map();
    private readonly DEFAULT_COOL_OFF = 1000 * 60 * 60; // 1 hour

    /**
     * Mark a provider as exhausted or unauthorized
     */
    penalize(provider: string, durationMs: number = this.DEFAULT_COOL_OFF) {
        console.warn(`⬡ TOKEN_GOVERNOR :: PENALIZING_PROVIDER: ${provider} :: UNTIL: ${new Date(Date.now() + durationMs).toLocaleTimeString()}`);
        this.coolOffMap.set(provider, Date.now() + durationMs);
    }

    /**
     * Check if a provider is currently in a cool-off period
     */
    isCoolingOff(provider: string): boolean {
        const expiry = this.coolOffMap.get(provider);
        if (!expiry) return false;
        
        if (Date.now() > expiry) {
            this.coolOffMap.delete(provider);
            return false;
        }
        return true;
    }

    /**
     * Get remaining cool-off time in minutes
     */
    getRemainingTime(provider: string): number {
        const expiry = this.coolOffMap.get(provider);
        if (!expiry) return 0;
        return Math.max(0, Math.ceil((expiry - Date.now()) / 60000));
    }
}

export const tokenGovernor = new TokenGovernor();
