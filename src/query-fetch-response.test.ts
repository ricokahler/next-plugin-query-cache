import fetch, { Response } from 'node-fetch';
import { serializeResponse } from './serialize';
import QueryFetchResponse from './query-fetch-response';

describe('QueryFetchResponse', () => {
  it('extends the base response and takes in a serializedResponse', async () => {
    const response = await fetch('https://example.com');
    const result = await serializeResponse(response);
    const queryFetchResponse = new QueryFetchResponse(result);

    expect(queryFetchResponse instanceof Response).toBe(true);
    expect(queryFetchResponse.ok).toBe(true);
    expect(queryFetchResponse.redirected).toBe(false);
    expect(queryFetchResponse.url).toBe('https://example.com/');

    const cloned = queryFetchResponse.clone();
    expect(cloned).not.toBe(queryFetchResponse);
    expect(cloned).toEqual(queryFetchResponse);
  });
});
