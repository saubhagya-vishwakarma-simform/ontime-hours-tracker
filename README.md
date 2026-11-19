# OnTime Hours Tracker

Browser extension that shows working days and required / completed / pending hours on the Simform OnTime timesheet.

## Install
- **Microsoft Edge:** store link — added after first publish.
- **Manual (zip):** download the latest zip from [Releases](../../releases/latest), unzip, open `edge://extensions`, enable *Developer mode*, click *Load unpacked* and pick the unzipped folder.

## Develop
Load `src/` unpacked. Ship with `npm run release:patch|minor|major` (tags, pushes; CI builds the zip, creates a GitHub Release and publishes to Edge Add-ons when `EDGE_*` secrets are set).
