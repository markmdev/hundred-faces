// The Vercel function behind /api/react: the one piece of server code in
// production. Vercel serves the built page from dist/ beside it.

import { jevClient } from "../server/jev.ts";
import { react } from "../server/react.ts";

const client = jevClient();

export default {
  fetch: (request: Request) => react(request, { client }),
};
