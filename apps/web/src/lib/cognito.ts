import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoUserSession,
} from "amazon-cognito-identity-js";

const POOL_DATA = {
  UserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "",
  ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "",
};

const userPool = new CognitoUserPool(POOL_DATA);

export interface CognitoLoginResult {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  user: {
    sub: string;
    email: string;
    name: string;
    role: string;
    schoolId?: string;
    mongoId: string;
  };
}

function extractUserFromSession(session: CognitoUserSession): CognitoLoginResult {
  const idToken = session.getIdToken();
  const payload = idToken.decodePayload();

  return {
    idToken: idToken.getJwtToken(),
    accessToken: session.getAccessToken().getJwtToken(),
    refreshToken: session.getRefreshToken().getToken(),
    user: {
      sub: payload["sub"],
      email: payload["email"],
      name: payload["name"],
      role: payload["custom:role"] || "student",
      schoolId: payload["custom:schoolId"] || undefined,
      mongoId: payload["custom:mongoId"] || payload["sub"],
    },
  };
}

export function cognitoLogin(email: string, password: string): Promise<CognitoLoginResult> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email.toLowerCase(),
      Pool: userPool,
    });

    const authDetails = new AuthenticationDetails({
      Username: email.toLowerCase(),
      Password: password,
    });

    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => {
        resolve(extractUserFromSession(session));
      },
      onFailure: (err) => {
        let message = "Login failed. Please try again.";
        if (err.code === "NotAuthorizedException") {
          message = "Invalid email or password. Please try again.";
        } else if (err.code === "UserNotFoundException") {
          message = "Account not found. Please check your email address.";
        } else if (err.code === "UserNotConfirmedException") {
          message = "Please verify your email before logging in.";
        } else if (err.message) {
          message = err.message;
        }
        reject(new Error(message));
      },
      newPasswordRequired: () => {
        reject(new Error("Password change required. Please contact support."));
      },
    });
  });
}

export function cognitoSignUp(
  name: string,
  email: string,
  password: string,
  role: string = "student"
): Promise<string> {
  return new Promise((resolve, reject) => {
    const attributes = [
      new CognitoUserAttribute({ Name: "email", Value: email.toLowerCase() }),
      new CognitoUserAttribute({ Name: "name", Value: name }),
      new CognitoUserAttribute({ Name: "custom:role", Value: role }),
    ];

    userPool.signUp(email.toLowerCase(), password, attributes, [], (err, result) => {
      if (err) {
        let message = "Sign up failed. Please try again.";
        if (err.message?.includes("already exists")) {
          message = "An account with this email already exists.";
        } else if (err.message?.includes("password")) {
          message = "Password must be at least 8 characters with uppercase, lowercase, number, and symbol.";
        } else if (err.message) {
          message = err.message;
        }
        reject(new Error(message));
        return;
      }
      resolve(result?.userSub || "");
    });
  });
}

export function cognitoLogout(): void {
  const cognitoUser = userPool.getCurrentUser();
  if (cognitoUser) {
    cognitoUser.signOut();
  }
}

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
        if (err.code === "UserNotFoundException") {
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
        if (err.code === "ExpiredCodeException") {
          message = "Reset code has expired. Please request a new one.";
        } else if (err.code === "CodeMismatchException") {
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

export function cognitoRefreshSession(): Promise<CognitoLoginResult | null> {
  return new Promise((resolve) => {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      resolve(null);
      return;
    }

    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }
      resolve(extractUserFromSession(session));
    });
  });
}
