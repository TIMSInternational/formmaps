// Token service for handling authentication tokens

export interface TokenInfo {
  token: string;
  isValid: boolean;
  isTestToken: boolean;
  expiresAt?: Date;
}

// Get the current token from localStorage
export function getCurrentToken(): string | null {
  return localStorage.getItem("token");
}

// Check if token is a test token
export function isTestToken(token: string): boolean {
  return token.startsWith("test-token");
}

// Validate token format (basic validation)
export function validateTokenFormat(token: string): boolean {
  if (isTestToken(token)) {
    return true; // Test tokens are always valid for testing
  }

  // JWT tokens should have 3 parts separated by dots
  const parts = token.split(".");
  return parts.length === 3;
}

// Get token info
export function getTokenInfo(token: string): TokenInfo {
  const isTest = isTestToken(token);
  const isValid = validateTokenFormat(token);

  return {
    token,
    isValid,
    isTestToken: isTest,
  };
}

// Set a real token (from login)
export function setRealToken(token: string): void {
  localStorage.setItem("token", token);
  console.log("✅ Real token set:", token.substring(0, 20) + "...");

  // Also clear any test admin role data since we now have a real token
  localStorage.removeItem("user");
}

// Clear all tokens
export function clearTokens(): void {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  console.log("🗑️ All tokens cleared");
}

// Get authorization header for API calls
export function getAuthHeader(): { Authorization: string } | object {
  const token = getCurrentToken();

  if (!token) {
    console.warn("⚠️ No token found for API call");
    return {};
  }

  const tokenInfo = getTokenInfo(token);

  if (tokenInfo.isTestToken) {
    console.warn("⚠️ Using test token for API call - this may fail");
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

  // For API calls, we need a real token, not a test token
  return tokenInfo.isValid && !tokenInfo.isTestToken;
}

// Get token status for debugging
export function getTokenStatus(): {
  hasToken: boolean;
  isTestToken: boolean;
  isValidForAPI: boolean;
  tokenPreview: string;
} {
  const token = getCurrentToken();

  if (!token) {
    return {
      hasToken: false,
      isTestToken: false,
      isValidForAPI: false,
      tokenPreview: "No token",
    };
  }

  const tokenInfo = getTokenInfo(token);

  return {
    hasToken: true,
    isTestToken: tokenInfo.isTestToken,
    isValidForAPI: hasValidTokenForAPI(),
    tokenPreview: token.substring(0, 20) + "...",
  };
}
