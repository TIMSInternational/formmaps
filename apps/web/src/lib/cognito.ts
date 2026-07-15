/**
 * Cognito utilities — only used for forgot-password flow.
 * Auth (login/signup/logout) is handled by authService.ts via the Node.js backend.
 */
import {
  CognitoUserPool,
  CognitoUser,
} from "amazon-cognito-identity-js";

const POOL_DATA = {
  UserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "",
  ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "",
};

const userPool = new CognitoUserPool(POOL_DATA);

export function cognitoForgotPassword(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email.toLowerCase(),
      Pool: userPool,
    });

    cognitoUser.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => {
        // Don't reveal whether the email exists
        if ((err as any).code === "UserNotFoundException") {
          resolve();
          return;
        }
        reject(new Error(err.message || "Failed to send reset code."));
      },
      inputVerificationCode: () => resolve(),
    });
  });
}

export function cognitoConfirmPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email.toLowerCase(),
      Pool: userPool,
    });

    cognitoUser.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => {
        let message = "Failed to reset password.";
        if ((err as any).code === "ExpiredCodeException") {
          message = "Reset code has expired. Please request a new one.";
        } else if ((err as any).code === "CodeMismatchException") {
          message = "Invalid reset code. Please check and try again.";
        } else if (err.message?.includes("password")) {
          message = "Password must be at least 8 characters with uppercase, lowercase, number, and symbol.";
        } else if (err.message) {
          message = err.message;
        }
        reject(new Error(message));
      },
    });
  });
}
