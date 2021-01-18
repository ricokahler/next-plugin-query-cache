# next-plugin-query-cache

> A build-time query cache for Next.js. Works by creating an HTTP server during the build that caches responses.

## Status: ⚠️ Experimental

I made this thing like yesterday. Watch for releases for stability.

## Installation

```
npm i next-plugin-query-cache
```

or

```
yarn add next-plugin-query-cache
```

### 1. Add the decorator to your `next.config.js`

```js
// next.config.js

const { createQueryCachePlugin } = require('next-plugin-query-cache');

const withQueryCache = createQueryCachePlugin({
  // // optionally provide a fetch implementation
  // fetch: require('node-fetch'),
  //
  // // optionally provide a flag to disable the plugin
  // disabled: process.env.DISABLE_QUERY_CACHE,
  //
  // // optionally provide a binding port for the proxy
  // // by default it will bind to a random ephemeral port assigned by the OS
  // port: 4000,
});

module.exports = withQueryCache({
  // optionally, you can include a next.js config
});
```

### 2. Create and use the `queryFetch` function

In order to use the query cache, you must make queries via the `queryFetch` function.

```js
// query-cache.js
import { createQueryFetch } from 'next-plugin-query-cache';

export default createQueryFetch({
  // // optionally provide a fetch implementation
  // fetch: window.fetch,
  //
  // // optionally provide a function to tell whether or not the query cache
  // // is enabled. if it returns false, the query cache will not run
  // getEnabled: () => true,
  //
  // // optionally provide a function to determine whether or not the request
  // // should be cached
  // canBeCached: (url, options) => (options?.method || 'GET') === 'GET',
});
```

```js
// some-page.js
import queryFetch from '../query-cache';

export const getStaticProps = async (context) => {
  // use the query fetch for cached responses during a build
  const response = await queryFetch('..');

  // ...

  return {
    props: {
      /* ... */
    },
  };
};
```
