import type { Request, Response } from 'express';
import createRequestHandler from './create-request-handler';
import QueryFetchResponse from './query-fetch-response';
import { SerializedResponse } from './serialize';
import createPubSub from './create-pub-sub';

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

describe('createRequestHandler', () => {
  it('returns a serialized version of the fetch response', async () => {
    const mockFetch = jest.fn(() => mockResponse.clone());
    const handler = createRequestHandler({ fetch: mockFetch });

    const jsonHandler = jest.fn();

    await handler(
      {
        body: exampleSerializedResponse,
      } as Request,
      {
        json: jsonHandler as any,
      } as Response,
      jest.fn()
    );

    expect(jsonHandler).toHaveBeenCalled();
    expect(jsonHandler.mock.calls[0][0]).toEqual(exampleSerializedResponse);
  });

  it('de-dupes request in the cache', async () => {
    const events = createPubSub();
    const fetchFn = jest.fn(() => {
      return new Promise((resolve) => {
        const unsubscribe = events.subscribe(() => {
          unsubscribe();
          resolve(mockResponse.clone());
        });
      });
    });

    const handler = createRequestHandler({ fetch: fetchFn });

    const jsonHandler = jest.fn();

    const first = handler(
      {
        body: exampleSerializedResponse,
      } as Request,
      {
        json: jsonHandler as any,
      } as Response,
      jest.fn()
    );

    const second = handler(
      {
        body: exampleSerializedResponse,
      } as Request,
      {
        json: jsonHandler as any,
      } as Response,
      jest.fn()
    );

    // flush event loop
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(jsonHandler).not.toHaveBeenCalled();

    // let through
    events.notify();

    await first;
    await second;

    // call it a few times more after it's full resolved
    handler(
      {
        body: exampleSerializedResponse,
      } as Request,
      {
        json: jsonHandler as any,
      } as Response,
      jest.fn()
    );
    handler(
      {
        body: exampleSerializedResponse,
      } as Request,
      {
        json: jsonHandler as any,
      } as Response,
      jest.fn()
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);

    const firstResult = jsonHandler.mock.calls[0][0];

    // ensure they're all the same cached result
    for (const [result] of jsonHandler.mock.calls) {
      expect(result).toEqual(firstResult);
    }
  });
});
