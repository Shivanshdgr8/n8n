# n8n-nodes-abacus

n8n community node for the Abacus ERP REST API.

This package adds an `Abacus` node to n8n so workflows can read and write business data from an Abacus tenant without building raw HTTP Request steps by hand.

## What This Project Does

The node is designed around the Abacus service-user model and uses OAuth2 client credentials with OpenID discovery.

Current node capabilities:

- Resources: `Addresses`, `Customers`, `Subjects`, `Orders`, `Invoices`, `Projects`
- Operations: `Get`, `Get All`, `Create`, `Update`, `Delete`
- Automatic token discovery from `/.well-known/openid-configuration`
- Automatic retry handling for `401` and `429`
- Automatic pagination for list operations
- Structured fields in the n8n UI instead of raw JSON-only input

## Project Status

The package is buildable, lintable, and loadable in local n8n.

What is already verified:

- the node builds successfully
- the node loads in n8n
- the credential UI appears correctly
- the Abacus node is searchable in the n8n editor

What still depends on a real Abacus tenant:

- exact endpoint paths for every resource
- actual resource payload shapes
- tenant-specific API base path
- service-user permissions
- differences across Abacus versions and enabled modules

## Supported Resources

The current node exposes the following resources:

- `Addresses`
- `Customers`
- `Subjects`
- `Orders`
- `Invoices`
- `Projects`

Each resource currently supports:

- `Get`
- `Get All`
- `Create`
- `Update`
- `Delete`

## Authentication

The node uses OAuth2 client credentials with the Abacus service-user concept.

Credential fields:

- `Instance URL`
- `Client ID`
- `Client Secret`
- `API Base Path` optional, default: `/api/entity/v1`

The token endpoint is discovered automatically from:

```text
{instanceUrl}/.well-known/openid-configuration
```

### What Is the Instance URL

The `Instance URL` is the base URL of the customer's Abacus tenant.

Example:

```text
https://company.abacus.ch
```

Use only the base domain.

Correct:

```text
https://company.abacus.ch
```

Not correct:

```text
https://company.abacus.ch/api/entity/v1
https://company.abacus.ch/.well-known/openid-configuration
```

## Information Required From the Abacus Admin

To test this node against a real Abacus environment, the Abacus administrator must provide:

- `Instance URL`
- `Client ID`
- `Client Secret`
- confirmed API base path if different from `/api/entity/v1`
- confirmation which entities are enabled for the service user

You can send this request:

```text
We need the Abacus API service-user connection details for n8n integration testing:

1. Abacus Instance URL
2. OAuth2 Client ID
3. OAuth2 Client Secret
4. Confirmed API base path if different from /api/entity/v1
5. Confirmation which entities are enabled for the service user
```

## Local Development

Install dependencies:

```bash
npm ci
```

Run quality checks:

```bash
npm test
```

Build the node:

```bash
npm run build
```

## Run With Docker

This repository includes a local n8n Docker setup for testing the node inside a real n8n instance.

Start local n8n:

```bash
docker compose up -d
```

Open:

```text
http://localhost:5678
```

This repo is mounted into the n8n container through `N8N_CUSTOM_EXTENSIONS`, so the local `Abacus` node is loaded from this project.

When you change the node code:

```bash
npm run build
docker compose restart
```

## How To Test the Node in n8n

1. Open `http://localhost:5678`
2. Create a new workflow
3. Add the `Abacus` node
4. Create an `Abacus API` credential
5. Fill in:
   - `Instance URL`
   - `Client ID`
   - `Client Secret`
   - optional `API Base Path`
6. Start with this safe test:
   - Resource: `Addresses`
   - Operation: `Get All`
   - `Return All`: off
   - `Limit`: `5`
7. Click `Execute step`

## Expected Error Types During First Integration

When connecting to a real tenant for the first time, the most likely failures are:

- invalid `Instance URL`
- OpenID discovery endpoint unavailable
- invalid `Client ID` or `Client Secret`
- wrong `API Base Path`
- endpoint path differences between Abacus tenants
- insufficient service-user permissions

## Runtime Behavior

The node currently includes:

- token reuse in-memory during a node execution
- token refresh when a `401` is returned
- backoff and retry for `429`
- clear error messages for `404` and `500`
- validation that create and update operations include at least one field

## Build and Packaging

Production checks:

```bash
npm test
```

Create a package tarball:

```bash
npm pack
```

This project is prepared for verified n8n community-node publication:

- package name: `n8n-nodes-abacus`
- GitHub Actions based CI
- GitHub Actions based npm publish
- npm provenance enabled
- zero runtime dependencies

## Install in Self-Hosted n8n

If you are not using the included Docker setup, make sure the n8n environment allows community packages:

```text
N8N_COMMUNITY_PACKAGES_ENABLED=true
```

Then install the package in the same environment as your n8n instance.

## Limitations

This project currently uses a practical, minimal resource model for Abacus, but Abacus API installations can differ by:

- version
- tenant configuration
- enabled modules
- endpoint naming
- payload schema

That means some resource definitions may need refinement after testing against a real tenant.

## Security Notes

- no business data is stored by this package
- no credentials are stored outside n8n's credential store
- the node acts as a transport layer between n8n and the target Abacus tenant
- create and update operations send only fields explicitly provided in the node UI

## Repository Commands

- `npm ci` installs dependencies
- `npm run build` builds the package into `dist/`
- `npm run lint` runs the n8n lint checks
- `npm test` runs the local production check
- `npm pack` creates an installable package archive
- `docker compose up -d` starts local n8n

## License

MIT
