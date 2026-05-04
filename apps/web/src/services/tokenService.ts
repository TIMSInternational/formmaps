// Token service for handling authentication tokens

export interface TokenInfo {
  token: string;
  isValid: boolean;
  expiresAt?: Date;
}

// Get the current token from localStorage
export function getCurrentToken(): string | null {
  return localStorage.getItem("token");
}

// Validate token format (basic validation)
export function validateTokenFormat(token: string): boolean {
  // JWT tokens should have 3 parts separated by dots
  const parts = token.split(".");
  return parts.length === 3;
}

// Get token info
export function getTokenInfo(token: string): TokenInfo {
  const isValid = validateTokenFormat(token);

  return {
    token,
    isValid,
  };
}

// Set a real token (from login)
export function setRealToken(token: string): void {
  localStorage.setItem("token", token);

  // Also clear any stale user data
  localStorage.removeItem("user");
}

// Clear all tokens
export function clearTokens(): void {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

// Get authorization header for API calls
export function getAuthHeader(): { Authorization: string } | object {
  const token = getCurrentToken();

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

// Check if we have a valid token for API calls
export function hasValidTokenForAPI(): boolean {
  const token = getCurrentToken();

  if (!token) {
    return false;
  }

  const tokenInfo = getTokenInfo(token);
  return tokenInfo.isValid;
}

// Get token status for debugging
export function getTokenStatus(): {
  hasToken: boolean;
  isValidForAPI: boolean;
  tokenPreview: string;
} {
  const token = getCurrentToken();

  if (!token) {
    return {
      hasToken: false,
      isValidForAPI: false,
      tokenPreview: "No token",
    };
  }

  return {
    hasToken: true,
    isValidForAPI: hasValidTokenForAPI(),
    tokenPreview: token.substring(0, 20) + "...",
  };
}
