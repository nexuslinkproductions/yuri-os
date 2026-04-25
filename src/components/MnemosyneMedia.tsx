import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const MnemosyneMedia: React.FC = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [sessionSummary, setSessionSummary] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<any[]>([]);

    const startPerception = () => {
        setIsRecording(true);
        // Logic would call backend to trigger videodb capture
        console.log('⬡ MNEMOSYNE_START :: Desktop Perception Activated');
    };

    const stopPerception = async () => {
        setIsRecording(false);
        setLoading(true);
        // Simulated summary generation
        setTimeout(() => {
            setSessionSummary("Session involved deep-dive refactoring of the NUDIMMUD cognitive core. Key focus: High-density telemetry in Indra and Physis. Neural entropy remained nominal. Recommendation: Finalize the MediaDeck integration.");
            setLoading(false);
        }, 2000);
    };

    return (
        <div className="mnemosyne-container" style={{ padding: '40px', height: '100%', overflowY: 'auto' }}>
            <header style={{ marginBottom: '50px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h1 className="text-mono glow-text" style={{ color: 'var(--cyan-glow)', letterSpacing: '0.4em', fontSize: '2.2rem', marginBottom: '8px', margin: 0 }}>
                        MNEMOSYNE // MEDIA_C2
                    </h1>
                    <div className="text-mono" style={{ fontSize: '0.7rem', opacity: 0.4 }}>
                        EPISODIC_MEMORY_Ingestion // MULTIMEDIA_AWARENESS_v1.0
                    </div>
                </div>
                
                <div style={{ textAlign: 'right' }}>
                    <div className="text-mono" style={{ fontSize: '0.6rem', opacity: 0.3 }}>PERCEPTION_STATUS</div>
                    <div className="text-mono" style={{ fontSize: '1.2rem', color: isRecording ? 'var(--red-fusion)' : 'var(--cyan-glow)', fontWeight: 900 }}>
                        {isRecording ? 'ACTIVE_RECORDING' : 'READY'}
                    </div>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '30px', height: 'calc(100% - 150px)' }}>
                {/* PRIMARY VIEW: PERCEPTION HUB */}
                <div className="neural-glass" style={{ padding: '40px', display: 'flex', flexDirection: 'column', gap: '30px', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <motion.div 
                            animate={{ scale: isRecording ? [1, 1.1, 1] : 1, opacity: isRecording ? [0.5, 1, 0.5] : 0.2 }}
                            transition={{ duration: 2, repeat: Infinity }}
                            style={{ 
                                width: '150px', height: '150px', borderRadius: '50%', 
                                background: isRecording ? 'var(--red-fusion)' : 'var(--cyan-glow)',
                                filter: 'blur(40px)', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: -1
                            }}
                        />
                        <div style={{ 
                            width: '80px', height: '80px', borderRadius: '50%', 
                            border: `2px solid ${isRecording ? 'var(--red-fusion)' : 'var(--cyan-glow)'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem'
                        }}>
                            {isRecording ? '⏺' : '👁'}
                        </div>
                    </div>

                    <div>
                        <h2 className="text-mono" style={{ fontSize: '1.5rem', marginBottom: '10px' }}>
                            {isRecording ? 'SWARM_EYE: ACTIVE' : 'ACTIVATE_DESKTOP_PERCEPTION'}
                        </h2>
                        <p className="text-mono" style={{ fontSize: '0.75rem', opacity: 0.4, maxWidth: '400px', margin: '0 auto' }}>
                            {isRecording 
                                ? 'Capturing screen, audio, and system events for episodic memory ingestion. Real-time alerts enabled.' 
                                : 'Initialize a high-fidelity capture session to store mission-critical reflections and technical evidence.'}
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '20px' }}>
                        {!isRecording ? (
                            <button 
                                onClick={startPerception}
                                className="text-mono"
                                style={{ 
                                    padding: '15px 40px', background: 'var(--cyan-glow)', color: 'black', 
                                    border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 900, fontSize: '0.8rem'
                                }}
                            >
                                START_PERCEPTION_SESSION
                            </button>
                        ) : (
                            <button 
                                onClick={stopPerception}
                                className="text-mono"
                                style={{ 
                                    padding: '15px 40px', background: 'var(--red-fusion)', color: 'white', 
                                    border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 900, fontSize: '0.8rem'
                                }}
                            >
                                TERMINATE_&_REFLECT
                            </button>
                        )}
                    </div>
                </div>

                {/* SIDEBAR: SESSION REFLECTION */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="neural-glass" style={{ flex: 1, padding: '25px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="text-mono" style={{ fontSize: '0.6rem', opacity: 0.3, letterSpacing: '0.2em' }}>SESSION_REFLECTION</div>
                        
                        {loading ? (
                            <div className="text-mono" style={{ opacity: 0.3, textAlign: 'center', padding: '40px' }}>SYNTHESIZING_EPISODIC_MEMORIES...</div>
                        ) : sessionSummary ? (
                            <div className="text-mono" style={{ fontSize: '0.75rem', lineHeight: '1.6', opacity: 0.8 }}>
                                <span style={{ color: 'var(--cyan-glow)' }}>BRIEF:</span> {sessionSummary}
                                <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <button className="text-mono" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '8px', fontSize: '0.6rem', cursor: 'pointer' }}>
                                        OPEN_PLAYABLE_EVIDENCE
                                    </button>
                                    <button className="text-mono" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '8px', fontSize: '0.6rem', cursor: 'pointer' }}>
                                        SYNC_TO_OBSIDIAN_VAULT
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-mono" style={{ opacity: 0.2, textAlign: 'center', padding: '40px', fontSize: '0.65rem' }}>
                                NO_ACTIVE_SUMMARY // COMPLETE_A_SESSION_TO_GENERATE_REFLECTION
                            </div>
                        )}
                    </div>

                    <div className="neural-glass" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📽️</div>
                        <div>
                            <div className="text-mono" style={{ fontSize: '0.65rem', fontWeight: 900 }}>VIDEODB_INTEGRATION</div>
                            <div className="text-mono" style={{ fontSize: '0.55rem', opacity: 0.3 }}>MULTIMEDIA_PERCEPTION_ENGINE</div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .neural-glass {
                    backdrop-filter: blur(25px) saturate(180%);
                    background: rgba(17, 25, 40, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
            `}</style>
        </div>
    );
};

export default MnemosyneMedia;
