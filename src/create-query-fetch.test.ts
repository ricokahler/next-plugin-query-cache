// these tests are kind of interesting because the actual library code is pretty
// helpful for mocking but… it's kinda weird to have code test itself
import createQueryFetch from './create-query-fetch';
import QueryFetchResponse from './query-fetch-response';
import createPubSub from './create-pub-sub';
import { SerializedResponse } from './serialize';

const exampleSerializedResponse: SerializedResponse = {
  text:
    '<!doctype html>\n<html>\n<head>\n    <title>Example Domain</title>\n\n    <meta charset="utf-8" />\n    <meta http-equiv="Content-type" content="text/html; charset=utf-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1" />\n    <style type="text/css">\n    body {\n        background-color: #f0f0f2;\n        margin: 0;\n        padding: 0;\n        font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", "Open Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;\n        \n    }\n    div {\n        width: 600px;\n        margin: 5em auto;\n        padding: 2em;\n        background-color: #fdfdff;\n        border-radius: 0.5em;\n        box-shadow: 2px 3px 7px 2px rgba(0,0,0,0.02);\n    }\n    a:link, a:visited {\n        color: #38488f;\n        text-decoration: none;\n    }\n    @media (max-width: 700px) {\n        div {\n            margin: 0 auto;\n            width: auto;\n        }\n    }\n    </style>    \n</head>\n\n<body>\n<div>\n    <h1>Example Domain</h1>\n    <p>This domain is for use in illustrative examples in documents. You may use this\n    domain in literature without prior coordination or asking for permission.</p>\n    <p><a href="https://www.iana.org/domains/example">More information...</a></p>\n</div>\n</body>\n</html>\n',
  headers: [
    ['accept-ranges', 'bytes'],
    ['age', '454965'],
    ['cache-control', 'max-age=604800'],
    ['connection', 'close'],
    ['content-encoding', 'gzip'],
    ['content-length', '648'],
    ['content-type', 'text/html; charset=UTF-8'],
    ['date', 'Thu, 04 Mar 2021 01:36:35 GMT'],
    ['etag', '"3147526947+gzip"'],
    ['expires', 'Thu, 11 Mar 2021 01:36:35 GMT'],
    ['last-modified', 'Thu, 17 Oct 2019 07:18:26 GMT'],
    ['server', 'ECS (ord/4CD5)'],
    ['vary', 'Accept-Encoding'],
    ['x-cache', 'HIT'],
  ],
  ok: true,
  redirected: false,
  status: 200,
  statusText: 'OK',
  url: 'https://example.com/',
};

const mockResponse = new QueryFetchResponse(exampleSerializedResponse);
const mockSerializedResponse = new QueryFetchResponse({
  headers: [['content-type', 'application/json']],
  ok: true,
  redirected: false,
  status: 200,
  statusText: 'OK',
  url: 'http://localhost:3000',
  text: JSON.stringify(exampleSerializedResponse),
});

describe('createQueryFetch', () => {
  it('returns a query fetch with an in-memory cache and a proxy cache', async () => {
    const fetchFn = jest.fn(() => mockResponse.clone());

    const { queryFetch, cache } = createQueryFetch({
      fetch: fetchFn,
      port: '3000',
    });

    const response = await queryFetch('https://example.com');
    const text = await response.text();

    // call it a few more times to test the cache
    await queryFetch('https://example.com');
    await queryFetch('https://example.com');
    await queryFetch('https://example.com');

    expect(fetchFn).toHaveBeenCalledTimes(1);

    expect(typeof text === 'string').toBe(true);
    expect(response.ok).toBe(true);
    expect(cache.get('https://example.com')).toBeTruthy();
  });

  it('de-dupes request in the in-memory cache', async () => {
    const events = createPubSub();
    const fetchFn = jest.fn(() => {
      return new Promise((resolve) => {
        const unsubscribe = events.subscribe(() => {
          unsubscribe();
          resolve(mockResponse.clone());
        });
      });
    });

    const { queryFetch, cache } = createQueryFetch({
      fetch: fetchFn,
      port: '3000',
    });

    const first = queryFetch('https://example.com');
    const second = queryFetch('https://example.com');

    // flush event loop
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(cache.get('https://example.com').state).toBe('inflight');

    setTimeout(() => {
      events.notify();
    }, 0);

    await first;
    await second;

    expect(cache.get('https://example.com').state).toBe('resolved');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('makes a request to the proxy if `getProxyEnabled` is true', async () => {
    const fetchFn = jest.fn(() => mockSerializedResponse.clone());

    const { queryFetch } = createQueryFetch({
      fetch: fetchFn,
      getProxyEnabled: () => true,
      getInMemoryCacheEnabled: () => false,
      port: '3000',
    });

    const response = await queryFetch('https://example.com');

    expect(response).toEqual(mockResponse);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    // notice how this is a call to the proxy
    expect(fetchFn.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        "http://localhost:3000",
        Object {
          "body": "{\\"url\\":\\"https://example.com\\",\\"method\\":\\"GET\\"}",
          "headers": Object {
            "Content-Type": "application/json",
          },
          "method": "POST",
        },
      ]
    `);
  });

  it("early returns if the request body isn't a string", async () => {
    const fetchFn = jest.fn(() => mockResponse.clone());

    const { queryFetch } = createQueryFetch({
      fetch: fetchFn,
      // force enable the proxy
      shouldCache: () => true,
      getProxyEnabled: () => true,
      getInMemoryCacheEnabled: () => false,
      port: '3000',
    });

    // the query fetch should early return and just call the provided fetch
    const response = await queryFetch('https://example.com', {
      method: 'POST',
      body: {} as any,
    });

    expect(response).toEqual(mockResponse);
  });

  it('early returns if shouldCache returns false', async () => {
    const fetchFn = jest.fn(() => mockResponse.clone());

    const { queryFetch } = createQueryFetch({
      fetch: fetchFn,
      shouldCache: () => false,
      port: '3000',
    });

    // the query fetch should early return and just call the provided fetch
    const response = await queryFetch('https://example.com');

    expect(response).toEqual(mockResponse);
  });
});
