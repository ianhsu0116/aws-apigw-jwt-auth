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

#### Wrap a Lambda handler

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