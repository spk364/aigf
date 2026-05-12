// Empty module that replaces `server-only` under vitest. See vitest.config.ts
// for the alias. The real package throws on import — Next handles it at
// compile time, but vitest runs raw Node and trips the throw the moment a
// tested module pulls in a server-only-tagged helper.
export {}
