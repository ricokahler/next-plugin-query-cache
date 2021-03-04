// this file is written in javascript because typescript wouldn't extend the
// class properly
import { Response as NodeFetchResponse } from 'node-fetch';

const BaseResponse = typeof window === 'object' ? Response : NodeFetchResponse;

/**
 * Exists to hydrate a `SerializedResponse` object. Extends `Response`.
 */
class QueryFetchResponse extends BaseResponse {
  // note: `response.type`, `response.trailer` (part of the Response interface)
  // aren't supported
  constructor(_serializedResponse) {
    super(_serializedResponse.text, {
      headers: _serializedResponse.headers,
      status: _serializedResponse.status,
      statusText: _serializedResponse.statusText,
    });
    this._serializedResponse = _serializedResponse;
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

export default QueryFetchResponse;
