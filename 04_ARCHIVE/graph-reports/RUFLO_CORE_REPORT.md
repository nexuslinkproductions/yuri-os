# Graph Report - RESEARCH/ruflo/ruflo  (2026-04-23)

## Corpus Check
- Large corpus: 441 files · ~337,313 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 960 nodes · 1508 edges · 32 communities detected
- Extraction: 68% EXTRACTED · 32% INFERRED · 0% AMBIGUOUS · INFERRED: 486 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 199|Community 199]]
- [[_COMMUNITY_Community 200|Community 200]]

## God Nodes (most connected - your core abstractions)
1. `GET()` - 83 edges
2. `POST()` - 58 edges
3. `error()` - 47 edges
4. `test()` - 35 edges
5. `DELETE()` - 27 edges
6. `log()` - 25 edges
7. `RvfCollection` - 22 edges
8. `PostgresCollection` - 19 edges
9. `randomUUID()` - 17 edges
10. `main()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `isVideoUrl()` --calls--> `test()`  [INFERRED]
  /Users/marcelspatz/NUDIMMUD/RESEARCH/ruflo/ruflo/src/ruvocal/src/lib/utils/marked.ts → /Users/marcelspatz/NUDIMMUD/RESEARCH/ruflo/ruflo/src/ruvocal/mcp-bridge/test-harness.js
- `isAudioUrl()` --calls--> `test()`  [INFERRED]
  /Users/marcelspatz/NUDIMMUD/RESEARCH/ruflo/ruflo/src/ruvocal/src/lib/utils/marked.ts → /Users/marcelspatz/NUDIMMUD/RESEARCH/ruflo/ruflo/src/ruvocal/mcp-bridge/test-harness.js
- `isFencedBlockClosed()` --calls--> `test()`  [INFERRED]
  /Users/marcelspatz/NUDIMMUD/RESEARCH/ruflo/ruflo/src/ruvocal/src/lib/utils/marked.ts → /Users/marcelspatz/NUDIMMUD/RESEARCH/ruflo/ruflo/src/ruvocal/mcp-bridge/test-harness.js
- `validateHeader()` --calls--> `test()`  [INFERRED]
  /Users/marcelspatz/NUDIMMUD/RESEARCH/ruflo/ruflo/src/ruvocal/src/lib/utils/mcpValidation.ts → /Users/marcelspatz/NUDIMMUD/RESEARCH/ruflo/ruflo/src/ruvocal/mcp-bridge/test-harness.js
- `init()` --calls--> `initServer()`  [INFERRED]
  /Users/marcelspatz/NUDIMMUD/RESEARCH/ruflo/ruflo/src/ruvocal/src/hooks.server.ts → /Users/marcelspatz/NUDIMMUD/RESEARCH/ruflo/ruflo/src/ruvocal/src/lib/server/hooks/init.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (35): AbortRegistry, addSibling(), authCondition(), applyUpdate(), handleDetailMessage(), handleWorkerMessage(), buildPrompt(), buildSubtree() (+27 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (31): ConfigManager, mockUrl(), Database, getCollectionsEarly(), onExit(), seed(), applyUpdate(), deleteNestedValue() (+23 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (40): chunk(), range(), add(), runExitHandler(), autopilotSleep(), buildSystemPrompt(), callCloudFunction(), createMcpHandler() (+32 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (11): camelCase(), filterToWhere(), getPool(), jsonbPath(), ObjectId, PostgresCollection, PostgresCursor, PostgresGridFSBucket (+3 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (40): generateFrame(), main(), isVirtualKeyboard(), countSingleAsterisks(), countSingleBackticks(), countSingleUnderscores(), countTripleAsterisks(), getOpenCodeFenceIndex() (+32 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (29): archSelectRoute(), lastNTurns(), parseRouteName(), toRouterPrompt(), handleEvent(), queueUpdate(), extractUpstreamError(), getModels() (+21 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (26): convertMessageUpdate(), convertMessageUpdate(), validateMimeType(), endpointOai(), error(), chooseImageSize(), chooseMimeType(), convertImage() (+18 more)

### Community 7 - "Community 7"
Cohesion: 0.1
Nodes (26): authenticateRequest(), findUser(), generateCsrfToken(), getCoupledCookieHash(), getOIDCAuthorizationUrl(), getOIDCClient(), getOIDCUserData(), refreshOAuthToken() (+18 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (19): handleServerError(), handleFetchRequest(), getClientAddressSafe(), handleRequest(), handle(), handleError(), handleFetch(), init() (+11 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (9): deleteBatch(), deleteConversations(), processCursor(), AbortedGenerations, getReturnFromGenerator(), captureProviderFetch(), checkAborted(), RvfCursor (+1 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (18): processMessage(), cacheKey(), createMarkedInstance(), escapeHTML(), hashString(), isAudioUrl(), isFencedBlockClosed(), isVideoUrl() (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (16): initExitHandler(), confirm(), fire(), getInstance(), selection(), supportsHaptics(), tap(), initServer() (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.1
Nodes (7): apiCall(), endpoint(), useAPIClient(), load(), load(), getConfigManager(), PublicConfigManager

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (9): downloadFile(), getHref(), checkUrlSafety(), isPrivateOrLocalhost(), sanitizeUrlForDisplay(), validateHeader(), validateMcpServerUrl(), ObjectId (+1 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (14): addChildren(), applyModelState(), buildModels(), createValidModelIdSchema(), getChatPromptRender(), getModelOverrides(), processModel(), rebuildModels() (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.19
Nodes (10): applyStreamingMode(), enqueue(), fetchMessageUpdates(), flushPendingBuffer(), isMessageToolCallUpdate(), isMessageToolErrorUpdate(), isMessageToolProgressUpdate(), isMessageToolResultUpdate() (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.21
Nodes (3): createConversationFromShare(), MetricsServer, compileTemplate()

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (8): remove(), applyDarkClass(), getThemePreference(), notify(), setMetaThemeColor(), setTheme(), subscribeToTheme(), switchTheme()

### Community 18 - "Community 18"
Cohesion: 0.25
Nodes (4): requireAuthUser(), handleNavItemClick(), handleNewChatClick(), handleVisible()

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (6): ADR-001: Extension Architecture, ADR-014: Chat System Architecture, Chat Orchestrator Service, [Screenshot] Omni Welcome Screen, ruFlo Brand Logo, RuVector Database

### Community 21 - "Community 21"
Cohesion: 0.7
Nodes (3): cleanup(), createTextTexture(), initScene()

### Community 22 - "Community 22"
Cohesion: 0.4
Nodes (1): UpdateDebouncer

### Community 23 - "Community 23"
Cohesion: 0.5
Nodes (4): ADR-032: RVF Private MCP Tunnel, ADR-033: RuVector + Ruflo MCP Integration, MCP Bridge, [Screenshot] MCP Tools Thumbnail

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (2): stripReasoningBlocks(), stripReasoningFromMessageForRouting()

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (2): guessMimeFromUrl(), pickSafeMime()

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (2): getForceReattach(), snapScrollToBottom()

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (1): children()

### Community 37 - "Community 37"
Cohesion: 0.67
Nodes (1): hidden

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (1): x

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (1): invisible

### Community 199 - "Community 199"
Cohesion: 1.0
Nodes (1): [Screenshot] AI Assistants Thumbnail

### Community 200 - "Community 200"
Cohesion: 1.0
Nodes (1): Castle Example Image Pattern

## Knowledge Gaps
- **12 isolated node(s):** `x`, `invisible`, `hidden`, `ADR-032: RVF Private MCP Tunnel`, `ruFlo Brand Logo` (+7 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 22`** (5 nodes): `updates.ts`, `UpdateDebouncer`, `.endRender()`, `.maxUpdateTime()`, `.startRender()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (3 nodes): `stripReasoningBlocks()`, `stripReasoningFromMessageForRouting()`, `routing.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (3 nodes): `guessMimeFromUrl()`, `pickSafeMime()`, `mime.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (3 nodes): `getForceReattach()`, `snapScrollToBottom()`, `snapScrollToBottom.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (3 nodes): `children()`, `+layout.svelte`, `+layout.svelte`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (3 nodes): `hidden`, `if()`, `+layout.svelte`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (2 nodes): `x`, `HoverTooltip.svelte`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (2 nodes): `UploadedFile.svelte`, `invisible`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 199`** (1 nodes): `[Screenshot] AI Assistants Thumbnail`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 200`** (1 nodes): `Castle Example Image Pattern`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `GET()` connect `Community 0` to `Community 1`, `Community 2`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 11`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 18`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Why does `POST()` connect `Community 0` to `Community 1`, `Community 2`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 8`, `Community 9`, `Community 11`, `Community 12`, `Community 13`, `Community 14`, `Community 15`, `Community 16`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Why does `error()` connect `Community 6` to `Community 0`, `Community 1`, `Community 2`, `Community 4`, `Community 5`, `Community 7`, `Community 8`, `Community 9`, `Community 11`, `Community 13`, `Community 14`, `Community 15`, `Community 16`, `Community 17`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Are the 54 inferred relationships involving `GET()` (e.g. with `._onData()` and `executeTool()`) actually correct?**
  _`GET()` has 54 INFERRED edges - model-reasoned connections that need verification._
- **Are the 41 inferred relationships involving `POST()` (e.g. with `resolveStreamingMode()` and `.updateOne()`) actually correct?**
  _`POST()` has 41 INFERRED edges - model-reasoned connections that need verification._
- **Are the 45 inferred relationships involving `error()` (e.g. with `main()` and `getCurrentCommitSHA()`) actually correct?**
  _`error()` has 45 INFERRED edges - model-reasoned connections that need verification._
- **Are the 20 inferred relationships involving `test()` (e.g. with `executeTool()` and `assertValidHostname()`) actually correct?**
  _`test()` has 20 INFERRED edges - model-reasoned connections that need verification._