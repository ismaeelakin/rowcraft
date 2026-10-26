# Contributing

Run `npm ci`, `npm run format:check`, `npm run check` and `npm test`. Use `npm run format` after edits. Generated `site/assets/` and `dist/` are not committed to the source branch.

Keep CSV/rule/export behavior in pure modules and test both normal data and edge cases. Do not add network uploads, trackers or persistent file storage without an explicit product/privacy decision. Use synthetic fixtures and never commit personal CSV files.

Before publishing, run the browser checklist in `docs/DESIGN.md`, build the static files and verify the live deployment with an actual download.
