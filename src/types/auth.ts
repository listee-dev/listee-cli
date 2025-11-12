export type { SupabaseToken as AuthTokenClaims } from "@listee/types";

export type AuthTokenResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
};

export type StoredCredential = {
  account: string;
  refreshToken: string;
};

export type AccessTokenResult = {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
};

export type AuthStatus =
  | { state: "logged_out" }
  | { state: "logged_in"; accounts: readonly string[] };

export type EmailOption = {
  email?: string;
};

export type RawModeCapableInput = NodeJS.ReadStream & { fd: 0 };

export type SignupRedirect = AccessTokenResult & {
  account: string;
  refreshToken: string;
};
