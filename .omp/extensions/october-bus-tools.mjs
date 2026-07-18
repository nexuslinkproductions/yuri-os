// @capability: october-pi-essential-tools
// @serves: Pi | OMP | October bus | message_peer | task board
// @does: Registers the five October peer/task tools using the host-injected Zod runtime; October retains inbound lifecycle ownership.
// @use: Auto-discovered by OMP from .omp/extensions; October must attach OCTOBER_BUS_PORT, OCTOBER_BUS_CANVAS, and OCTOBER_BUS_NODE.
// @exports: OCTOBER_PI_TOOL_NAMES, registerOctoberPiTools

export const OCTOBER_PI_TOOL_NAMES = Object.freeze([
  'message_peer',
  'add_task',
  'claim_task',
  'complete_task',
  'list_tasks',
]);

const REQUEST_TIMEOUT_MS = 2500;

function attachedEnvironment(env) {
  const sessionRole = String(env.CAMPFIRE_SESSION_ROLE ?? '').trim();
  if (sessionRole && sessionRole !== 'host') {
    return { attached: false, partial: false, nonHost: true };
  }
  const port = String(env.OCTOBER_BUS_PORT ?? '').trim();
  const canvas = String(env.OCTOBER_BUS_CANVAS ?? '').trim();
  const node = String(env.OCTOBER_BUS_NODE ?? '').trim();
  const present = [port, canvas, node].filter(Boolean).length;
  if (present === 0) return { attached: false, partial: false };
  if (present !== 3 || !/^\d{1,5}$/u.test(port) || Number(port) < 1 || Number(port) > 65535) {
    return { attached: false, partial: true };
  }
  return { attached: true, partial: false, port, canvas, node };
}

function currentToolNames(pi) {
  try {
    const tools = pi.getAllTools?.();
    return new Set(Array.isArray(tools) ? tools.map((tool) => String(tool?.name ?? tool)) : []);
  } catch {
    return new Set();
  }
}

function toolResult(text, isError = false) {
  return {
    content: [{ type: 'text', text }],
    details: {},
    ...(isError ? { isError: true } : {}),
  };
}

function createLoopbackClient(attachment, fetchImpl) {
  const base = `http://127.0.0.1:${attachment.port}`;

  const request = async (endpoint, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetchImpl(`${base}${endpoint}`, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    async post(endpoint, body) {
      try {
        const response = await request(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) return { ok: false, reason: `http-${response.status}` };
        try { return await response.json(); } catch { return { ok: false, reason: 'invalid-response' }; }
      } catch (error) {
        return { ok: false, reason: error?.name === 'AbortError' ? 'timeout' : 'bus-unreachable' };
      }
    },
  };
}

export function registerOctoberPiTools(pi, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const attachment = attachedEnvironment(env);
  if (!attachment.attached) {
    if (attachment.partial) {
      pi.logger?.error?.('October Pi tools disabled: incomplete or invalid OCTOBER_BUS_* attachment');
    }
    return {
      registered: [],
      status: attachment.nonHost ? 'non-host-session' : (attachment.partial ? 'invalid-attachment' : 'not-attached'),
    };
  }
  if (typeof fetchImpl !== 'function') {
    pi.logger?.error?.('October Pi tools disabled: loopback fetch is unavailable');
    return { registered: [], status: 'fetch-unavailable' };
  }

  const existing = currentToolNames(pi);
  const conflicts = OCTOBER_PI_TOOL_NAMES.filter((name) => existing.has(name));
  if (conflicts.length > 0) {
    const complete = conflicts.length === OCTOBER_PI_TOOL_NAMES.length;
    pi.logger?.[complete ? 'debug' : 'error']?.(
      complete
        ? 'October Pi tools already registered by the host adapter'
        : `October Pi tools disabled: partial duplicate registration (${conflicts.join(', ')})`,
    );
    return { registered: [], status: complete ? 'host-adapter-active' : 'partial-conflict', conflicts };
  }

  const z = pi.zod?.z;
  if (!z?.object || !z?.string || !z?.array) {
    pi.logger?.error?.('October Pi tools disabled: OMP host did not inject pi.zod');
    return { registered: [], status: 'zod-unavailable' };
  }

  const client = createLoopbackClient(attachment, fetchImpl);
  const register = (definition) => pi.registerTool({ ...definition, loadMode: 'essential' });
  const busIdentity = { canvas: attachment.canvas, node: attachment.node };

  register({
    name: 'message_peer',
    label: 'Message peer',
    description: 'Send a substantive message to a connected October peer by its visible peer name.',
    approval: 'write',
    parameters: z.object({
      peer: z.string().describe('Connected peer name, for example Hermes or Atlas'),
      message: z.string().describe('Exact message to deliver verbatim'),
    }),
    async execute(_toolCallId, params) {
      const response = await client.post('/hook/message-peer', { ...busIdentity, peer: params.peer, message: params.message });
      return response?.ok
        ? toolResult(`Sent to ${params.peer}.`)
        : toolResult(`Could not send: ${response?.reason ?? 'bus-unreachable'}`, true);
    },
  });

  const taskTool = (name, label, description, parameters, toBody, approval = 'write') => register({
    name,
    label,
    description,
    approval,
    parameters,
    async execute(_toolCallId, params) {
      const response = await client.post('/hook/task', { ...busIdentity, ...toBody(params ?? {}) });
      const ok = response?.ok !== false && typeof response?.text === 'string';
      return toolResult(response?.text ?? `Could not use task board: ${response?.reason ?? 'bus-unreachable'}`, !ok);
    },
  });

  taskTool(
    'add_task',
    'Add board task',
    'Add a self-contained task to the shared October board.',
    z.object({
      description: z.string().describe('Self-contained task description'),
      after: z.array(z.string()).optional().describe('Task ids that must finish first'),
    }),
    (params) => ({ op: 'add', description: params.description, after: params.after }),
  );
  taskTool(
    'claim_task',
    'Claim board task',
    'Atomically claim a shared October board task.',
    z.object({ id: z.string().optional().describe('Task id; omit for the oldest claimable task') }),
    (params) => ({ op: 'claim', id: params.id }),
  );
  taskTool(
    'complete_task',
    'Complete board task',
    'Mark genuinely completed shared-board work done.',
    z.object({
      id: z.string().describe('Completed task id'),
      note: z.string().optional().describe('Concise result or handoff note'),
    }),
    (params) => ({ op: 'complete', id: params.id, note: params.note }),
  );
  taskTool(
    'list_tasks',
    'List board tasks',
    'Read the current shared October task board.',
    z.object({}),
    () => ({ op: 'list' }),
    'read',
  );

  return { registered: [...OCTOBER_PI_TOOL_NAMES], status: 'registered' };
}

export default function octoberPiEssentialTools(pi) {
  try {
    // Inbound remains on October's native terminal-delivery path. The current
    // pre-prompt pull currently consumes before acknowledgement, so enabling a
    // second polling reader here could lose a batch on reload or shutdown.
    return registerOctoberPiTools(pi);
  } catch (error) {
    pi.logger?.error?.('October Pi tool registration failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { registered: [], status: 'registration-failed' };
  }
}
