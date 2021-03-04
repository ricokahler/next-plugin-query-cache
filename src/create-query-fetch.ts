import nodeFetch from 'node-fetch';
import createPubSub from './create-pub-sub';
import type { FetchLike, RequestState } from './types';
import {
  SerializedResponse,
  serializeRequest,
  serializeResponse,
} from './serialize';
import QueryFetchResponse from './query-fetch-response';

export interface CreateQueryFetchOptions {
  /**
   * Use this to determine whether or not the query proxy should be enabled.
   *
   * The default implementation checks if `process.env.CI` or
   * `process.env.NEXT_PLUGIN_QUERY_CACHE_ACTIVE` is true and also tries to ping
   * the proxy once.
   */
  getProxyEnabled?: () => boolean | Promise<boolean>;

  /**
   * Provide a function that determines whether or not the in-memory cache
   * should be active. The in-memory cache also tries to de-dupe concurrent
   * incoming requests so only one is made.
   */
  getInMemoryCacheEnabled?: () => boolean | Promise<boolean>;

  /**
   * Provide a function that determines whether or not the current request
   * should be cached. The default implementation returns true if the method is
   * GET and the url is a string.
   */
  shouldCache?: (
    url: string,
    options?: RequestInit
  ) => boolean | Promise<boolean>;

  /**
   * Provide a `calculateCacheKey` to determine what key the response will be
   * saved under. This defaults to the input URL.
   *
   * Note: this should match the `calculateCacheKey` provided to the
   * `createNextPluginQueryCache`
   */
  calculateCacheKey?: (
    url: string,
    options?: RequestInit
  ) => string | Promise<string>;

  fetch?: FetchLike;

  port: number | string | undefined;
}

const defaultShouldCache = (url: string, options?: any) => {
  const method = options?.method?.toUpperCase() || 'GET';
  return method === 'GET' && typeof url === 'string';
};

const cacheKeyEvents = createPubSub<string>();

let globalFetch = typeof window === 'object' ? fetch : nodeFetch;

function createQueryFetch({
  fetch = globalFetch,
  shouldCache = defaultShouldCache,
  getProxyEnabled = () =>
    process.env.CI === 'true' ||
    process.env.NEXT_PLUGIN_QUERY_CACHE_ACTIVE === 'true',
  getInMemoryCacheEnabled = () => true,
  calculateCacheKey = (url) => url,
  port,
}: CreateQueryFetchOptions) {
  const cache = new Map<string, RequestState>();

  async function normalizedFetch(url: string, options?: RequestInit) {
    const proxyEnabled = await getProxyEnabled();

    if (!proxyEnabled) {
      return await fetch(url, options);
    }

    // for now, only string bodies are supported
    // also see: `serializeRequest`
    if (options?.body && typeof options.body !== 'string') {
      return await fetch(url, options);
    }

    const response = await fetch(`http://localhost:${port}`, {
      method: 'POST',
      body: JSON.stringify(serializeRequest(url, options)),
      // the signal and cancellation has to happen at this level, pre-proxy
      ...(options?.signal && { signal: options.signal }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        '[next-plugin-query-cache] Non-OK response from local proxy. Please file an issue.'
      );
    }

    const serializedResponse: SerializedResponse = await response.json();

    return new QueryFetchResponse(serializedResponse);
  }

  async function queryFetch(
    url: string,
    options?: RequestInit
  ): Promise<QueryFetchResponse> {
    if (!(await shouldCache(url, options))) {
      return await fetch(url, options);
    }

    const inMemoryCacheEnabled = await getInMemoryCacheEnabled();

    if (!inMemoryCacheEnabled) {
      return await normalizedFetch(url, options);
    }

    const cacheKey = await calculateCacheKey(url, options);
    const requestState = cache.get(cacheKey) || { state: 'initial' };

    switch (requestState.state) {
      case 'resolved': {
        return new QueryFetchResponse(requestState.serializedResponse);
      }
      case 'inflight': {
        await new Promise<void>((resolve) => {
          cacheKeyEvents.subscribe((incomingCacheKey) => {
            if (incomingCacheKey === cacheKey) {
              resolve();
            }
          });
        });

        const { serializedResponse } = cache.get(cacheKey) as RequestState & {
          state: 'resolved';
        };

        return new QueryFetchResponse(serializedResponse);
      }
      case 'initial': {
        cache.set(cacheKey, { state: 'inflight' });
        const response = await normalizedFetch(url, options);
        const serializedResponse = await serializeResponse(response);
        cache.set(cacheKey, {
          state: 'resolved',
          serializedResponse,
        });
        cacheKeyEvents.notify(cacheKey);

        return new QueryFetchResponse(serializedResponse);
      }
    }
  }

  return { queryFetch, cache };
}

export default createQueryFetch;
