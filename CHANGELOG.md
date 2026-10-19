# Changelog

## 0.0.4 - 2026-10-11

- Export `FilesAPI`, `AssetVisibility`, and `ListOptions` from the package entrypoint.
- Validate retry and timeout configuration before creating the client.
- Reject upload sessions whose metadata does not match the requested file.
- Validate multipart concurrency and reject malformed or duplicate resume state.
- Serialize multipart state callbacks so persisted progress cannot move backward.

## 0.0.3 - 2026-10-03

- Keep the API endpoint internal to the SDK; construction only needs a project key.
- Align the SDK request header with the package version.
- Encode asset IDs as URL path segments and reject HTTP redirects.
- Validate multipart part responses and persisted state before completion.
- Include logo assets in the npm package.
- Add `uploadFile()` and `resumeFile()` to read local multipart uploads in chunks.
- Enforce Prettier formatting in the SDK verification workflow.

## 0.0.2

- Initial published Node.js SDK with upload, multipart resume, browser upload preparation, asset management, and delivery URL operations.
