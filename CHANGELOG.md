# Changelog

## Unreleased (0.0.3)

- Keep the API endpoint internal to the SDK; construction only needs a project key.
- Align the SDK request header with the package version.
- Encode asset IDs as URL path segments and reject HTTP redirects.
- Validate multipart part responses and persisted state before completion.
- Include logo assets in the npm package.

## 0.0.2

- Initial published Node.js SDK with upload, multipart resume, browser upload preparation, asset management, and delivery URL operations.
