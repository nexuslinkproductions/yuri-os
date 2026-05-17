import assert from 'node:assert/strict';
import { buildLaunchctlCommands, buildOllamaKvProfile, buildServeCommand } from './ollama-kv-config.mjs';

const profile = buildOllamaKvProfile({
  host: '127.0.0.1:11434',
  kvCacheType: 'q8_0',
  flashAttention: true,
  noCloud: true
});

assert.equal(profile.OLLAMA_HOST, '127.0.0.1:11434');
assert.equal(profile.OLLAMA_FLASH_ATTENTION, '1');
assert.equal(profile.OLLAMA_KV_CACHE_TYPE, 'q8_0');
assert.equal(profile.OLLAMA_NO_CLOUD, '1');

const commands = buildLaunchctlCommands(profile);
assert.equal(commands.length, 4);
assert.deepEqual(commands[1], ['launchctl', 'setenv', 'OLLAMA_FLASH_ATTENTION', '1']);

const serve = buildServeCommand(profile);
assert.equal(serve.command, 'ollama');
assert.deepEqual(serve.args, ['serve']);
assert.equal(serve.env.OLLAMA_KV_CACHE_TYPE, 'q8_0');

console.log('ollama-kv-config: pass');
