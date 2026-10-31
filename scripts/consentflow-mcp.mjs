#!/usr/bin/env node
// ConsentFlow MCP server over stdio (L2). Read-only tools: check_url, explain_finding, list_checks.
//
//   node scripts/consentflow-mcp.mjs
//
// stdout carries JSON-RPC and nothing else. Before anything else loads (the server and the
// runner are imported dynamically below, after this runs), every console method is routed to
// stderr, and so is any other process.stdout.write; the transport alone gets the real stdout.
import { Console } from "node:console";

const stderrConsole = new Console({ stdout: process.stderr, stderr: process.stderr });
for (const key of Object.keys(Console.prototype).concat(Object.keys(console))) {
  if (typeof stderrConsole[key] === "function") console[key] = stderrConsole[key].bind(stderrConsole);
}
const realStdout = process.stdout;
const writeStdout = realStdout.write.bind(realStdout);
realStdout.write = (...args) => process.stderr.write(...args);
// What the transport needs from a stream: write() and once('drain').
const jsonRpcOut = { write: writeStdout, once: (event, cb) => realStdout.once(event, cb) };

const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
const { createServer } = await import("./mcp/server.mjs");

const server = createServer();
await server.connect(new StdioServerTransport(process.stdin, jsonRpcOut));
process.stderr.write("consentflow MCP server ready on stdio (read-only tools: check_url, explain_finding, list_checks)\n");

// Exit when the client closes stdin.
process.stdin.on("end", () => process.exit(0));
