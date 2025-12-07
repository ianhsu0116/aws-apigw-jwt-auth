export type AuthConfig = {
  groupClaimKey: string;
  scopeClaimKey: string;
};

const defaultConfig: AuthConfig = {
  groupClaimKey: 'cognito:groups',
  scopeClaimKey: 'scope',
};

let currentConfig: AuthConfig = { ...defaultConfig };

export function configureAuth(options: Partial<AuthConfig> = {}): AuthConfig {
  currentConfig = { ...currentConfig, ...options };
  return currentConfig;
}

export function getConfig(): AuthConfig {
  return currentConfig;
}

export function resetConfig(): void {
  currentConfig = { ...defaultConfig };
}
