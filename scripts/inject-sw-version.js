#!/usr/bin/env node
/**
 * Injects a unique build version into the service worker for cache busting.
 * Runs before `next build` so each deployment gets a new cache version.
 */
const fs = require('fs');
const path = require('path');

const swPath = path.join(process.cwd(), 'public', 'service-worker.js');
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_ID || `build-${Date.now()}`;
const cacheVersion = `sw-${buildId.slice(0, 12)}`;

let content = fs.readFileSync(swPath, 'utf8');
content = content.replace("const CACHE_VERSION = '__CACHE_VERSION__';", `const CACHE_VERSION = '${cacheVersion}';`);

fs.writeFileSync(swPath, content);
console.log(`[SW] Injected cache version: ${cacheVersion}`);
