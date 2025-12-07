import {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyWithCognitoAuthorizerEvent,
  APIGatewayProxyResult,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

export type JwtClaims = Record<string, unknown>;

export type RestJwtEvent = APIGatewayProxyWithCognitoAuthorizerEvent;
export type HttpJwtEvent = APIGatewayProxyEventV2WithJWTAuthorizer;
export type AnyJwtEvent = RestJwtEvent | HttpJwtEvent;

export type UserContext = {
  sub: string;
  username?: string;
  email?: string;
  groups: string[];
  scopes: string[];
  rawClaims: JwtClaims;
};

export type APIGatewayResponse = APIGatewayProxyResult | APIGatewayProxyStructuredResultV2;