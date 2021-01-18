export interface CreateQueryFetchOptions {
  getEnabled?: () => boolean | Promise<boolean>;
  canBeCached?: (url: string, options?: any) => boolean | Promise<boolean>;
  fetch?: (url: string, options?: any) => Promise<any>;
  port: number | string | undefined;
}

const defaultCanBeCached = (url: string, options?: any) => {
  const method = options?.method?.toUpperCase() || 'GET';
  return method === 'GET' && typeof url === 'string';
};

const defaultGetEnabled = () => !!process.env.CI;

const isIterable = (obj: unknown): obj is Iterable<any> => {
  if (typeof obj !== 'object' || !obj) return false;
  return typeof (obj as any)[Symbol.iterator] === 'function';
};

function createQueryFetch({
  fetch = window.fetch,
  canBeCached = defaultCanBeCached,
  getEnabled = defaultGetEnabled,
  port,
}: CreateQueryFetchOptions) {
  async function queryFetch(url: string, options?: RequestInit) {
    // if in browser, disabled, or can't be cached
    if (
      typeof window === 'object' ||
      !port ||
      !(await getEnabled()) ||
      !(await canBeCached(url, options))
    ) {
      // just forward to provided fetch function
      return fetch(url, options);
    }

    // otherwise send it to the query cache proxy
    const searchParams = new URLSearchParams();
    const headers = options?.headers;

    const normalizedHeaders = Array.isArray(headers)
      ? (headers as [string, string][])
      : isIterable(headers)
      ? Array.from(headers)
      : Object.entries(headers || {});

    searchParams.append('url', Buffer.from(url).toString('base64'));
    searchParams.append(
      'headers',
      Buffer.from(JSON.stringify(normalizedHeaders)).toString('base64'),
    );

    return await fetch(`http://localhost:${port}?${searchParams}`);
  }

  return queryFetch;
}

export default createQueryFetch;
