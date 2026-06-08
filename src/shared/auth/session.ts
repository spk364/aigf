// Single source of truth for how long a login lasts.
//
// Two things must agree or users get logged out early:
//   1. Payload's auth `tokenExpiration` — the `exp` claim baked into the JWT.
//      Payload's default is 7200s (2h); once the JWT's exp passes, every
//      request 401s regardless of how long the browser kept the cookie.
//   2. The `payload-token` cookie `maxAge` we set on login/signup — how long
//      the browser retains the cookie.
//
// They were mismatched (cookie 7d, JWT 2h), so sessions silently died after
// two hours. Keep both pinned to this constant.
export const SESSION_TOKEN_EXPIRATION_SECONDS = 60 * 60 * 24 * 30 // 30 days
