# aws-apigw-jwt-auth

Small TypeScript helper library for AWS Lambda handlers behind API Gateway that use Cognito-based JWT authorization.

It normalizes JWT claims from API Gateway events into a `UserContext` and provides simple helpers for authentication and group/scope-based authorization.

> ❗ This library does **not** verify JWT signatures. It assumes API Gateway + Cognito have already validated the token.

---

## Features

- Supports **API Gateway REST API** (v1.0) + Cognito Authorizer.
- Supports **API Gateway HTTP API** (v2.0) + JWT Authorizer (Cognito).
- Normalizes claims into a consistent `UserContext`.
- Group-based authorization (Cognito `cognito:groups` by default).
- Scope-based authorization (`scope` claim by default).
- Optional wrapper `withUserContext` to inject user context and auto-handle 401/403.

---

## Installation

```bash
npm install aws-apigw-jwt-auth
# or
yarn add aws-apigw-jwt-auth
```

---

## Quick start

### Wrap a Lambda handler

```typescript
import {
  withUserContext,
  requireGroups,
} from 'aws-apigw-jwt-auth';
import type {
  AnyJwtEvent,
  UserContext,
  APIGatewayResponse,
} from 'aws-apigw-jwt-auth';

export const handler = withUserContext(
  async (
    event: AnyJwtEvent,
    user: UserContext,
  ): Promise<APIGatewayResponse> => {
    // Require the user to be in the "admin" group
    requireGroups(user, 'admin');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Hello, ${user.sub}`,
        groups: user.groups,
        scopes: user.scopes,
      }),
    };
  },
);
```

Behavior:
- If JWT is missing/invalid ⇒ returns a 401 JSON response.
- If user is not in the required group(s) ⇒ returns a 403 JSON response.
- Otherwise ⇒ your handler’s response is returned as-is.

---

## Supported event types

The library supports:
- **REST API + Cognito Authorizer**
  ```typescript
  import type { RestJwtEvent } from 'aws-apigw-jwt-auth';
  // alias of APIGatewayProxyWithCognitoAuthorizerEvent
  ```
- **HTTP API + JWT Authorizer (Cognito)**
  ```typescript
  import type { HttpJwtEvent } from 'aws-apigw-jwt-auth';
  // alias of APIGatewayProxyEventV2WithJWTAuthorizer
  ```
- You can also use the union:
  ```typescript
  import type { AnyJwtEvent } from 'aws-apigw-jwt-auth';
  ```

---

## Configuration

By default, the library expects:
- Groups in the claim: `cognito:groups`
- Scopes in the claim: `scope` (e.g. `"openid profile email"`)

You can override these via `configureAuth` (run this once at cold start):
```typescript
import { configureAuth } from 'aws-apigw-jwt-auth';

configureAuth({
  groupClaimKey: 'roles',   // instead of "cognito:groups"
  scopeClaimKey: 'scopes',  // instead of "scope"
});
```

Configuration is process-global within the Lambda runtime.
`configureAuth` merges into the current config; use `resetConfig()` in tests if needed.

---

## UserContext and helpers

### UserContext

```typescript
import type { UserContext } from 'aws-apigw-jwt-auth';

type UserContext = {
  sub: string;          // required user identifier
  username?: string;    // taken from the "username" claim when present
  email?: string;       // taken from the "email" claim when present
  groups: string[];     // normalized group names
  scopes: string[];     // normalized scopes
  rawClaims: Record<string, unknown>;
};
```

The library will:
- Require `sub` to be a non-empty string.
- Normalize groups from:
  - arrays, or
  - strings (space- or comma-separated, bracketed/JSON-like strings).
- Normalize scopes from:
  - arrays, or
  - strings (space-separated, e.g. `"openid profile email"`).
- Trim and de-duplicate groups/scopes.

### Getting a UserContext without the wrapper

```typescript
import {
  userContextFromEvent,
  userInGroup,
  hasScope,
} from 'aws-apigw-jwt-auth';
import type {
  AnyJwtEvent,
  UserContext,
} from 'aws-apigw-jwt-auth';

