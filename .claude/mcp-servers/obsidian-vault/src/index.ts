#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const readDir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

const VAULT_ROOT = "/Users/marcelspatz/NUDIMMUD";

interface VaultFile {
  path: string;
  name: string;
  isFile: boolean;
  size?: number;
}

// Recursively scan vault and build index
async function indexVault(dir: string, basePath: string = ""): Promise<VaultFile[]> {
  const files: VaultFile[] = [];

  try {
    const entries = await readDir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.name === ".obsidian" ||
        entry.name === "graph" ||
        entry.name === "RESEARCH"
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.isFile()) {
        const fileStats = await stat(fullPath);
        files.push({
          path: relativePath,
          name: entry.name,
          isFile: true,
          size: fileStats.size,
        });
      } else if (entry.isDirectory()) {
        files.push({
          path: relativePath,
          name: entry.name,
          isFile: false,
        });
        const subFiles = await indexVault(fullPath, relativePath);
        files.push(...subFiles);
      }
    }
  } catch (error) {
    console.error(`Error indexing ${dir}:`, error);
  }

  return files;
}

// Search for notes matching a pattern
async function searchNotes(
  pattern: string,
  fileIndex: VaultFile[]
): Promise<VaultFile[]> {
  const regex = new RegExp(pattern, "i");
  return fileIndex.filter((file) => file.isFile && regex.test(file.path));
}

// Read note contents
async function readNote(filePath: string): Promise<string> {
  const fullPath = path.join(VAULT_ROOT, filePath);

  // Security: prevent directory traversal
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(VAULT_ROOT))) {
    throw new Error("Access denied: path outside vault");
  }

  const content = await readFile(resolved, "utf-8");
  return content;
}

// List vault structure with hierarchy
async function getVaultStructure(): Promise<string> {
  const files = await indexVault(VAULT_ROOT);
  const folders = Array.from(new Set(files.filter((f) => !f.isFile).map((f) => f.path)))
    .sort();
  const markdownFiles = files.filter((f) => f.isFile && f.name.endsWith(".md"));

  let output = "# NUDIMMUD Vault Structure\n\n";
  output += `**Total Markdown Files:** ${markdownFiles.length}\n`;
  output += `**Total Folders:** ${folders.length}\n\n`;

  output += "## Key Folders\n";
  const keyFolders = [
    "00_COMMAND-CENTER",
    "01_PROJECTS",
    "02_AREAS",
    "03_RESOURCES",
    "04_FINANCE",
    "05_NEXUS-LINK",
    "06_NETWORK-SYNC",
    "07_ARCHIVE",
    "_SYSTEM",
  ];

  for (const folder of keyFolders) {
    const folderFiles = markdownFiles.filter((f) => f.path.startsWith(folder));
    if (folderFiles.length > 0) {
      output += `\n### ${folder}\n`;
      output += `- Files: ${folderFiles.length}\n`;
      const topLevel = folderFiles
        .filter((f) => !f.path.substring(folder.length + 1).includes("/"))
        .slice(0, 5);
      if (topLevel.length > 0) {
        output += "- Top files:\n";
        for (const file of topLevel) {
          output += `  - ${file.name}\n`;
        }
      }
    }
  }

  return output;
}

