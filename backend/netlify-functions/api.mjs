// ===========================================================================
//  api.mjs — runs the Express app as a Netlify Function.
//
//  netlify.toml redirects  /api/*  to  /.netlify/functions/api/:splat,  so the
//  browser keeps calling <origin>/api/... exactly as it does against the Vite
//  dev proxy in development.
//
//  Netlify is inconsistent about which path the function sees: it may be the
//  original request path ("/api/health") or the resolved function path
//  ("/.netlify/functions/api/health"). Express only knows its own routes
//  ("/health"), so strip whichever prefix is present before handing the event
//  over. Getting this wrong does not 404 - the request falls past the public
//  routes into the auth guard and comes back as a confusing 401.
//
//  This imports the COMPILED backend (backend/dist), which the Netlify build
//  command produces with tsc. Importing backend/src directly would leave
//  esbuild to resolve NodeNext-style ".js" specifiers that point at ".ts"
//  files, which it does not do.
// ===========================================================================
import serverless from "serverless-http";
import { app } from "../dist/src/app.js";

const PREFIXES = ["/.netlify/functions/api", "/api"];

function stripPrefix(path) {
  if (!path) return "/";
  for (const prefix of PREFIXES) {
    if (path === prefix) return "/";
    if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length) || "/";
  }
  return path;
}

const inner = serverless(app);

export const handler = (event, context) => {
  const next = { ...event };
  if (typeof next.path === "string") next.path = stripPrefix(next.path);
  if (typeof next.rawPath === "string") next.rawPath = stripPrefix(next.rawPath);
  if (next.requestContext?.http?.path)
    next.requestContext = {
      ...next.requestContext,
      http: {
        ...next.requestContext.http,
        path: stripPrefix(next.requestContext.http.path),
      },
    };
  return inner(next, context);
};
