import { buildUserContext } from './context';
import { ForbiddenError, UnauthenticatedError } from './errors';
import { AnyJwtEvent, HttpJwtEvent, JwtClaims, RestJwtEvent, UserContext, APIGatewayResponse } from './types';

const ensureObjectClaims = (claims: unknown): JwtClaims => {
  if (!claims || typeof claims !== 'object') {
    throw new UnauthenticatedError('Authorizer claims missing or malformed');
  }

  return claims as JwtClaims;
};

export const extractRestClaims = (event: RestJwtEvent): JwtClaims => {
  const claims = event?.requestContext?.authorizer?.claims;
  return ensureObjectClaims(claims);
};

export const extractHttpClaims = (event: HttpJwtEvent): JwtClaims => {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  return ensureObjectClaims(claims);
};

export const userContextFromRestEvent = (event: RestJwtEvent): UserContext =>
  buildUserContext(extractRestClaims(event));

export const userContextFromHttpEvent = (event: HttpJwtEvent): UserContext =>
  buildUserContext(extractHttpClaims(event));

const isHttpJwtEvent = (event: AnyJwtEvent): event is HttpJwtEvent =>
  Boolean((event as HttpJwtEvent)?.requestContext?.authorizer?.jwt);

export const userContextFromEvent = (event: AnyJwtEvent): UserContext =>
  isHttpJwtEvent(event) ? userContextFromHttpEvent(event) : userContextFromRestEvent(event);

export const requireUser = (event: AnyJwtEvent): UserContext => userContextFromEvent(event);

const buildResponse = (statusCode: number, message: string): APIGatewayResponse => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message }),
});

export const unauthenticatedResponse = (
  event: AnyJwtEvent,
): APIGatewayResponse => {
  return buildResponse(401, 'Unauthorized');
};

export const forbiddenResponse = (
  event: AnyJwtEvent,
): APIGatewayResponse => {
  return buildResponse(403, 'Forbidden');
};

export const withUserContext = (
  handler: (
    event: AnyJwtEvent,
    user: UserContext,
  ) => Promise<APIGatewayResponse> | APIGatewayResponse,
) =>
  async (event: AnyJwtEvent): Promise<APIGatewayResponse> => {
    try {
      const user = requireUser(event);
      return await handler(event, user);
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return unauthenticatedResponse(event);
      }

      if (error instanceof ForbiddenError) {
        return forbiddenResponse(event);
      }

      throw error;
    }
  };