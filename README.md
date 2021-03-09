# next-plugin-query-cache · [![codecov](https://codecov.io/gh/ricokahler/next-plugin-query-cache/branch/main/graph/badge.svg?token=CKKTKQ5A5Z)](https://codecov.io/gh/ricokahler/next-plugin-query-cache) [![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

> A build-time query cache for Next.js. Works by creating an HTTP server during the build that caches responses.

## Quick Glance

```js
// 1) import a configured fetch function
import queryFetch from '../query-fetch';

export const getStaticProps = async () => {
  // 2) use the fetch inside of `getStaticProps` or `getStaticPaths`.
  // This function will check the cache first before making an outbound request
  const response = await queryFetch('https://some-service.com', {
    headers: {
      accept: 'application/json',
    },
  });

  const data = await response.json();

  return { props: { data } };
};

function MyPage({ data }) {
  return // ...
}

export default MyPage;
```

## Who is the library for?

This lib is for Next.js users who create static (or partially static) builds. The query cache saves responses as they are requested so shared queries across pages (e.g. for header data) are de-duplicated.

This is particularly useful if your Next.js site is powered by SaaS products that provide their API over HTTP like headless CMSes and headless ecommerce platforms (and even more useful if those SaaS services charge per API request 😅).

> 👋 **NOTE**: This lib is currently _not_ so useful for non-HTTP type of requests (e.g. database calls) since the query cache only works on an HTTP level. See [#4](https://github.com/ricokahler/next-plugin-query-cache/issues/4) for more details.

## Motivation

Unlike Gatsby, Next.js does not provide any sort of shared data layer. This is nice because it's simple and unopinionated. However, in large static sites with many repeated queries, there's a missed opportunity to cache results and share them between pages.

`next-plugin-query-cache` aims to do just that. During the build, it creates an HTTP proxy server that all concurrent build processes can go through to request a resource.

- If the proxy already has the value, it'll return it instead of fetching it.
- If a requested resource already has a request inflight, the proxy will wait till that request is finished instead of requesting it again.
- There's also an optional in-memory cache made for de-duping request on a per-page level (useful for after the build in SSR or ISR).

## Installation

### Install

```
yarn add next-plugin-query-cache
```

or

```
npm i next-plugin-query-cache
```

### Add to next.config.js

```js
// next.config.js
const createNextPluginQueryCache = require('next-plugin-query-cache/config');
const withNextPluginQueryCache = createNextPluginQueryCache({
  /**
   * (optional) if you have a preferred port for the proxy server,
   * you can add it here. otherwise, it'll pick an ephemeral port.
   * This should not be the same port as your dev server.
   */
  port: 4000,

  /**
   * (optional) provide a flag that will disable the proxy
   */
  disableProxy: process.env.DISABLE_PROXY === 'true',

  /**
   * (optional) provide a fetch implementation that the proxy will use
   */
  fetch: require('@vercel/fetch')(require('node-fetch')),

  /**
   * (optional) provide a function that returns a string. the response
   * result will be saved under that key in the cache.
   *
   * NOTE: ensure this matches the `calculateCacheKey` implementation
   * provided in `createQueryFetch`
   */
  calculateCacheKey: (url, options) => url,
});

module.exports = withNextPluginQueryCache(/* optionally add a next.js config */);
```

### Create the client `queryFetch` function

`next-plugin-query-cache` returns a decorated `window.fetch` implementation. Whenever you call this wrapped fetch, it will check the cache. If the resource is not in the cache, it will make a real request.

To create this decorated fetch function, call `createQueryFetch`.

```js
// query-fetch.js
import { createQueryFetch } from 'next-plugin-query-cache';

const { queryFetch, cache } = createQueryFetch({
  /**
   * REQUIRED: paste this as is. `process.env.NEXT_QUERY_CACHE_PORT`
   * is provided by `next-plugin-query-cache`
   */
  port: process.env.NEXT_QUERY_CACHE_PORT,

  /**
   * (optional) provide an underlying fetch implementation. defaults to
   * the global fetch.
   */
  fetch: fetch,

  /**
   * (optional) provide a function that determines whether or not
   * the request should be cached. the default implement is shown here
   */
  shouldCache: (url, options) => {
    const method = options?.method?.toUpperCase() || 'GET';
    return method === 'GET' && typeof url === 'string';
  },

  /**
   * (optional) provide a function that returns whether or not to
   * use the proxy. this function should return `true` during the
   * build but false outside of the build. `process.env.CI === 'true'`
   * works in most Next.js environments
   *
   * the default implementation is shown here.
   */
  getProxyEnabled: async () =>
    (process.env.CI === 'true' ||
      process.env.NEXT_PLUGIN_QUERY_CACHE_ACTIVE === 'true') &&
    !!process.env.NEXT_QUERY_CACHE_PORT,

  /**
   * (optional) provide a function that determines whether or not
   * the in-memory cache should be used.
   *
   * the default implementation is shown
   */
  getInMemoryCacheEnabled: async () => true,

  /**
   * (optional) provide a function that returns a string. the response
   * result will be saved under that key in the cache.
   *
   * NOTE: ensure this matches the `calculateCacheKey` implementation
   * provided in `createNextPluginQueryCache`
   */
  calculateCacheKey: (url, options) => url,
});

// the cache is an ES6 `Map` of cache keys to saved responses.
// you can optionally modify the in-memory cache using this.
cache.clear();

// export the wrapped fetch implementation
export default queryFetch;
```

### Update your build command

Assign the environmnt variable `NEXT_PLUGIN_QUERY_CACHE_ACTIVE` to enable query caching.

This is dependent on the default `getProxyEnabled` function.

```js
// package.json
{
  "scripts": {
    "build": "NEXT_PLUGIN_QUERY_CACHE_ACTIVE=true next build"
    // ...
  }
  // ...
}
```

## Usage

### Using the `queryFetch` function

After you [create the `queryFetch` function](#create-the-client-queryfetch-function), use it like you would use the native fetch function.

**When you request using this `queryFetch` function, it'll check the cache first during the build. That's it!**

```js
// /pages/my-page.js
import queryFetch from '../query-fetch';

export const getStaticProps = async () => {
  // NOTE: you probably only want to use the `queryFetch` inside of
  // `getStaticProps` (vs client-side requests)
  const response = await queryFetch('https://some-service.com', {
    headers: {
      accept: 'application/json',
    },
  });

  const data = await response.json();

  return { props: { data } };
};

function MyPage({ data }) {
  return (
    <div>
      <h1>My Page</h1>
      <pre>{JSON.string(data, null, 2)}</pre>
    </div>
  );
}

export default MyPage;
```

### Debugging and logging

`next-plugin-query-cache` ships with a logger and a report creator to help you debug the query cache.

> 👋 **NOTE**: The Next.js build does not provide an end build event, so we result to logging as the cache hits happen. When the build is finished, we run script that reads the logged output and aggregates the numbers. If you have ideas on how to improve this features, feel free to [open an issue](https://github.com/ricokahler/next-plugin-query-cache/issues)!

In order to run the logger and reporter, run the following command:

```
NEXT_PUBLIC_QUERY_CACHE_DEBUG=true npm run build | npx npqc-create-report
```

This will set the environment variable `NEXT_PUBLIC_QUERY_CACHE_DEBUG`, run the build, and then pipe the result into the reporter.

If all goes well, you'll this message:

```
=== Next Plugin Query Cache ===
   1952 total cache hits.
   1816 hits in memory.
    136 hits in the proxy.
      3 build processes found.
===============================

Wrote out extended report out to ../next-plugin-query-cache-2021-03-07T21:55:23.098Z.csv
```

## FAQ

### How does the proxy work?

The proxy isn't a formal proxy (e.g. SOCKS5) but instead an HTTP service that serializes the arguments and results from [`window.fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) [`Request`s](https://developer.mozilla.org/en-US/docs/Web/API/Request) and [`Response`s](https://developer.mozilla.org/en-US/docs/Web/API/Response).

This approach works well with the provided `fetch`-based API and doesn't require stateful connections that other proxy protocols require. The downside to this is that the current API is only limited to serializing requests and responses with simple text as the payload bodies.

### Does this work in [ISR](https://nextjs.org/docs/basic-features/data-fetching#incremental-static-regeneration)/[SSR](https://nextjs.org/docs/basic-features/data-fetching#getserversideprops-server-side-rendering)?

After the build, only the in-memory cache will work (which still does request de-duping!). The proxy is only available during the build (and is only needed during the build due to concurrent build processes).

Whether or not the `queryFetch` function calls the proxy is dependent on how you configure the `getProxyEnabled` function in the `createQueryFetch` call. The default implementation looks for either the `process.env.CI` environment variable or `process.env.NEXT_PLUGIN_QUERY_CACHE_ACTIVE` variable. If either of those are `'true'`, it'll request through the proxy.

`process.env.CI` is a nice one to use since it's set by Vercel during the build but isn't set during SSR/ISR etc.
