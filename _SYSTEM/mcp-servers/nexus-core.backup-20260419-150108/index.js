#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { readdir, stat } from "fs/promises";

const server = new Server({
  name: "nexus-core",
  version: "1.0.0",
});

const tools = [
  {
    name: "read_file",
    description: "Read a file's contents",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute file path" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write or create a file",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List files in a directory",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        recursive: { type: "boolean", default: false },
      },
      required: ["path"],
    },
  },
  {
    name: "search_files",
    description: "Search for files by name or content",
    inputSchema: {
      type: "object",
      properties: {
        directory: { type: "string" },
        pattern: { type: "string" },
        type: { type: "string", enum: ["name", "content"] },
      },
      required: ["directory", "pattern"],
    },
  },
  {
    name: "run_shell",
    description: "Execute a shell command",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
        cwd: { type: "string" },
      },
      required: ["command"],
    },
  },
  {
    name: "git_command",
    description: "Run a git command",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string" },
        cwd: { type: "string" },
      },
      required: ["command"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case "read_file":
        result = fs.readFileSync(args.path, "utf-8");
        break;

      case "write_file":
        fs.mkdirSync(path.dirname(args.path), { recursive: true });
        fs.writeFileSync(args.path, args.content);
        result = `Written to ${args.path}`;
        break;

      case "list_directory": {
        const files = [];
        const walk = async (dir, depth = 0) => {
          if (depth > 5) return; // Prevent infinite recursion
          const items = await readdir(dir);
          for (const item of items) {
            if (item.startsWith(".")) continue;
            const fullPath = path.join(dir, item);
            const s = await stat(fullPath);
            files.push({
              path: fullPath,
              isDirectory: s.isDirectory(),
            });
            if (args.recursive && s.isDirectory()) {
              await walk(fullPath, depth + 1);
            }
          }
        };
        await walk(args.path);
        result = JSON.stringify(files, null, 2);
        break;
      }

      case "search_files": {
        const grep =
          process.platform === "darwin" ? "grep" : "grep";
        const cmd =
          args.type === "content"
            ? `${grep} -r "${args.pattern}" "${args.directory}" 2>/dev/null || true`
            : `find "${args.directory}" -name "*${args.pattern}*" 2>/dev/null || true`;
        result = execSync(cmd, { encoding: "utf-8" });
        break;
      }

      case "run_shell":
        result = execSync(args.command, {
          cwd: args.cwd || process.cwd(),
          encoding: "utf-8",
        });
        break;

      case "git_command":
        result = execSync(`git ${args.command}`, {
          cwd: args.cwd || process.cwd(),
          encoding: "utf-8",
        });
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: "text",
          text: String(result),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
