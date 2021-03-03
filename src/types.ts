import type { SerializedResponse } from './serialize';

export type FetchLike = (url: string, options?: any) => any;
export type RequestState =
  | { state: 'initial' }
  | { state: 'inflight' }
  | { state: 'resolved'; serializedResponse: SerializedResponse };
