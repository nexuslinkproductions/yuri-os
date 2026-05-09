/**
 * Framer MCP Server
 *
 * MCP server exposing Framer's Server API as tools for Claude, Codex,
 * OpenClaw, or any MCP-compatible agent.
 *
 * Usage:
 *   FRAMER_PROJECT_URL="..." FRAMER_API_KEY="..." npx tsx src/index.ts
 *
 * Or in Claude Desktop / OpenClaw config:
 *   "framer-mcp": {
 *     "command": "npx",
 *     "args": ["tsx", "/path/to/FRAMER_MCP/src/index.ts"],
 *     "env": {
 *       "FRAMER_PROJECT_URL": "https://framer.com/projects/...",
 *       "FRAMER_API_KEY": "your-key"
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { connect } from "framer-api"
import "dotenv/config"

// ── Config ───────────────────────────────────────────────────────────

const PROJECT_URL = process.env.FRAMER_PROJECT_URL
const API_KEY     = process.env.FRAMER_API_KEY

if (!PROJECT_URL || !API_KEY) {
  console.error("Missing FRAMER_PROJECT_URL or FRAMER_API_KEY in environment")
  process.exit(1)
}

// ── Server ───────────────────────────────────────────────────────────

const server = new Server(
  { name: "framer-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
)

// ── Tool Schema ──────────────────────────────────────────────────────

const TOOLS = [
  // ── Project Info ──
  {
    name: "framer_get_project_info",
    description: "Get project name and ID",
    inputSchema: { type: "object", properties: {}, required: [] },
  },

  // ── Collections ──
  {
    name: "framer_list_collections",
    description: "List all CMS collections in the project",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "framer_get_collection_items",
    description: "Get all items from a specific CMS collection by its ID",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Collection ID from framer_list_collections" },
      },
      required: ["collectionId"],
    },
  },
  {
    name: "framer_get_collection_fields",
    description: "Get field definitions for a CMS collection",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Collection ID" },
      },
      required: ["collectionId"],
    },
  },
  {
    name: "framer_create_cms_item",
    description: "Create a new item in a user-managed CMS collection. Provide fieldData keyed by field ID.",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Collection ID" },
        slug: { type: "string", description: "URL slug (unique within collection)" },
        fieldData: {
          type: "object",
          description: "Field data keyed by field ID. Use framer_get_collection_fields to get field IDs.",
          additionalProperties: true,
        },
      },
      required: ["collectionId", "slug"],
    },
  },
  {
    name: "framer_update_cms_item",
    description: "Update an existing CMS item's field data",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Collection ID" },
        itemId: { type: "string", description: "Item ID to update" },
        slug: { type: "string", description: "New slug (optional)" },
        fieldData: {
          type: "object",
          description: "Field data keyed by field ID",
          additionalProperties: true,
        },
      },
      required: ["collectionId", "itemId"],
    },
  },
  {
    name: "framer_delete_cms_item",
    description: "Delete an item from a CMS collection",
    inputSchema: {
      type: "object",
      properties: {
        collectionId: { type: "string", description: "Collection ID" },
        itemId: { type: "string", description: "Item ID to delete" },
      },
      required: ["collectionId", "itemId"],
    },
  },

  // ── Publishing ──
  {
    name: "framer_get_changed_paths",
    description: "Get paths that have been added, removed, or modified since the last publish",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "framer_publish",
    description: "Create a new preview/staging deployment",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "framer_deploy",
    description: "Promote a deployment to production",
    inputSchema: {
      type: "object",
      properties: {
        deploymentId: { type: "string", description: "Deployment ID from framer_publish" },
      },
      required: ["deploymentId"],
    },
  },
]

// ── Handler ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  const framer = await connect(PROJECT_URL!, API_KEY!)

  try {
    let result: unknown

    switch (name) {
      // ── Project Info ──
      case "framer_get_project_info": {
        result = await framer.getProjectInfo()
        break
      }

      // ── Collections ──
      case "framer_list_collections": {
        const collections = await framer.getCollections()
        result = collections.map((c: any) => ({
          id: c.id,
          name: c.name,
          slugFieldName: c.slugFieldName,
          managedBy: c.managedBy,
        }))
        break
      }

      case "framer_get_collection_items": {
        const { collectionId } = args as { collectionId: string }
        const collection = await framer.getCollection(collectionId)
        if (!collection) throw new Error(`Collection "${collectionId}" not found`)
        const items = await collection.getItems()
        result = items.map((item: any) => ({
          id: item.id,
          slug: item.slug,
          draft: item.draft,
          fieldData: item.fieldData,
        }))
        break
      }

      case "framer_get_collection_fields": {
        const { collectionId } = args as { collectionId: string }
        const collection = await framer.getCollection(collectionId)
        if (!collection) throw new Error(`Collection "${collectionId}" not found`)
        const fields = await collection.getFields()
        result = fields.map((f: any) => ({
          id: f.id,
          name: f.name,
          type: f.type,
        }))
        break
      }

      // ── Item CRUD ──
      case "framer_create_cms_item": {
        const { collectionId, slug, fieldData } = args as {
          collectionId: string
          slug: string
          fieldData?: Record<string, unknown>
        }
        const collection = await framer.getCollection(collectionId)
        if (!collection) throw new Error(`Collection "${collectionId}" not found`)

        const fields = await collection.getFields()
        const mappedFieldData: Record<string, { type: string; value: unknown }> = {}

        if (fieldData) {
          for (const field of fields) {
            const val = fieldData[field.id]
            if (val !== undefined) {
              mappedFieldData[field.id] = { type: field.type, value: val }
            }
          }
        }

        await collection.addItems([{ slug, fieldData: mappedFieldData as any }])
        result = { success: true, slug }
        break
      }

      case "framer_update_cms_item": {
        const { collectionId, itemId, slug, fieldData } = args as {
          collectionId: string
          itemId: string
          slug?: string
          fieldData?: Record<string, unknown>
        }
        const collection = await framer.getCollection(collectionId)
        if (!collection) throw new Error(`Collection "${collectionId}" not found`)

        const fields = await collection.getFields()
        const mappedFieldData: Record<string, { type: string; value: unknown }> = {}

        if (fieldData) {
          for (const field of fields) {
            const val = fieldData[field.id]
            if (val !== undefined) {
              mappedFieldData[field.id] = { type: field.type, value: val }
            }
          }
        }

        const updateAttrs: Record<string, unknown> = { id: itemId }
        if (slug) updateAttrs.slug = slug
        if (Object.keys(mappedFieldData).length > 0) {
          updateAttrs.fieldData = mappedFieldData
        }

        await collection.addItems([updateAttrs as any])
        result = { success: true, updatedId: itemId }
        break
      }

      case "framer_delete_cms_item": {
        const { collectionId, itemId } = args as { collectionId: string; itemId: string }
        const collection = await framer.getCollection(collectionId)
        if (!collection) throw new Error(`Collection "${collectionId}" not found`)
        await collection.removeItems([itemId])
        result = { success: true, deletedId: itemId }
        break
      }

      // ── Publishing ──
      case "framer_get_changed_paths": {
        result = await framer.getChangedPaths()
        break
      }

      case "framer_publish": {
        result = await framer.publish()
        break
      }

      case "framer_deploy": {
        const { deploymentId } = args as { deploymentId: string }
        await framer.deploy(deploymentId)
        result = { success: true, deploymentId }
        break
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      isError: true,
      content: [{ type: "text", text: message }],
    }
  } finally {
    await framer.disconnect()
  }
})

// ── Start ────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("Framer MCP server running on stdio")
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
