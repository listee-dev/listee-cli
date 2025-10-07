export type SupabaseTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type SupabaseErrorPayload = {
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
  status?: number;
};

export type StoredCredential = {
  account: string;
  password: string;
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
