# ADR-0015: Vercel serverless entry point as a thin re-export

Status: Accepted.

Decision: `vercel.json` routes all paths to `api/index.ts`, a one-line re-export of `packages/service-runtime/dist/serverless.js` (the built output, not the TypeScript source) with a documented reason: pnpm workspace symlinks in the TypeScript source are not resolvable in Vercel's packaged function output. `api/index.ts`'s file-level comment states this explicitly. `vercel.json` also declares `region: iad1` and `maxDuration: 60`.

Consequences: The standalone (non-serverless) listener in `packages/service-runtime/src/index.ts` remains available and is what the Constitution/gap-analysis discussion in issue #6 refers to as the "self-hosted" path — it composes the same `OriginApplication`/`transport-http` layer with different `RequestAuthenticator`/`CanonicalRepository` choices (ADR-0013, ADR-0014) rather than duplicating request-handling logic. A change to `packages/service-runtime/src/serverless.ts` requires a rebuild (`pnpm build`) before it is visible to a Vercel deployment, since `api/index.ts` imports the built artifact, not the source.

Reversal: Point `api/index.ts` at a different framework's adapter around the same `createOriginHttpHandler`; the HTTP-handling core in `transport-http` does not depend on Vercel.
