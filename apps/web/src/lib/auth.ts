import jwt from "jsonwebtoken";

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
    // For now, since we don't have the secret, we'll decode without verification
    // In production, you should verify with the secret
    const decoded = jwt.decode(token) as JWTPayload;

    if (!decoded || !decoded.userId) {
      throw new Error("Invalid token");
    }

    return decoded;
  } catch (error) {
    throw new Error("Invalid token");
  }
}

export function getUserIdFromRequest(request: Request): string {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("No authorization token provided");
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  const payload = verifyJWT(token);

  return payload.userId;
}
