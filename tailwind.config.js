// Worktree-only shim — not part of the main project.
// Tailwind's lilconfig search starts from process.cwd() (the worktree root), so it
// misses the real config inside calendar-api-frontend/. This file proxies it.
// Safe to delete once the worktree is removed.
module.exports = require('./calendar-api-frontend/tailwind.config.js');
