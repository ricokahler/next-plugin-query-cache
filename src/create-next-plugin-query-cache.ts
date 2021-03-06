import express from 'express';
import nodeFetch from 'node-fetch';
import createRequestHandler from './create-request-handler';
import { traceGlobals } from 'next/dist/telemetry/trace/shared';
import type { Telemetry } from 'next/dist/telemetry/storage';
import createPubSub from './create-pub-sub';

export interface QueryCachePluginOptions {
  /**
   * If you have a preferred port for the proxy server, you can set it here.
   * otherwise, it'll pick an ephemeral port
   */
  port?: number;
  /**
   * Provide a flag that will disable the proxy. This could an expression that
   * checks an environment variable or similar.
   */
  disableProxy?: boolean;
  /**
   * Provide a fetch implementation that the proxy will use
   */
  fetch?: (url: string, options?: any) => any;
  /**
   * Provide a function that returns a string. The response result will be saved
   * under that key in the cache.
   */
  calculateCacheKey?: (
    url: string,
    options?: RequestInit
  ) => string | Promise<string>;
}

interface WebpackConfig {
  plugins?: any[];
}

interface NextConfigValue {
  webpack?: (config: WebpackConfig, ...rest: any[]) => WebpackConfig;
  rewrites?: (...args: any[]) => any | Promise<any>;
  [key: string]: any;
}

type NextConfig = NextConfigValue | ((...args: any[]) => NextConfigValue);

function createNextPluginQueryCache(pluginOptions?: QueryCachePluginOptions) {
  const initialPort = pluginOptions?.port || 0;
  const portRef = { current: initialPort };
  const requestHandler = createRequestHandler({
    fetch: pluginOptions?.fetch || nodeFetch,
    calculateCacheKey: pluginOptions?.calculateCacheKey,
  });
  const buildFinished = createPubSub();

  setTimeout(async () => {
    // unfortunately, we do have to poll for when this object comes into
    // the `traceGlobals` map.
    while (!traceGlobals.has('telemetry')) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const telemetry: Telemetry = traceGlobals.get('telemetry');

    if (telemetry && 'flush' in telemetry) {
      const originalFlush = telemetry.flush.bind(telemetry);

      // hi-jack flush to emit an event when that occurs
      Object.assign(telemetry, {
        flush: (...args: any[]) => {
          buildFinished.notify();
          // @ts-ignore
          return originalFlush(...args);
        },
      });
    }
  }, 0);

  async function startServer() {
    if (pluginOptions?.disableProxy) {
      return null;
    }

    const app = express();

    app.use(express.json(), requestHandler);

    return await new Promise<number>((resolve, reject) => {
      const server = app.listen(initialPort, () => {
        try {
          const address = server.address();

          if (typeof address !== 'object' || !address) {
            throw new Error('Could not get port');
          }

          console.log(`[next-plugin-query-cache] Up on port ${address.port}.`);
          resolve(address.port);
        } catch (e) {
          reject(e);
        }
      });

      // TODO: this event could be used in future version to create better
      // reporting mechanisms
      buildFinished.subscribe(() => {
        server.close();
      });
    });
  }

  function withNextPluginQueryCache(_nextConfig?: NextConfig) {
    if (pluginOptions?.disableProxy) {
      return _nextConfig;
    }

    const normalizedNextConfig =
      typeof _nextConfig === 'function' ? _nextConfig : () => _nextConfig || {};

    return (...args: any[]) => {
      const nextConfig = normalizedNextConfig(...args);

      return {
        ...nextConfig,
        // we hi-jack `rewrites` here because it lets us return a
        // promise (where the `webpack` prop does not).
        //
        // this function resolves prior to the `webpack` function running
        rewrites: async (...args: any[]) => {
          // TODO: this runs too often
          const port = await startServer();

          if (port) {
            portRef.current = port;
          }

          // pipe the result through the original rewrites fn (if any)
          return nextConfig?.rewrites?.(...args) || [];
        },
        webpack: (config: WebpackConfig, ...rest: any[]) => {
          const webpackConfig = nextConfig.webpack?.(config, ...rest) || config;

          // ensure plugins is an array
          const plugins = (webpackConfig.plugins = webpackConfig.plugins || []);

          const definePlugin = plugins.find(
            (plugin) => plugin.constructor.name === 'DefinePlugin'
          );

          if (!definePlugin) {
            throw new Error(
              '[next-plugin-query-cache] Could not find DefinePlugin. Please file an issue.'
            );
          }

          const port = portRef.current;

          if (!port) {
            throw new Error(
              '[next-plugin-query-cache] Could not get port Please file an issue'
            );
          }

          definePlugin.definitions = {
            ...definePlugin.definitions,
            'process.env.NEXT_QUERY_CACHE_PORT': JSON.stringify(port),
          };

          return webpackConfig;
        },
      };
    };
  }

  return withNextPluginQueryCache;
}

export default createNextPluginQueryCache;
