# next-plugin-query-cache

> A build-time query cache for Next.js. Works by creating an HTTP server during the build that caches responses.

## Status: ⚠️ Experimental

For now, just read the source code.

## Goals

- Host a shared process where all requests will be proxied through.
- De-dupe requests at the proxy level. Ensure only one inflight request for the same resource.
- Create a process-level, in-memory query cache that benefits the runtime beyond the build (great for SSR, ISR, etc).
