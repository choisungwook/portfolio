/**
 * Sample JavaScript file for Akbun Theme syntax highlighting test.
 * Covers: classes, arrow functions, template literals, async/await,
 *         destructuring, spread, modules, etc.
 */

import { EventEmitter } from "events";

// Constants
const MAX_CONNECTIONS = 100;
const DEFAULT_PORT = 3000;
const API_VERSION = "v2";

/**
 * Rate limiter using token bucket algorithm.
 */
class RateLimiter {
  #tokens;
  #maxTokens;
  #refillRate;
  #lastRefill;

  constructor(maxTokens = 10, refillRate = 1) {
    this.#tokens = maxTokens;
    this.#maxTokens = maxTokens;
    this.#refillRate = refillRate;
    this.#lastRefill = Date.now();
  }

  tryConsume(count = 1) {
    this.#refill();
    if (this.#tokens >= count) {
      this.#tokens -= count;
      return true;
    }
    return false;
  }

  #refill() {
    const now = Date.now();
    const elapsed = (now - this.#lastRefill) / 1000;
    this.#tokens = Math.min(
      this.#maxTokens,
      this.#tokens + elapsed * this.#refillRate
    );
    this.#lastRefill = now;
  }

  get available() {
    return Math.floor(this.#tokens);
  }
}

/**
 * Server with middleware support.
 */
class Server extends EventEmitter {
  constructor({ port = DEFAULT_PORT, host = "0.0.0.0" } = {}) {
    super();
    this.port = port;
    this.host = host;
    this.middlewares = [];
    this.limiter = new RateLimiter(MAX_CONNECTIONS);
  }

  use(middleware) {
    this.middlewares.push(middleware);
    return this;
  }

  async handleRequest(req) {
    if (!this.limiter.tryConsume()) {
      return { status: 429, body: "Too Many Requests" };
    }

    let context = { req, res: {} };
    for (const mw of this.middlewares) {
      context = await mw(context);
      if (context.res.status) break;
    }

    this.emit("request", { path: req.path, status: context.res.status });
    return context.res;
  }

  start() {
    console.log(`Server listening on ${this.host}:${this.port}`);
    this.emit("start", { port: this.port });
  }
}

// Middleware: logging
const logger = async (ctx) => {
  const start = performance.now();
  console.log(`[${new Date().toISOString()}] ${ctx.req.method} ${ctx.req.path}`);
  return { ...ctx, _startTime: start };
};

// Middleware: JSON parser
const jsonParser = async (ctx) => {
  const { body, headers } = ctx.req;
  if (headers?.["content-type"] === "application/json" && body) {
    try {
      return { ...ctx, req: { ...ctx.req, parsed: JSON.parse(body) } };
    } catch {
      return { ...ctx, res: { status: 400, body: "Invalid JSON" } };
    }
  }
  return ctx;
};

// Route handler using destructuring and template literals
const handleUsers = async ({ req, ...rest }) => {
  const { method, path, parsed } = req;
  const users = [
    { id: 1, name: "Alice", active: true },
    { id: 2, name: "Bob", active: false },
    { id: 3, name: "Charlie", active: true },
  ];

  if (method === "GET") {
    const activeOnly = path.includes("?active=true");
    const filtered = activeOnly ? users.filter((u) => u.active) : users;
    return { req, ...rest, res: { status: 200, body: JSON.stringify(filtered) } };
  }

  if (method === "POST" && parsed?.name) {
    const newUser = { id: users.length + 1, ...parsed, active: true };
    return { req, ...rest, res: { status: 201, body: JSON.stringify(newUser) } };
  }

  return { req, ...rest, res: { status: 405, body: "Method Not Allowed" } };
};

// Utility: debounce
const debounce = (fn, delay) => {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

// Async generator
async function* streamData(items) {
  for (const item of items) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    yield { timestamp: Date.now(), data: item };
  }
}

// Main
const server = new Server({ port: 8080 });
server.use(logger).use(jsonParser).use(handleUsers);

server.on("start", ({ port }) => {
  console.log(`API ${API_VERSION} ready on port ${port}`);
});

server.start();

export { Server, RateLimiter, debounce, streamData };
