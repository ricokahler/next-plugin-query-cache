import { RequestHandler } from 'express';
import { SerializedRequest, serializeResponse } from './serialize';
import type { FetchLike, RequestState } from './types';
import createPubSub from './create-pub-sub';

interface RequestListenerOptions {
  fetch: FetchLike;
  calculateCacheKey?: (
    url: string,
    options?: RequestInit,
  ) => string | Promise<string>;
}

const cacheMap = new Map<string, RequestState>();
const cacheKeyEvents = createPubSub('');

function createRequestListener({
  fetch,
  calculateCacheKey = (url) => url,
}: RequestListenerOptions): RequestHandler {
  return async (req, res) => {
    try {
      // to respond to the ping
      if (req.method === 'GET') {
        res.json({ result: 'pong' });
        return;
      }

      const serializedRequest: SerializedRequest = req.body;
      const cacheKey = await calculateCacheKey(serializedRequest.url);

      const requestState = cacheMap.get(cacheKey) || { state: 'initial' };

      switch (requestState.state) {
        case 'resolved': {
          res.json(requestState.serializedResponse);
          return;
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

          res.json(serializedResponse);
          return;
        }
        case 'initial': {
          cacheMap.set(cacheKey, { state: 'inflight' });

          const { url, ...rest } = serializedRequest;
          const response = await fetch(url, rest);

          const serializedResponse = await serializeResponse(response);

          cacheMap.set(cacheKey, {
            state: 'resolved',
            serializedResponse,
          });
          cacheKeyEvents.notify(cacheKey);

          res.json(serializedResponse);
          return;
        }
      }
    } catch (e) {
      res.status(500);
      console.error(e);
      res.send(e.toSting());
    }
  };
}

export default createRequestListener;
