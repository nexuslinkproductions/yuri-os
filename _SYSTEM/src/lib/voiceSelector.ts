const VOICE_PRIORITY = [
    'Samantha',
    'Victoria',
    'Google UK English Female',
    'Premium',
];

export function selectVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    return (
        voices.find(v => VOICE_PRIORITY.some(p => v.name.includes(p))) ??
        voices.find(v => v.name.includes('Female') && v.lang.startsWith('en')) ??
        voices.find(v => v.lang.startsWith('en')) ??
        null
    );
}

export function subscribeVoiceChange(cb: () => void): () => void {
    window.speechSynthesis?.addEventListener('voiceschanged', cb);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', cb);
}
