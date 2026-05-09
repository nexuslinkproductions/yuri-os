type WakeWord = 'idle' | 'active' | 'listening';

export const MOCK_ORACLE = {
  wakeWord: 'idle' as WakeWord,
  lastUtterance: null as string | null,
  transcript: [
    {
      role: 'user' as const,
      text: 'oracle status?',
      ts: Date.now() - 60000,
    },
    {
      role: 'oracle' as const,
      text: 'NOMINAL. All systems operational.',
      ts: Date.now() - 58000,
    },
  ] as Array<{ role: 'user' | 'oracle'; text: string; ts: number }>,
};
