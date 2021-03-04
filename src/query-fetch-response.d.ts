import { SerializedResponse } from './serialize';

declare class QueryFetchResponse extends Response {
  constructor(serializedResponse: SerializedResponse);
}

export default QueryFetchResponse;
