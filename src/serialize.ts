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

/**
 * Represents what is serialized and sent across the (local) wire from the proxy.
 */
export interface SerializedResponse {
  headers: Array<[string, string]>;
  ok: boolean;
  redirected: boolean;
  status: number;
  statusText: string;
  text: string;
  url: string;
}

const isIterable = (obj: unknown): obj is Iterable<any> => {
  if (typeof obj !== 'object' || !obj) return false;
  return typeof (obj as any)[Symbol.iterator] === 'function';
};

export function serializeRequest(url: string, options?: RequestInit) {
  const headers = options?.headers;

  const normalizedHeaders = (!headers
    ? []
    : Array.isArray(headers)
    ? (headers as [string, string][])
    : isIterable(headers)
    ? Array.from(headers)
    : Object.entries(headers)
  ).map(([k, v]) => [k.toLowerCase().trim(), v] as [string, string]);

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

export async function serializeResponse(
  // this type is compatible with the node-fetch response types
  response: Pick<
    Response,
    'text' | 'ok' | 'redirected' | 'status' | 'statusText' | 'url'
  > & { headers: any }
) {
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
