#!/usr/bin/env node
import { startMCPServer } from "../mcp/server.js";
startMCPServer().catch(console.error);
