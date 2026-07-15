export interface JWTPayload {
  userId: string;
  email: string;
  roleId: string;
  roleName?: string;
  iat?: number;
  exp?: number;
}

export function verifyJWT(token: string): JWTPayload {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid token");
    const payload = JSON.parse(atob(parts[1])) as JWTPayload;
    if (!payload || !payload.userId) throw new Error("Invalid token");
    return payload;
  } catch {
    throw new Error("Invalid token");
  }
}

export function getUserIdFromRequest(request: Request): string {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("No authorization token provided");
  }

  const token = authHeader.substring(7);
  const payload = verifyJWT(token);
  return payload.userId;
}
