import { DefinePlugin } from 'webpack';
import express from 'express';
import nodeFetch from 'node-fetch';
import createRequestHandler from './create-request-handler';

export interface QueryCachePluginOptions {
  port?: number;
  disabled?: boolean;
  fetch?: (url: string, options?: any) => any;
}

interface WebpackConfig {
  plugins?: any[];
}

interface NextConfigValue {
  webpack?: (config: WebpackConfig) => WebpackConfig;
  rewrites?: (...args: any[]) => any | Promise<any>;
  [key: string]: any;
}

type NextConfig = NextConfigValue | ((...args: any[]) => NextConfigValue);

function createQueryCachePlugin(pluginOptions?: QueryCachePluginOptions) {
  const initialPort = pluginOptions?.port || 0;
  const portRef = { current: initialPort };
  const requestHandler = createRequestHandler(
    pluginOptions?.fetch || nodeFetch,
  );

  function startServer() {
    const app = express();

    app.use(requestHandler);

    return new Promise<number>((resolve, reject) => {
      const server = app.listen(initialPort, () => {
        try {
          const address = server.address();

          if (typeof address !== 'object' || !address) {
            throw new Error('Could not get port');
          }

          resolve(address.port);
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  function withNextQueryCache(_nextConfig?: NextConfig) {
    if (pluginOptions?.disabled) {
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
        // it also seems like the promise resolves prior to the
        // `webpack` function running anyway
        rewrites: async (...args: any[]) => {
          const port = await startServer();

          portRef.current = port;

          // pipe the result through the original rewrites fn (if any)
          return nextConfig?.rewrites?.(...args) || [];
        },
        webpack: (config: WebpackConfig) => {
          const webpackConfig = nextConfig.webpack?.(config) || {};

          // ensure plugins is an array
          const plugins = (webpackConfig.plugins = webpackConfig.plugins || []);

          const index = plugins.findIndex(
            (plugin) => plugin.constructor.name === 'DefinePlugin',
          );

          const definePlugin = plugins[index] || new DefinePlugin({});

          if (index === -1) {
            plugins.push(definePlugin);
          }

          const port = portRef.current;

          if (!port) {
            throw new Error('Could not get port in time');
          }

          definePlugin.definitions = {
            ...definePlugin.definitions,
            'process.env.____NEXT_QUERY_CACHE_PORT': JSON.stringify(port),
          };

          return webpackConfig;
        },
      };
    };
  }

  return withNextQueryCache;
}

export default createQueryCachePlugin;
