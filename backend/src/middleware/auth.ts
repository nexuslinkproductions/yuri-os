import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const AUTH_HEADER = 'X-API-KEY';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const RUNTIME_API_KEY = (process.env.API_KEY || '').trim();

if (!RUNTIME_API_KEY || RUNTIME_API_KEY.length < 16) {
    console.error('⬡ SECURITY_FATAL :: API_KEY is missing or too short. Refusing to boot for security.');
    console.error('⬡ SECURITY_FATAL :: Please set a secure API_KEY in your environment or .env file.');
    process.exit(1);
}

function normalizeAddress(value: string | undefined | null): string {
    if (!value) return '';
    return value.replace(/^::ffff:/, '');
}

function isLoopbackAddress(value: string | undefined | null): boolean {
    const normalized = normalizeAddress(value);
    return normalized === '::1' || normalized === '127.0.0.1' || normalized.startsWith('127.');
}

export function isLocalRequest(req: Request): boolean {
    if (isLoopbackAddress(req.ip) || isLoopbackAddress(req.socket.remoteAddress)) {
        return true;
    }

    const origin = req.header('origin');
    if (!origin) return false;

    try {
        const parsed = new URL(origin);
        if (parsed.protocol === 'chrome-extension:') return true;
        return LOOPBACK_HOSTS.has(parsed.hostname);
    } catch {
        return false;
    }
}

export function localOnlyMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!isLocalRequest(req)) {
        console.warn(`⬡ SECURITY_ALERT :: Local-only route blocked for ${req.path} from ${req.ip}`);
        return res.status(403).json({
            error: 'FORBIDDEN',
            message: 'This endpoint is only available from the local machine.'
        });
    }

    next();
}

export function getRuntimeApiKey(): string {
    return RUNTIME_API_KEY;
}

/**
 * Simple API Key Middleware for NUDIMMUD Backend.
 * Requires an X-API-KEY header matching the environment configuration.
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const providedKey = req.header(AUTH_HEADER);

    if (!providedKey || providedKey !== RUNTIME_API_KEY) {
        console.warn(`⬡ SECURITY_ALERT :: Unauthorized access attempt to ${req.path} from ${req.ip}`);
        return res.status(401).json({
            error: 'UNAUTHORIZED',
            message: `A valid ${AUTH_HEADER} header is required to access this endpoint.`
        });
    }

    next();
};