export const handler = async (event: AnyJwtEvent) => {
  const user: UserContext = userContextFromEvent(event);

  if (!userInGroup(user, 'member')) {
    // handle unauthorized
  }

  if (hasScope(user, 'orders:read')) {
    // ...
  }

  // ...
};
```
If claims are missing or malformed, `userContextFromEvent` throws `UnauthenticatedError`.

---

## Authorization helpers

All helpers work on `UserContext`.

```typescript
import {
  userInGroup,
  userInAnyGroup,
  hasScope,
  hasAnyScope,
  requireGroups,
  requireScopes,
} from 'aws-apigw-jwt-auth';
import type { UserContext } from 'aws-apigw-jwt-auth';
```

### Group checks

```typescript
const isAdmin = userInGroup(user, 'admin');
const inAny = userInAnyGroup(user, ['admin', 'editor']);
```

### Scope checks

```typescript
const canRead = hasScope(user, 'orders:read');
const canAny = hasAnyScope(user, ['orders:read', 'orders:write']);
```

### Enforcing groups/scopes

These throw `ForbiddenError` when not satisfied:

```typescript
requireGroups(user, 'admin');          // single group
requireGroups(user, ['admin', 'ops']); // any of the listed groups

requireScopes(user, 'orders:read');
requireScopes(user, ['orders:read', 'orders:write']);
```

They return the same `user` on success, so you can chain:

```typescript
const user = requireScopes(
  requireGroups(user, 'admin'),
  'orders:write',
);
```

---

## Response helpers

The library provides simple 401/403 response builders.

```typescript
import {
  unauthenticatedResponse,
  forbiddenResponse,
} from 'aws-apigw-jwt-auth';
import type {
  AnyJwtEvent,
  APIGatewayResponse,
} from 'aws-apigw-jwt-auth';

export const handler = async (
  event: AnyJwtEvent,
): Promise<APIGatewayResponse> => {
  if (!event.headers.authorization) {
    return unauthenticatedResponse(event);
  }

  // ...
};
```

`APIGatewayResponse` is:

```typescript
type APIGatewayResponse =
  | APIGatewayProxyResult
  | APIGatewayProxyStructuredResultV2;
```

Both helpers return a JSON body:

```typescript
{ "message": "Unauthorized" }
{ "message": "Forbidden" }
```

Responses include a `Content-Type: application/json` header.

---

## Error types

```typescript
import {
  AuthError,
  UnauthenticatedError,
  ForbiddenError,
} from 'aws-apigw-jwt-auth';
```

`UnauthenticatedError`
- Thrown when claims are missing/malformed or sub is missing.
- Has statusCode = 401.

`ForbiddenError`
- Thrown when group/scope checks fail.
- Has statusCode = 403.

`AuthError`
- Base class for the above.

`withUserContext` automatically catches these and returns 401/403 responses.
If you do not use the wrapper, you can catch them manually:

```typescript
try {
  const user = userContextFromEvent(event);
  requireGroups(user, 'admin');
  // ...
} catch (err) {
  if (err instanceof UnauthenticatedError) {
    return unauthenticatedResponse(event);
  }
  if (err instanceof ForbiddenError) {
    return forbiddenResponse(event);
  }
  throw err;
}
```

---

## API summary

**Configuration**

- `configureAuth(options: Partial<AuthConfig>): AuthConfig`
- `getConfig(): AuthConfig`
- `resetConfig(): void`

**Types**

- `JwtClaims`
- `RestJwtEvent`
- `HttpJwtEvent`
- `AnyJwtEvent`
- `UserContext`
- `APIGatewayResponse`
- `AuthError`
- `UnauthenticatedError`
- `ForbiddenError`

**Context & auth**

- `buildUserContext(rawClaims: JwtClaims): UserContext`
- `userInGroup(user, group)`
- `userInAnyGroup(user, groups)`
- `hasScope(user, scope)`
- `hasAnyScope(user, scopes)`
- `requireGroups(user, required)`
- `requireScopes(user, required)`

**AWS helpers**

- `extractRestClaims(event: RestJwtEvent): JwtClaims`
- `extractHttpClaims(event: HttpJwtEvent): JwtClaims`
- `userContextFromRestEvent(event): UserContext`
- `userContextFromHttpEvent(event): UserContext`
- `userContextFromEvent(event: AnyJwtEvent): UserContext`
- `requireUser(event: AnyJwtEvent): UserContext`
- `unauthenticatedResponse(event: AnyJwtEvent): APIGatewayResponse`
- `forbiddenResponse(event: AnyJwtEvent): APIGatewayResponse`
- `withUserContext(handler): (event: AnyJwtEvent) => Promise<APIGatewayResponse>`

Claim extractors throw `UnauthenticatedError` when authorizer claims are missing/malformed. `withUserContext` only catches `UnauthenticatedError`/`ForbiddenError`; other errors from your handler will still be thrown.

---

## License
MIT
