// ===========================================================================
//  api.mjs — runs the Express app as a Netlify Function.
//
//  netlify.toml redirects  /api/*  to  /.netlify/functions/api/:splat,  so the
//  browser keeps calling <origin>/api/... exactly as it does against the Vite
//  dev proxy in development. `basePath` strips the function prefix back off
//  before Express sees the URL, so the routes in backend/src/app.ts need no
//  changes at all.
//
//  This imports the COMPILED backend (dist), which the Netlify build
//  command produces with tsc. Importing backend/src directly would leave
//  esbuild to resolve NodeNext-style ".js" specifiers that point at ".ts"
//  files, which it does not do.
// ===========================================================================
import serverless from "serverless-http";
import { app } from "../dist/src/app.js";

export const handler = serverless(app, {
  basePath: "/.netlify/functions/api",
});
