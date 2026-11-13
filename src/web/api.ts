import { hc, type InferResponseType } from 'hono/client';
import type { AppType } from '../server/app';

export const api = hc<AppType>('/').api;

export type Status = InferResponseType<typeof api.status.$get>;
export type Digest = InferResponseType<(typeof api.digests)[':date']['$get'], 200>;
export type StoryT = Digest['highlights'][number]['stories'][number];

// Routes validate bodies with Zod inside the handler, so hc doesn't type `json`; send it through `init`.
export const jsonBody = (body: unknown) => ({ init: { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } });
export type Streak = InferResponseType<typeof api.streak.$get>;
export type ReadBody = { kind: 'finished' } | { kind: 'quiz'; correct: number; total: number };
export const postRead = async (b: ReadBody): Promise<Streak> => (await api.reads.$post({}, jsonBody(b))).json() as Promise<Streak>;
