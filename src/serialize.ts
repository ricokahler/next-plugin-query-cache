import { Response as NodeFetchResponse } from 'node-fetch';

const BaseResponse = typeof window === 'object' ? Response : NodeFetchResponse;

export interface SerializedResponse {
  headers: Array<[string, string]>;
  ok: boolean;
  redirected: boolean;
  status: number;
  statusText: string;
  text: string;
  url: string;
}

/**
 * Represents what is serialized and sent across the (local) wire to the proxy.
 *
 * Note: the currently supported serializable request properties are heavily
 * dependent on what `node-fetch` supports. See here:
 *
 * https://github.com/node-fetch/node-fetch/tree/f2ff9ecd0462385e34d7d1d1495db6ec3611385f#class-request
 */
export interface SerializedRequest {
  url: string;
  method?: string;
  body?: string;
  headers?: Array<[string, string]>;
  keepalive?: boolean;
  redirect?: RequestRedirect;
}

export class QueryFetchResponse extends BaseResponse {
  // note: `response.type`, `response.trailer` (part of the Response interface)
  // aren't supported
  constructor(private _serializedResponse: SerializedResponse) {
    super(_serializedResponse.text, {
      headers: _serializedResponse.headers,
      status: _serializedResponse.status,
      statusText: _serializedResponse.statusText,
    });
  }

  get ok() {
    return this._serializedResponse.ok;
  }

  get redirected() {
    return this._serializedResponse.redirected;
  }

  get url() {
    return this._serializedResponse.url;
  }

  clone() {
    return new QueryFetchResponse(this._serializedResponse);
  }
}

const isIterable = (obj: unknown): obj is Iterable<any> => {
  if (typeof obj !== 'object' || !obj) return false;
  return typeof (obj as any)[Symbol.iterator] === 'function';
};

export function serializeRequest(url: string, options?: RequestInit) {
  const headers = options?.headers;

  const normalizedHeaders = Array.isArray(headers)
    ? (headers as [string, string][])
    : isIterable(headers)
    ? Array.from(headers)
    : Object.entries(headers || {});

  const serializedRequest: SerializedRequest = {
    url,
    method: options?.method || 'GET',
    // the code prior to this function should check if the body is a string
    ...(options?.body && { body: options.body as string }),
    ...(normalizedHeaders.length && { headers: normalizedHeaders }),
    ...(options?.keepalive && { keepalive: options.keepalive }),
    ...(options?.redirect && { redirect: options.redirect }),
  };

  return serializedRequest;
}

export async function serializeResponse(response: Response) {
  const serializedResponse: SerializedResponse = {
    text: await response.text(),
    headers: Array.from(response.headers),
    ok: response.ok,
    redirected: response.redirected,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
  };

  return serializedResponse;
}
