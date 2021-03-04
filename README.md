# next-plugin-query-cache · [![codecov](https://codecov.io/gh/ricokahler/next-plugin-query-cache/branch/main/graph/badge.svg?token=CKKTKQ5A5Z)](https://codecov.io/gh/ricokahler/next-plugin-query-cache) [![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

> A build-time query cache for Next.js. Works by creating an HTTP server during the build that caches responses.

## Motivation

Unlike Gatsby, Next.js does not provide any sort of shared data layer. This is nice because it's simple and unopinionated. However, in large static sites with many repeated queries, there's a missed opportunity to cache results and share them between pages.

`next-plugin-query-cache` aims to do just that. During the build, it creates an HTTP proxy server that all concurrent build processes can go through to request a resource.

- If the proxy already has the value, it'll return it instead of fetching it.
- If a requested resource already has a request inflight, the proxy will wait till that request is finished instead of requesting it again.
- There's also an optional in-memory cache made for de-duping request on a per-page level (useful for after the build in SSR or ISR).

> ### 👋 Curious what the API looks like? [Jump to Usage](#usage)

## Who is the library for?

This lib is for Next.js users who create static builds. The query cache saves responses as they are requests so shared queries across pages (e.g. for header data) are de-duplicated.

This is particularly useful if your Next.js site is powered by SaaS products that provide their API like headless CMSes and headless ecommerce platforms (and even more useful if those SaaS services charge per API request 😅).

> 👋 **NOTE**: This lib is currenlty _not_ so useful for non-HTTP type of requests (e.g. database calls) since the query cache only works on an HTTP level. See [#4](https://github.com/ricokahler/next-plugin-query-cache/issues/4) for more details.

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
  calculateCacheKey: (url) => url,
});

// the cache is an ES6 `Map` of cache keys to saved responses.
// you can optionally modify the in-memory cache using this.
cache.clear();

// export the wrapped fetch implementation
export default queryFetch;
```

## Usage

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
