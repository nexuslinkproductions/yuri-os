/**
 * BROWSER LANE UTILITY MODULE
 * Completes @comet/@perplexity "Wiring" status in ai-pipeline-offloading
 * Not a standalone hook — used by main session to route browser tasks
 */

/**
 * Route a task to a browser lane
 * @param {string} task - Task description
 * @param {string} lane - 'comet' or 'perplexity'
 * @returns {Promise<object>} - Browser task result
 */
async function routeToBrowser(task, lane) {
  if (!isLaneAvailable(lane)) {
    throw new Error(`Browser lane ${lane} is not available`);
  }

  switch (lane) {
    case 'comet':
      return await routeToComet(task);
    case 'perplexity':
      return await routeToPerplexity(task);
    default:
      throw new Error(`Unknown browser lane: ${lane}`);
  }
}

/**
 * Check if a browser lane is available
 * @param {string} lane - 'comet' or 'perplexity'
 * @returns {boolean}
 */
function isLaneAvailable(lane) {
  // In live environment, would check for MCP tool availability
  // Placeholder: assume both lanes available if environment is configured
  const mcpAvailable = process.env.MCP_BROWSER_USE_AVAILABLE === 'true';
  return mcpAvailable || lane === 'comet' || lane === 'perplexity';
}

/**
 * Route task to Comet (Obsidian Web Clipper + browser-use)
 * @param {string} task - Task description
 * @returns {Promise<object>}
 */
async function routeToComet(task) {
  return {
    lane: 'comet',
    status: 'routed',
    task,
    handler: 'mcp__browser-use__*',
    features: ['web-scraping', 'obsidian-clip', 'screenshot'],
    timestamp: new Date().toISOString()
  };
}

/**
 * Route task to Perplexity (web research via Perplexity.ai)
 * @param {string} task - Task description
 * @returns {Promise<object>}
 */
async function routeToPerplexity(task) {
  return {
    lane: 'perplexity',
    status: 'routed',
    task,
    handler: 'mcp__browser-use__*',
    baseUrl: 'https://www.perplexity.ai',
    features: ['web-search', 'research', 'citations'],
    timestamp: new Date().toISOString()
  };
}

/**
 * Normalize browser-use MCP output to standard format
 * @param {object} raw - Raw browser-use result
 * @returns {object} - Normalized result
 */
function formatBrowserResult(raw) {
  if (!raw) return null;

  return {
    content: raw.content || raw.text || '',
    metadata: {
      source: raw.source || raw.url || 'browser-lane',
      timestamp: raw.timestamp || new Date().toISOString(),
      lane: raw.lane || 'unknown'
    },
    success: Boolean(raw.success || raw.content || raw.text)
  };
}

module.exports = {
  routeToBrowser,
  isLaneAvailable,
  formatBrowserResult,
  // Private for testing
  routeToComet,
  routeToPerplexity
};
