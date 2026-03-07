# Changesets

Hello! This folder contains changesets for this project.

When you make a change, run `npm run changeset` (or `npx changeset`) to add a changeset.
This will prompt you for the packages that have changed, and the bump type (major/minor/patch).

When you are ready to release, run `npm run version-packages` (or `npx changeset version`) to bump versions and update changelogs.
Then commit the changes and run `npm run release` (or `npx changeset publish`) to publish to npm.
