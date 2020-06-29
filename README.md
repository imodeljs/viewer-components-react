# iModel.js Viewer Components React

Copyright © Bentley Systems, Incorporated. All rights reserved.

This repository contains a set of npm packages that deliver a React Components for use in an [iModel.js](imodeljs.org) application.

With the repository containing many different packages related to iModel.js, each one has it's own folder and README describing the package.

List of packages within this repository:

| Name                         | Folder                 |
| ---------------------------- | ---------------------- |
| @bentley/imodel-select-react | packages/imodel-select |
|                              |                        |

## Adding a new "project"

Please refer to the [section](CONTRIBUTING.md#adding-a-new-project) in the contributing guide.

## Contributing to this Repository

For information on how to contribute to this project, please read [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Build Instructions

1. Clone repository (first time) with `git clone` or pull updates to the repository (subsequent times) with `git pull`
2. Install dependencies: `rush install`
3. Clean: `rush clean`
4. Rebuild source: `rush rebuild`
5. Run tests: `rush test`

The `-v` option for `rush` is short for `--verbose` which results in a more verbose command.

The above commands iterate and perform their action against each package in the monorepo.

For incremental builds, the `rush build` command can be used to only build packages that have changes versus `rush rebuild` which always rebuilds all packages.

> Note: It is a good idea to `rush install` after each `git pull` as dependencies may have changed.

## Source Code Edit Workflow

1. Make source code changes on a new Git branch
2. Ensure unit tests pass when run locally: `rush test`
3. Locally commit changes: `git commit` (or use the Visual Studio Code user interface)
4. Repeat steps 1-3 until ready to push changes
5. Add changelog entry (which could potentially cover several commits): `rush change`
6. Follow prompts to enter a change description or press ENTER if the change does not warrant a changelog entry. If multiple packages have changed, multiple sets of prompts will be presented.
7. Completing the `rush change` prompts will cause new changelog entry JSON files to be created.
8. Commit the changelog JSON files.
9. Publish changes on the branch and open a pull request.

If using the command line, steps 5 through 7 above can be completed in one step by running `rushchange.bat` from the imodeljs-core root directory.

> Note: The CI build will break if changes are pushed without running `rush change` and `rush extract-api` (if the API was changed). The fix will be to complete steps 5 through 10.

Here is a sample [changelog](https://github.com/Microsoft/web-build-tools/blob/master/apps/rush/CHANGELOG.md) to demonstrate the level of detail expected.

## Updating dependencies/devDependencies on packages within the monorepo

The version numbers of internal dependencies should not be manually edited.
These will be automatically updated by the overall _version bump_ workflow.
Note that the packages are published by CI builds only.

## Updating dependencies/devDependencies on packages external to monorepo

Use these instructions to update dependencies and devDependencies on external packages (ones that live outside of this monorepo).

1. Edit the appropriate `package.json` file to update the semantic version range
2. Run `rush check` to make sure that you are specifying consistent versions across the repository
3. Run `rush update` to make sure the newer version of the module specified in #1 is installed
