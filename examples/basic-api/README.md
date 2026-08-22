# Basic API

Demonstrates a read-only request to the IRP platform status endpoint.

## Prerequisites

Start the API using the repository's normal development workflow and make sure it is listening on the configured host/port.

## Run

```bash
node examples/basic-api/request.mjs
```

Optional environment variables:

```text
IRP_API_BASE_URL=http://127.0.0.1:3000
```

The example only reads platform state. It does not perform network mutations.
