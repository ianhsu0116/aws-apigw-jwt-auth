import {
  buildUserContext,
  configureAuth,
  forbiddenResponse,
  hasAnyScope,
  hasScope,
  requireGroups,
  requireScopes,
  requireUser,
  unauthenticatedResponse,
  userContextFromEvent,
  userInAnyGroup,
  userInGroup,
  withUserContext,
} from '../src';
import { resetConfig } from '../src/config';
import { ForbiddenError, UnauthenticatedError } from '../src/errors';
import type { AnyJwtEvent, RestJwtEvent, HttpJwtEvent } from '../src/types';

const restEvent = (claims?: Record<string, unknown>): RestJwtEvent =>
  ({
    body: null,
    headers: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    path: '/test',
    pathParameters: null,
    queryStringParameters: null,
    requestContext: {
      accountId: '123',
      apiId: 'abc',
      authorizer: claims ? { claims } : undefined,
      httpMethod: 'GET',
      identity: {} as never,
      path: '/test',
      protocol: 'HTTP/1.1',
      requestId: 'req',
      requestTimeEpoch: 0,
      resourceId: 'res',
      resourcePath: '/test',
      stage: 'dev',
    },
    resource: '/test',
    stageVariables: null,
  }) as RestJwtEvent;

const httpEvent = (claims?: Record<string, unknown>): HttpJwtEvent =>
  ({
    version: '2.0',
    routeKey: '$default',
    rawPath: '/test',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'api',
      authorizer: claims
        ? {
          jwt: {
            claims,
            scopes: typeof claims?.scope === 'string' ? (claims.scope as string).split(' ') : undefined,
          },
        }
        : undefined,
      domainName: 'example.com',
      domainPrefix: 'api',
      http: {
        method: 'GET',
        path: '/test',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'jest',
      },
      requestId: 'req',
      routeKey: '$default',
      stage: '$default',
      time: '',
      timeEpoch: 0,
    },
    isBase64Encoded: false,
  }) as HttpJwtEvent;

afterEach(() => {
  resetConfig();
});

describe('claim extraction', () => {
  test('extracts claims from REST event', () => {
    const claims = { sub: 'user123', 'cognito:groups': 'admins' };
    const context = userContextFromEvent(restEvent(claims));
    expect(context.sub).toBe('user123');
    expect(context.groups).toContain('admins');
  });

  test('extracts claims from HTTP event', () => {
    const claims = { sub: 'user456', scope: 'read:items' };
    const context = userContextFromEvent(httpEvent(claims) as AnyJwtEvent);
    expect(context.sub).toBe('user456');
    expect(context.scopes).toEqual(['read:items']);
  });
});

describe('user context normalization', () => {
  test('normalizes groups and scopes from common formats', () => {
    const claims = {
      sub: 'abc',
      username: 'cuser',
      email: 'user@example.com',
      'cognito:groups': 'admins, editors',
      scope: 'read write read',
    };

    const user = buildUserContext(claims);
    expect(user.username).toBe('cuser');
    expect(user.email).toBe('user@example.com');
    expect(user.groups).toEqual(['admins', 'editors']);
    expect(user.scopes).toEqual(['read', 'write']);
  });

  test('parses JSON-like group strings', () => {
    const claims = { sub: 'abc', 'cognito:groups': '["team1","team2"]' };
    const user = buildUserContext(claims);
    expect(user.groups).toEqual(['team1', 'team2']);
  });

  test('parses bracketed and duplicate values', () => {
    const claims = { sub: 'abc', 'cognito:groups': '[admin, editor]', scope: 'read read write' };
    const user = buildUserContext(claims);
    expect(user.groups).toEqual(['admin', 'editor']);
    expect(user.scopes).toEqual(['read', 'write']);
  });

  test('handles missing optional claims gracefully', () => {
    const user = buildUserContext({ sub: 'only-sub' });
    expect(user.groups).toEqual([]);
    expect(user.scopes).toEqual([]);
  });

  test('supports configurable claim keys', () => {
    configureAuth({ groupClaimKey: 'roles', scopeClaimKey: 'permissions' });
    const claims = { sub: 'abc', roles: 'one two', permissions: ['p1', 'p2'] };
    const user = buildUserContext(claims);
    expect(user.groups).toEqual(['one', 'two']);
    expect(user.scopes).toEqual(['p1', 'p2']);
  });

  test('requires sub claim', () => {
    expect(() => buildUserContext({} as never)).toThrow(UnauthenticatedError);
  });

  test('resetConfig restores defaults after configureAuth', () => {
    configureAuth({ groupClaimKey: 'roles' });
    const user = buildUserContext({ sub: 'abc', roles: 'team' });
    expect(user.groups).toEqual(['team']);

    resetConfig();
    const defaultUser = buildUserContext({ sub: 'abc', 'cognito:groups': 'admins' });
    expect(defaultUser.groups).toEqual(['admins']);
  });
});

describe('authentication helpers', () => {
  test('throws unauthenticated for missing claims', () => {
    expect(() => requireUser(restEvent())).toThrow(UnauthenticatedError);
  });

  test('throws unauthenticated for malformed HTTP claims', () => {
    const event = httpEvent('oops' as unknown as Record<string, unknown>) as AnyJwtEvent;
    expect(() => requireUser(event)).toThrow(UnauthenticatedError);
  });
});

describe('authorization helpers', () => {
  const user = buildUserContext({
    sub: 'abc',
    'cognito:groups': ['admins'],
    scope: 'write read',
  });

  test('group checks return booleans', () => {
    expect(userInGroup(user, 'admins')).toBe(true);
    expect(userInAnyGroup(user, ['editors', 'guests'])).toBe(false);
  });

  test('group requirement throws forbidden', () => {
    expect(() => requireGroups(user, 'editors')).toThrow(ForbiddenError);
  });

  test('scope helpers evaluate scopes', () => {
    expect(hasScope(user, 'write')).toBe(true);
    expect(hasAnyScope(user, ['delete', 'update'])).toBe(false);
  });

  test('empty requirements pass through', () => {
    expect(requireGroups(user, [])).toBe(user);
    expect(requireScopes(user, [])).toBe(user);
  });

  test('scope requirement throws forbidden', () => {
    expect(() => requireScopes(user, ['delete'])).toThrow(ForbiddenError);
  });
});

describe('response helpers', () => {
  test('unauthenticated response returns REST shape', () => {
    const response = unauthenticatedResponse(restEvent({ sub: 'user' }));
    expect(response.statusCode).toBe(401);
    expect(typeof response.body).toBe('string');
  });

  test('forbidden response returns HTTP API shape', () => {
    const response = forbiddenResponse(httpEvent({ sub: 'user' }) as AnyJwtEvent);
    expect(response.statusCode).toBe(403);
    expect(typeof response.body).toBe('string');
  });
});

describe('handler wrapper', () => {
  test('injects user context and returns wrapped handler output', async () => {
    const handler = withUserContext(async (_event, user) => ({
      statusCode: 200,
      body: JSON.stringify({ user: user.sub }),
    }));

    const response = await handler(restEvent({ sub: 'abc' }));
    expect(response).toMatchObject({ statusCode: 200 });
  });

  test('converts authentication errors to 401 responses', async () => {
    const handler = withUserContext(async () => ({ statusCode: 200, body: '' }));
    const response = await handler(restEvent());
    expect(response.statusCode).toBe(401);
  });

  test('converts authorization errors to 403 responses', async () => {
    const handler = withUserContext(async () => {
      throw new ForbiddenError();
    });

    const response = await handler(restEvent({ sub: 'abc' }));
    expect(response.statusCode).toBe(403);
  });
});
