import { getConfig } from './config';
import { ForbiddenError, UnauthenticatedError } from './errors';
import { JwtClaims, UserContext } from './types';

const toTrimmedStrings = (values: unknown[]): string[] => {
  const normalized = values
    .map((value) => (typeof value === 'string' ? value : String(value)))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(normalized));
};

const parseStringList = (value: string, separators: RegExp): string[] => {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  // Case 1: JSON array string, e.g. '["admin","editor"]'
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((entry) =>
          typeof entry === 'string' ? entry.trim() : String(entry).trim(),
        ).filter(Boolean);
      }
    } catch {
      // Fall through to bracketed fallback
    }

    // Case 2: Bracketed list that is not valid JSON, e.g. '[admin]' or '[admin,editor]'
    const inner = trimmed.replaceAll(/(?:^\[|\]$)/g, '').trim();
    if (!inner) {
      return [];
    }

    return inner
      .split(separators)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  // Case 3: Plain string, split by separators
  return trimmed
    .split(separators)
    .map((part) => part.trim())
    .filter(Boolean);
};

const normalizeStringOrArray = (value: unknown, separators: RegExp): string[] => {
  if (Array.isArray(value)) {
    return toTrimmedStrings(value);
  }

  if (typeof value === 'string') {
    return toTrimmedStrings(parseStringList(value, separators));
  }

  return [];
};

const normalizeGroups = (value: unknown) => normalizeStringOrArray(value, /[\s,]+/);
const normalizeScopes = (value: unknown) => normalizeStringOrArray(value, /\s+/);


const pickString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export function buildUserContext(rawClaims: JwtClaims): UserContext {
  const sub = pickString(rawClaims.sub);
  if (!sub) {
    throw new UnauthenticatedError('Missing sub claim');
  }

  const { groupClaimKey, scopeClaimKey } = getConfig();
  const groups = normalizeGroups(rawClaims[groupClaimKey]);
  const scopes = normalizeScopes(rawClaims[scopeClaimKey]);
  const username = pickString(rawClaims.username);
  const email = pickString(rawClaims.email);

  let userContext: UserContext = {
    sub,
    groups,
    scopes,
    rawClaims,
  };

  if (username) {
    userContext.username = username;
  }

  if (email) {
    userContext.email = email;
  }

  return userContext;
}

export const userInGroup = (user: UserContext, group: string): boolean =>
  user.groups.includes(group);

export const userInAnyGroup = (user: UserContext, groups: string[]): boolean =>
  groups.some((group) => userInGroup(user, group));

export const hasScope = (user: UserContext, scope: string): boolean =>
  user.scopes.includes(scope);

export const hasAnyScope = (user: UserContext, scopes: string[]): boolean =>
  scopes.some((scope) => hasScope(user, scope));

export const requireGroups = (user: UserContext, required: string | string[]): UserContext => {
  const groups = Array.isArray(required) ? required : [required];
  if (groups.length === 0) {
    return user;
  }

  if (!userInAnyGroup(user, groups)) {
    throw new ForbiddenError('User is not in the required group');
  }

  return user;
};

export const requireScopes = (user: UserContext, required: string | string[]): UserContext => {
  const scopes = Array.isArray(required) ? required : [required];
  if (scopes.length === 0) {
    return user;
  }

  if (!hasAnyScope(user, scopes)) {
    throw new ForbiddenError('User does not have the required scope');
  }

  return user;
};
