import { RequestHandler } from 'express';
import { Response as NodeFetchResponse } from 'node-fetch';

// there are some differences between `node-fetch` and lib.dom so this interface
// is the common ground between them used in this function
type HeadersLike = Iterable<[string, string]> & {
  get(name: string): string | null;
};

// same applies as above
type FetchLike = (
  url: string,
  options?: any,
) => Promise<Pick<Response, 'status' | 'text'> & { headers: HeadersLike }>;

type ResponseResult = {
  headers: HeadersLike;
  body: Buffer | string;
  status: number;
};

type Listener = (body: ResponseResult) => void;

const inflights = new Map<string, Set<Listener>>();
const cache = new Map<string, ResponseResult>();

function createRequestListener(fetch: FetchLike): RequestHandler {
  return async (req, res) => {
    try {
      const { url: urlBase64, headers: headersBase64 } = req.query;

      if (typeof urlBase64 !== 'string') {
        throw new Error('Request was missing `url` query param');
      }
      if (typeof headersBase64 !== 'string') {
        throw new Error('Request was missing `headers` query param');
      }

      const url = Buffer.from(urlBase64, 'base64').toString();
      const incomingHeaders = JSON.parse(
        Buffer.from(headersBase64, 'base64').toString(),
      ) as [string, string][];

      const responseResult = await getResponseResult(
        url,
        incomingHeaders,
        fetch,
      );

      const contentType = responseResult.headers.get('content-type');
      if (contentType) {
        res.set('content-type', contentType);
      }

      // TODO: figure out which headers to relay
      const headerList = Array.from(responseResult.headers);
      for (const [k, v] of headerList.filter(([k]) => k.startsWith('x'))) {
        res.set(k, v);
      }

      res.status(responseResult.status);
      res.send(responseResult.body);
    } catch (e) {
      res.status(500);
      console.error(e);
      res.send(e.toSting());
    }
  };
}

async function getResponseResult(
  url: string,
  incomingHeaders: [string, string][],
  fetch: FetchLike,
) {
  // if already cached, just return the result
  const cachedResult = cache.get(url);
  if (cachedResult) return cachedResult;

  // if there is already an inflight request,
  // the `inflights` set will have it…
  const thisListeners = inflights.get(url);
  if (thisListeners) {
    const result = await new Promise<ResponseResult>(async (resolve) => {
      const handler = (r: ResponseResult) => {
        thisListeners.delete(handler);
        resolve(r);
      };

      // …in that case, add ourselves as a listener so that when the first
      // request finishes, we'll be notified and can resolve with the same
      // result
      thisListeners.add(handler);
    });

    return result;
  }

  // if we've gotten this far then this request was not cached and was not
  // inflight so we'll initialize for other concurrent requests
  const listeners = new Set<Listener>();
  inflights.set(url, listeners); // this now makes the request inflight

  const response = await fetch(url, { headers: incomingHeaders });

  const result: ResponseResult = {
    body:
      'buffer' in response
        ? await (response as NodeFetchResponse).buffer()
        : await response.text(),
    headers: response.headers,
    status: response.status,
  };

  // cache the result
  cache.set(url, result);

  // while we were waiting for the fetch to finish, other listeners may have
  // been attached. iterate through and notify them with the result
  for (const listener of listeners) {
    listener(result);
  }

  return result;
}

export default createRequestListener;
