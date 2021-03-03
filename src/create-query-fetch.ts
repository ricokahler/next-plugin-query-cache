// import { Response as NodeFetchResponse } from 'node-fetch';
import nodeFetch from 'node-fetch';
import createPubSub from './create-pub-sub';
import type { FetchLike, RequestState } from './types';
import {
  SerializedResponse,
  QueryFetchResponse,
  serializeRequest,
  serializeResponse,
} from './serialize';

export interface CreateQueryFetchOptions {
  /**
   * Use this to determine whether or not the query proxy should be enabled.
   * The default implementation checks if `process.env.CI` or
   * `process.env.NEXT_PLUGIN_QUERY_CACHE_ACTIVE` is true and also tries to ping
   * the proxy once.
   *
   * The default implement is passed as an argument.
   */
  getProxyEnabled?: (
    defaultGetProxyEnabled: () => Promise<boolean>,
  ) => boolean | Promise<boolean>;

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
    options?: RequestInit,
  ) => boolean | Promise<boolean>;

  calculateCacheKey?: (
    url: string,
    options?: RequestInit,
  ) => string | Promise<string>;

  fetch?: FetchLike;

  port: number | string | undefined;
}

const defaultShouldCache = (url: string, options?: any) => {
  const method = options?.method?.toUpperCase() || 'GET';
  return method === 'GET' && typeof url === 'string';
};

type ProxyConnectionState =
  | 'initial_state'
  | 'trying_to_connect'
  | 'connection_successful'
  | 'failed_to_connect';
const proxyState = createPubSub<ProxyConnectionState>('initial_state');

const cacheKeyEvents = createPubSub('');

// have to grab from global, can't use window in next.js
let globalFetch = typeof fetch !== 'undefined' ? fetch : nodeFetch;

function createQueryFetch({
  fetch = globalFetch,
  shouldCache = defaultShouldCache,
  getProxyEnabled,
  getInMemoryCacheEnabled = () => true,
  calculateCacheKey = (url) => url,
  port,
}: CreateQueryFetchOptions) {
  const cacheMap = new Map<string, RequestState>();

  const defaultGetProxyEnabled = async () => {
    // if in the browser, the the proxy is definitely not enabled
    if (typeof window === 'object') {
      return false;
    }

    // in most next.js supported platforms, `CI` will be `true` during the build
    // but false when running in production (e.g. during SSR, ISR, etc)
    if (
      process.env.CI !== 'true' ||
      process.env.NEXT_PLUGIN_QUERY_CACHE_ACTIVE
    ) {
      return false;
    }

    switch (proxyState.getCurrent()) {
      case 'connection_successful': {
        return true;
      }
      case 'failed_to_connect': {
        return false;
      }
      case 'initial_state': {
        proxyState.notify('trying_to_connect');

        try {
          // then try to make the connection
          const response = await fetch(`http://localhost:${port}`);
          const { result } = await response.json();
          if (result !== 'pong') {
            throw new Error();
          }

          proxyState.notify('connection_successful');
          return true;
        } catch {
          proxyState.notify('failed_to_connect');
          return false;
        }
      }
      case 'trying_to_connect': {
        // wait for the result of a previous invocation (e.g. the
        // `initial_state` case)
        const result = await new Promise<boolean>((resolve) => {
          const unsubscribe = proxyState.subscribe((proxyState) => {
            if (proxyState === 'connection_successful') {
              unsubscribe();
              resolve(true);
            }

            if (proxyState === 'failed_to_connect') {
              unsubscribe();
              resolve(false);
            }
          });
        });

        return result;
      }
    }
  };

  async function normalizedFetch(url: string, options?: RequestInit) {
    const normalizedGetProxyEnabled = getProxyEnabled
      ? getProxyEnabled
      : defaultGetProxyEnabled;

    const proxyEnabled = await normalizedGetProxyEnabled(
      defaultGetProxyEnabled,
    );

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
        '[next-plugin-query-cache] Non-OK response from local proxy. Please file an issue.',
      );
    }

    const serializedResponse: SerializedResponse = await response.json();

    return new QueryFetchResponse(serializedResponse);
  }

  async function queryFetch(url: string, options?: RequestInit) {
    if (!(await shouldCache(url, options))) {
      return await fetch(url, options);
    }

    const inMemoryCacheEnabled = await getInMemoryCacheEnabled();

    if (!inMemoryCacheEnabled) {
      return await normalizedFetch(url, options);
    }

    const cacheKey = await calculateCacheKey(url, options);
    const requestState = cacheMap.get(cacheKey) || { state: 'initial' };

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

        const { serializedResponse } = cacheMap.get(
          cacheKey,
        ) as RequestState & { state: 'resolved' };

        return new QueryFetchResponse(serializedResponse);
      }
      case 'initial': {
        cacheMap.set(cacheKey, { state: 'inflight' });
        const response = await normalizedFetch(url, options);
        const serializedResponse = await serializeResponse(response);
        cacheMap.set(cacheKey, {
          state: 'resolved',
          serializedResponse,
        });
        cacheKeyEvents.notify(cacheKey);

        return new QueryFetchResponse(serializedResponse);
      }
    }
  }

  return {
    queryFetch,
    cache: {
      values: cacheMap,
      clear: () => cacheMap.clear(),
    },
  };
}

export default createQueryFetch;
