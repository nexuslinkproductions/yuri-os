// No @claude lane — add via: nexbox config add-lane claude

export const NEXBOX_CONTRACT = {
  version: 1,
  lanes: {
    deepseek: {
      alias: '@deepseek',
      envKey: 'DEEPSEEK_API_KEY',
      defaultModel: 'deepseek-chat',
      description: 'DeepSeek cloud reasoning (opt-in)',
    },
    kimi: {
      alias: '@kimi',
      envKey: 'KIMI_API_KEY',
      defaultModel: 'moonshot-v1-128k',
      description: 'Kimi cloud reasoning (opt-in)',
    },
    nvidia: {
      alias: '@nvidia',
      envKey: 'NVIDIA_API_KEY',
      defaultModel: 'nvidia/llama-3.1-nemotron-70b-instruct',
      description: 'NVIDIA NIM inference (opt-in)',
    },
    ollama: {
      alias: '@ollama-local',
      envKey: null,
      defaultModel: 'qwen2.5:7b',
      description: 'Local Ollama (always available)',
    },
    codex: {
      alias: '@codex-spark',
      envKey: 'OPENAI_API_KEY',
      defaultModel: 'gpt-5.4-mini',
      description: 'Codex Spark implementation lane (opt-in)',
    },
  },
  defaultLane: 'ollama',
};

export default NEXBOX_CONTRACT;

if (process.argv.includes('--check')) {
  console.log(`ok:${NEXBOX_CONTRACT.defaultLane}:${Object.keys(NEXBOX_CONTRACT.lanes).length}`);
}
