// Lexical shims for upstream SDKs. Do not mutate globalThis in the host application.
export { Buffer } from 'buffer';
export { default as process } from 'process/browser';
