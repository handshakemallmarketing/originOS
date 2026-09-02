// The workspace build produces a self-contained serverless bundle. Importing the
// TypeScript source here leaves pnpm workspace links in Vercel's function output,
// where their source targets are not packaged and fail at module load time.
export { default } from "../packages/service-runtime/dist/serverless.js";
