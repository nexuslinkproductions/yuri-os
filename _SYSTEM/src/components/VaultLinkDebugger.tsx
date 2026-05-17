import React, { useState, useCallback, useEffect } from 'react';
import { apiFetch, apiFetchWithTimeout } from '../lib/runtime';

interface DiagnosticResult {
    test: string;
    status: 'PASS' | 'FAIL' | 'PENDING';
    message: string;
    timestamp: string;
}

export default function VaultLinkDebugger() {
    const [isOpen, setIsOpen] = useState(true);
    const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('OFFLINE');
    const [lastSync, setLastSync] = useState<string | null>(null);

    const runDiagnostics = useCallback(async () => {
        setIsRunning(true);
        setDiagnostics([]);

        const results: DiagnosticResult[] = [];

        // Test 1: Backend API Health
        results.push({
            test: 'BACKEND_PING',
            status: 'PENDING',
            message: 'Testing backend connectivity...',
            timestamp: new Date().toISOString()
        });
        setDiagnostics([...results]);

        try {
            const backendRes = await apiFetchWithTimeout('/api/health', 5000);
            if (backendRes.ok) {
                results[results.length - 1] = {
                    test: 'BACKEND_PING',
                    status: 'PASS',
                    message: 'Backend API responding normally',
                    timestamp: new Date().toISOString()
                };
            } else {
                throw new Error(`Status ${backendRes.status}`);
            }
        } catch (err: any) {
            results[results.length - 1] = {
                test: 'BACKEND_PING',
                status: 'FAIL',
                message: `Backend unavailable: ${err.message}`,
                timestamp: new Date().toISOString()
            };
        }
        setDiagnostics([...results]);

        // Test 2: Obsidian REST API
        results.push({
            test: 'OBSIDIAN REST API',
            status: 'PENDING',
            message: 'Checking Obsidian REST API plugin...',
            timestamp: new Date().toISOString()
        });
        setDiagnostics([...results]);

        try {
            // Use backend proxy/status to avoid CORS and port mismatches
            const obsRes = await apiFetch('/api/obsidian/status');
            if (obsRes.ok) {
                const statusData = await obsRes.json();
                if (statusData.connected || statusData.status === 'ONLINE') {
                    results[results.length - 1] = {
                        test: 'OBSIDIAN REST API',
                        status: 'PASS',
                        message: `Obsidian REST API plugin is active (${statusData.baseUrl || 'Localhost'})`,
                        timestamp: new Date().toISOString()
                    };
                    setConnectionStatus('ONLINE');
                } else {
                    throw new Error(statusData.lastErrorMessage || 'Service reported offline');
                }
            } else {
                throw new Error(`Status ${obsRes.status}`);
            }
        } catch (err: any) {
            results[results.length - 1] = {
                test: 'OBSIDIAN REST API',
                status: 'FAIL',
                message: `Obsidian REST API not responding: ${err.message}. Ensure Community Plugins > Obsidian REST API is enabled.`,
                timestamp: new Date().toISOString()
            };
            setConnectionStatus('OFFLINE');
        }
        setDiagnostics([...results]);

        // Test 3: Vault File Sync Service
        results.push({
            test: 'VAULT SYNC SERVICE',
            status: 'PENDING',
            message: 'Testing vault file synchronization...',
            timestamp: new Date().toISOString()
        });
        setDiagnostics([...results]);

        try {
            const syncRes = await apiFetchWithTimeout('/api/obsidian/sync', 5000, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'test' })
            });
            if (syncRes.ok) {
                results[results.length - 1] = {
                    test: 'VAULT_SYNC_SERVICE',
                    status: 'PASS',
                    message: 'Vault sync service operational',
                    timestamp: new Date().toISOString()
                };
                setLastSync(new Date().toISOString());
            } else {
                throw new Error(`Status ${syncRes.status}`);
            }
        } catch (err: any) {
            results[results.length - 1] = {
                test: 'VAULT_SYNC_SERVICE',
                status: 'FAIL',
                message: `Sync service error: ${err.message}. Check backend logs.`,
                timestamp: new Date().toISOString()
            };
        }
        setDiagnostics([...results]);

        // Test 4: Network Path to Vault
        results.push({
            test: 'VAULT PATH ACCESSIBLE',
            status: 'PENDING',
            message: 'Checking vault path accessibility...',
            timestamp: new Date().toISOString()
        });
        setDiagnostics([...results]);

        try {
            const pathRes = await apiFetchWithTimeout('/api/obsidian/paths', 5000);
            if (pathRes.ok) {
                const paths = await pathRes.json();
                results[results.length - 1] = {
                    test: 'VAULT PATH ACCESSIBLE',
                    status: 'PASS',
                    message: `Vault paths available: ${paths?.vaults?.length || 0} vault(s) found`,
                    timestamp: new Date().toISOString()
                };
            } else {
                throw new Error(`Status ${pathRes.status}`);
            }
        } catch (err: any) {
            results[results.length - 1] = {
                test: 'VAULT PATH ACCESSIBLE',
                status: 'FAIL',
                message: `Vault path unreachable: ${err.message}. Check file system permissions.`,
                timestamp: new Date().toISOString()
            };
        }
        setDiagnostics([...results]);

        setIsRunning(false);
    }, []);

    const reconnectVault = useCallback(async () => {
        setIsRunning(true);
        try {
            await apiFetchWithTimeout('/api/obsidian/reconnect', 8000, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            setConnectionStatus('ONLINE');
            setLastSync(new Date().toISOString());
        } catch (err) {
            console.error('Reconnect failed:', err);
        }
        setIsRunning(false);
    }, []);

    const restartVaultSync = useCallback(async () => {
        setIsRunning(true);
        try {
            await apiFetchWithTimeout('/api/obsidian/restart-sync', 8000, {
                method: 'POST'
            });
            setConnectionStatus('ONLINE');
            setLastSync(new Date().toISOString());
        } catch (err) {
            console.error('Restart failed:', err);
        }
        setIsRunning(false);
    }, []);

    useEffect(() => {
        // Check initial status
        const checkStatus = async () => {
            try {
                const res = await apiFetch('/api/obsidian/status');
                if (res.ok) {
                    const status = await res.json();
                    setConnectionStatus(status?.status || 'OFFLINE');
                    if (status?.lastSync) {
                        setLastSync(status.lastSync);
                    }
                }
            } catch {}
        };
        checkStatus();
        const interval = setInterval(checkStatus, 15000);
        return () => clearInterval(interval);
    }, []);

    if (!isOpen) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ padding: '20px', background: 'rgba(10, 13, 26, 0.95)', border: '1px solid rgba(0, 242, 255, 0.2)', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#00F2FF', letterSpacing: '1px' }}>VAULT LINK DEBUGGER</h2>
                        <button 
                            onClick={() => setIsOpen(false)}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                            [CLOSE]
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <div
                            style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: connectionStatus === 'ONLINE' ? '#00FF64' : '#FF4D00',
                                boxShadow: `0 0 10px ${connectionStatus === 'ONLINE' ? '#00FF64' : '#FF4D00'}`
                            }}
                        />
                        <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 700, color: connectionStatus === 'ONLINE' ? '#00FF64' : '#FF4D00' }}>
                            {connectionStatus}
                        </span>
                    </div>
                </div>

                <div style={{ marginBottom: '20px', fontSize: '0.8rem', fontFamily: 'monospace', opacity: 0.6 }}>
                    {lastSync ? (
                        <div style={{ color: '#00FF64' }}>LAST SYNC SUCCESS :: {new Date(lastSync).toLocaleString()}</div>
                    ) : (
                        <div style={{ color: '#FFB800' }}>NO SYNC RECORDS FOUND</div>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    <button
                        onClick={runDiagnostics}
                        disabled={isRunning}
                        style={{
                            padding: '12px 16px',
                            background: 'rgba(0, 242, 255, 0.05)',
                            border: '1px solid rgba(0, 242, 255, 0.3)',
                            color: '#00F2FF',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: isRunning ? 'wait' : 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        {isRunning ? 'EXECUTING...' : 'RUN DIAGNOSTICS'}
                    </button>
                    <button
                        onClick={reconnectVault}
                        disabled={isRunning || connectionStatus === 'ONLINE'}
                        style={{
                            padding: '12px 16px',
                            background: connectionStatus === 'ONLINE' ? 'rgba(0,255,100,0.05)' : 'rgba(255, 77, 0, 0.05)',
                            border: `1px solid ${connectionStatus === 'ONLINE' ? 'rgba(0,255,100,0.3)' : 'rgba(255, 77, 0, 0.3)'}`,
                            color: connectionStatus === 'ONLINE' ? '#00FF64' : '#FF4D00',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: isRunning || connectionStatus === 'ONLINE' ? 'not-allowed' : 'pointer',
                            opacity: isRunning || connectionStatus === 'ONLINE' ? 0.5 : 1
                        }}
                    >
                        {connectionStatus === 'ONLINE' ? 'VAULT CONNECTED' : 'FORCE RECONNECT'}
                    </button>
                </div>

                {connectionStatus !== 'ONLINE' && (
                    <button
                        onClick={restartVaultSync}
                        disabled={isRunning}
                        style={{
                            width: '100%',
                            padding: '14px 16px',
                            background: 'rgba(255, 120, 120, 0.05)',
                            border: '1px solid rgba(255, 120, 120, 0.3)',
                            color: '#FF7878',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: isRunning ? 'wait' : 'pointer'
                        }}
                    >
                        {isRunning ? 'RESTARTING SERVICE...' : 'RESTART VAULT SYNC SERVICE'}
                    </button>
                )}
            </div>

            {diagnostics.length > 0 && (
                <div style={{ padding: '20px', background: 'rgba(10, 13, 26, 0.9)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px' }}>
                    <h3 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', fontWeight: 700, opacity: 0.8, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>DIAGNOSTIC TRACE</h3>
                    <div style={{ display: 'grid', gap: '12px' }}>
                        {diagnostics.map((result, idx) => (
                            <div
                                key={idx}
                                style={{
                                    padding: '12px',
                                    background: result.status === 'PASS' ? 'rgba(0, 255, 100, 0.03)' : result.status === 'FAIL' ? 'rgba(255, 77, 0, 0.03)' : 'rgba(0, 242, 255, 0.03)',
                                    border: `1px solid ${result.status === 'PASS' ? 'rgba(0, 255, 100, 0.15)' : result.status === 'FAIL' ? 'rgba(255, 77, 0, 0.15)' : 'rgba(0, 242, 255, 0.15)'}`,
                                    borderRadius: '4px'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                                        [{result.test.replace(/_/g, ' ')}]
                                    </span>
                                    <span
                                        style={{
                                            fontSize: '0.7rem',
                                            fontFamily: 'monospace',
                                            fontWeight: 700,
                                            color: result.status === 'PASS' ? '#00FF64' : result.status === 'FAIL' ? '#FF4D00' : '#00F2FF'
                                        }}
                                    >
                                        {result.status}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)', lineHeight: 1.5, fontFamily: 'monospace' }}>
                                    {result.message}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ padding: '20px', background: 'rgba(0, 242, 255, 0.02)', border: '1px solid rgba(0, 242, 255, 0.08)', borderRadius: '12px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.8, fontFamily: 'monospace' }}>
                <strong style={{ color: '#00F2FF', display: 'block', marginBottom: '8px' }}>SYSTEM REQUIREMENTS:</strong>
                • OBSIDIAN PLUGINS :: "Obsidian REST API" (Community) must be active.<br/>
                • PORT MAPPING :: Local port 27123 must be accessible.<br/>
                • VAULT PATH :: filesystem access permissions required for backend sync.<br/>
                • SERVICE STATUS :: Backend daemon (port 3004) must be reachable.
            </div>
        </div>
    );
}

export function openVaultDebugger() {
    const debuggerEl = document.getElementById('vault-debugger-mount');
    if (debuggerEl) {
        debuggerEl.style.display = 'flex';
    }
}
