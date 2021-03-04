import fetch, { Headers } from 'node-fetch';
import { serializeResponse, serializeRequest } from './serialize';

describe('serializeResponse', () => {
  it('takes a response and returns something JSON serializeable', async () => {
    const response = await fetch('https://example.com');

    const result = await serializeResponse(response);

    expect(Object.keys(result).sort()).toMatchInlineSnapshot(`
      Array [
        "headers",
        "ok",
        "redirected",
        "status",
        "statusText",
        "text",
        "url",
      ]
    `);

    // check for JSON serializability
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe('serializeRequest', () => {
  it('takes in a URL and fetch options and returns some JSON serializeable', () => {
    const serializedRequest = serializeRequest('http://example.com', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      headers: {
        'content-type': 'application/json',
      },
    });

    expect(serializedRequest).toMatchInlineSnapshot(`
      Object {
        "body": "{\\"hello\\":\\"world\\"}",
        "headers": Array [
          Array [
            "content-type",
            "application/json",
          ],
        ],
        "method": "POST",
        "url": "http://example.com",
      }
    `);

    // check for JSON serializability
    expect(JSON.parse(JSON.stringify(serializedRequest))).toEqual(
      serializedRequest
    );
  });

  it('works with headers as an array', () => {
    const serializedRequest = serializeRequest('http://example.com', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      headers: [['content-type', 'application/json']],
    });

    expect(serializedRequest).toMatchInlineSnapshot(`
      Object {
        "body": "{\\"hello\\":\\"world\\"}",
        "headers": Array [
          Array [
            "content-type",
            "application/json",
          ],
        ],
        "method": "POST",
        "url": "http://example.com",
      }
    `);
  });

  it('works with headers as a Headers instance', () => {
    const headers = new Headers();
    headers.append('content-Type', 'application/json');

    const serializedRequest = serializeRequest('http://example.com', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      // @ts-ignore
      headers,
    });

    expect(serializedRequest).toMatchInlineSnapshot(`
      Object {
        "body": "{\\"hello\\":\\"world\\"}",
        "headers": Array [
          Array [
            "content-type",
            "application/json",
          ],
        ],
        "method": "POST",
        "url": "http://example.com",
      }
    `);
  });

  it('works with other iterables', () => {
    const headers = new Map<string, string>();
    headers.set('cOnTent-Type', 'application/json');

    const serializedRequest = serializeRequest('http://example.com', {
      method: 'POST',
      body: JSON.stringify({ hello: 'world' }),
      // @ts-ignore
      headers,
    });

    expect(serializedRequest).toMatchInlineSnapshot(`
      Object {
        "body": "{\\"hello\\":\\"world\\"}",
        "headers": Array [
          Array [
            "content-type",
            "application/json",
          ],
        ],
        "method": "POST",
        "url": "http://example.com",
      }
    `);
  });

  it('works with undefined', () => {
    const headers = new Map<string, string>();
    headers.set('cOnTent-Type', 'application/json');

    const serializedRequest = serializeRequest('http://example.com', {
      keepalive: true,
      redirect: 'error',
    });

    expect(serializedRequest).toMatchInlineSnapshot(`
      Object {
        "keepalive": true,
        "method": "GET",
        "redirect": "error",
        "url": "http://example.com",
      }
    `);
  });
});
