// The real Jev client, shared by the Vercel function and the local server; the
// SDK reads TYPESAFE_API_KEY itself. Its default policy retries 408, 429, and
// 5xx. 429 is left out so a busy key is reported at once instead of amplified
// by two more attempts per batch.

import { TypeSafeClient } from "@typesafe-ai/sdk";

const RETRIED_STATUSES = new Set([408]);
for (let status = 500; status < 600; status++) RETRIED_STATUSES.add(status);

export function jevClient(): TypeSafeClient {
  return new TypeSafeClient({ timeout: 20_000, retry: { httpStatuses: RETRIED_STATUSES } });
}