// Query palace-index for navigation
async function queryPalaceIndex(query: string): Promise<string> {
  try {
    const palaceIndex = await readNote("claude-palace-out/palace-index.md");
    const lines = palaceIndex.split("\n");

    // Search for relevant lines
    const regex = new RegExp(query, "i");
    const relevant = lines
      .filter((line) => regex.test(line) && line.trim().length > 0)
      .slice(0, 20);

    if (relevant.length === 0) {
      return `No palace-index entries matching "${query}" found.`;
    }

    return `Palace Index Results for "${query}":\n\n${relevant.join("\n")}`;
  } catch (error) {
    return `Error reading palace-index: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const server = new Server(
  {
    name: "obsidian-vault",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Track vault index in memory
let vaultIndex: VaultFile[] = [];
let indexBuiltAt = new Date();

// Initialize vault index
async function initializeVault() {
  console.error("[INIT] Building vault index...");
  vaultIndex = await indexVault(VAULT_ROOT);
  indexBuiltAt = new Date();
  console.error(
    `[INIT] Vault indexed: ${vaultIndex.filter((f) => f.isFile).length} files`
  );
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: Tool[] = [
    {
      name: "vault_structure",
      description:
        "Get an overview of the NUDIMMUD vault structure with folder counts and key files",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "list_vault_files",
      description:
        "List all markdown files in the vault, optionally filtered by folder",
      inputSchema: {
        type: "object" as const,
        properties: {
          folder: {
            type: "string",
            description:
              "Optional: filter by folder (e.g., '01_PROJECTS', '04_FINANCE')",
          },
          limit: {
            type: "number",
            description: "Maximum number of files to return (default: 50)",
          },
        },
        required: [],
      },
    },
    {
      name: "search_notes",
      description: "Search for notes by filename or path pattern",
      inputSchema: {
        type: "object" as const,
        properties: {
          pattern: {
            type: "string",
            description: "Regex pattern to match against file paths (case-insensitive)",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 20)",
          },
        },
        required: ["pattern"],
      },
    },
    {
      name: "read_note",
      description: "Read the contents of a markdown note from the vault",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description:
              "Path to the note relative to vault root (e.g., '00_COMMAND-CENTER/HOME.md')",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "query_palace_index",
      description:
        "Query the palace-index.md for efficient vault navigation and structure insights",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description:
              "Search term or pattern to find in the palace index (e.g., 'PROJECT', 'FINANCE')",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "rebuild_index",
      description:
        "Rebuild the vault index if files have changed (updates cached file list)",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
  ];

  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: string;

    switch (name) {
      case "vault_structure": {
        result = await getVaultStructure();
        break;
      }

      case "list_vault_files": {
        const folder = (args as any).folder || "";
        const limit = (args as any).limit || 50;

        let files = vaultIndex.filter(
          (f) => f.isFile && f.name.endsWith(".md")
        );

        if (folder) {
          files = files.filter((f) => f.path.startsWith(folder));
        }

        files = files.slice(0, limit);
        result =
          `Vault Files (${files.length} shown):\n\n` +
          files.map((f) => `- ${f.path} (${f.size} bytes)`).join("\n");
        break;
      }

      case "search_notes": {
        const pattern = (args as any).pattern;
        const limit = (args as any).limit || 20;

        const results = await searchNotes(pattern, vaultIndex);
        const limited = results.slice(0, limit);

        result =
          `Search results for "${pattern}" (${limited.length} found):\n\n` +
          (limited.length > 0
            ? limited.map((f) => `- ${f.path}`).join("\n")
            : "No matches found");
        break;
      }

      case "read_note": {
        const filePath = (args as any).path;
        const content = await readNote(filePath);
        result = content;
        break;
      }

      case "query_palace_index": {
        const query = (args as any).query;
        result = await queryPalaceIndex(query);
        break;
      }

      case "rebuild_index": {
        vaultIndex = await indexVault(VAULT_ROOT);
        indexBuiltAt = new Date();
        result = `Vault index rebuilt. Found ${vaultIndex.filter((f) => f.isFile).length} files. Built at: ${indexBuiltAt.toISOString()}`;
        break;
      }

      default:
        result = `Unknown tool: ${name}`;
    }

    return {
      type: "tool_result" as const,
      content: [
        {
          type: "text",
          text: result,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      type: "tool_result" as const,
      isError: true,
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
    };
  }
});

// Main execution
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Initialize vault index on startup
  await initializeVault();

  console.error("[READY] Obsidian Vault MCP server running");
  console.error(`[VAULT] Root: ${VAULT_ROOT}`);
  console.error(`[INDEX] Files indexed at: ${indexBuiltAt.toISOString()}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
