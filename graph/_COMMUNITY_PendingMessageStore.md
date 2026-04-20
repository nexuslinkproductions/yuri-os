---
type: community
cohesion: 0.07
members: 27
---

# PendingMessageStore

**Cohesion:** 0.07 - loosely connected
**Members:** 27 nodes

## Members
- [[.abortMessage()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.claimNextMessage()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.clearAll()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.clearFailed()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.confirmProcessed()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.constructor()_31]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.enqueue()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.getAllPending()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.getPendingCount()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.getQueueMessages()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.getRecentlyProcessed()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.getSessionInfoForMessage()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.getSessionsWithPendingMessages()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.getStuckCount()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.hasAnyPendingWork()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.markAllSessionMessagesAbandoned()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.markFailed()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.markSessionMessagesFailed()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.peekPendingTypes()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.resetProcessingToPending()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.resetStaleProcessingMessages()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.resetStuckMessages()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.retryAllStuck()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.retryMessage()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[.toPendingMessage()]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[PendingMessageStore]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts
- [[PendingMessageStore.ts]] - code - 01_PROJECTS/claude-mem/src/services/sqlite/PendingMessageStore.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/PendingMessageStore
SORT file.name ASC
```
