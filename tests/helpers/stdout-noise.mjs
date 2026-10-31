// Preloaded (node --import) into the MCP server process by tests/consentflow-mcp.test.mjs.
// When the first request arrives, after the server has started, it writes to stdout every way
// a dependency might, so the test can check that none of it reaches the JSON-RPC stream.
process.stdin.once("data", () => {
  console.log("noise: console.log");
  console.info("noise: console.info");
  console.debug("noise: console.debug");
  console.table(["noise: console.table"]);
  process.stdout.write("noise: stdout.write\n");
});
