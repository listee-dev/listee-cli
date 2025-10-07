import { Buffer } from "node:buffer";
import { AsyncEntry, findCredentials } from "@napi-rs/keyring";
import type {
  AccessTokenResult,
  AuthStatus,
  SignupRedirect,
  StoredCredential,
  SupabaseErrorPayload,
  SupabaseTokenResponse,
} from "../types/auth.js";

export type { AccessTokenResult, AuthStatus, SignupRedirect } from "../types/auth.js";

const DEFAULT_SERVICE_NAME = "listee-cli";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isString = (value: unknown): value is string => {
  return typeof value === "string";
};

const isNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const isSupabaseErrorPayload = (
  value: unknown,
): value is SupabaseErrorPayload => {
  if (!isRecord(value)) {
    return false;
  }

  const possibleFields = [
    "error",
    "error_description",
    "msg",
    "message",
    "status",
  ];
  return possibleFields.some((field) => field in value);
};

const isSupabaseTokenResponse = (
  value: unknown,
): value is SupabaseTokenResponse => {
  if (!isRecord(value)) {
    return false;
  }

  const accessToken = value.access_token;
  const refreshToken = value.refresh_token;
  const tokenType = value.token_type;
  const expiresIn = value.expires_in;

  return (
    isString(accessToken) &&
    isString(refreshToken) &&
    isString(tokenType) &&
    isNumber(expiresIn)
  );
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error occurred.";
};

const listStoredCredentials = (service: string): StoredCredential[] => {
  try {
    return findCredentials(service).map((credential) => ({
      account: credential.account,
      refreshToken: credential.password,
    }));
  } catch (error) {
    throw new Error(
      `Failed to access credentials in the system keyring: ${toErrorMessage(error)}`,
    );
  }
};

const getSupabaseUrl = (): URL => {
  const rawUrl = process.env.SUPABASE_URL;
  if (rawUrl === undefined || rawUrl.trim().length === 0) {
    throw new Error(
      "SUPABASE_URL is not set. Please configure the environment variable before continuing.",
    );
  }

  return new URL(rawUrl.trim());
};

const getSupabasePublishableKey = (): string => {
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (publishableKey !== undefined && publishableKey.trim().length > 0) {
    return publishableKey.trim();
  }

  const legacyAnonKey = process.env.SUPABASE_ANON_KEY;
  if (legacyAnonKey !== undefined && legacyAnonKey.trim().length > 0) {
    return legacyAnonKey.trim();
  }

  throw new Error(
    "SUPABASE_PUBLISHABLE_KEY is not set. Please configure the environment variable before continuing.",
  );
};

export const ensureSupabaseConfig = (): void => {
  void getSupabaseUrl();
  void getSupabasePublishableKey();
};

const getKeychainServiceName = (): string => {
  const override = process.env.LISTEE_CLI_KEYCHAIN_SERVICE;
  if (override !== undefined && override.trim().length > 0) {
    return override.trim();
  }

  return DEFAULT_SERVICE_NAME;
};

const readJson = async (response: Response): Promise<unknown> => {
  const raw = await response.text();
  if (raw.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse Supabase response: ${error.message}`);
    }
    throw new Error(
      "Failed to parse Supabase response due to an unknown error.",
    );
  }
};

const formatSupabaseError = (payload: unknown, status: number): string => {
  if (isSupabaseErrorPayload(payload)) {
    const { error, error_description: description, msg, message } = payload;
    const details = [error, description, msg, message]
      .filter(
        (part) =>
          part !== undefined && isString(part) && part.trim().length > 0,
      )
      .join(": ");

    if (details.length > 0) {
      return details;
    }
  }

  return `Supabase request failed with status ${status}`;
};

const buildSupabaseHeaders = (): Record<string, string> => {
  const publishableKey = getSupabasePublishableKey();
  return {
    "Content-Type": "application/json",
    apikey: publishableKey,
    Authorization: `Bearer ${publishableKey}`,
  };
};

const getFragmentParams = (fragment: string): URLSearchParams => {
  if (fragment.length === 0) {
    throw new Error("Confirmation URL does not include hash parameters.");
  }

  if (fragment.startsWith("#")) {
    return new URLSearchParams(fragment.slice(1));
  }

  return new URLSearchParams(fragment);
};

const decodeJwtPayload = (token: string): unknown => {
  const segments = token.split(".");
  if (segments.length < 2) {
    throw new Error("Malformed access token received.");
  }

  try {
    const payloadSegment = segments[1];
    const decoded = Buffer.from(payloadSegment, "base64url").toString("utf8");
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error(
      `Unable to decode access token payload: ${toErrorMessage(error)}`,
    );
  }
};

const extractEmailFromAccessToken = (token: string): string => {
  const payload = decodeJwtPayload(token);
  if (!isRecord(payload)) {
    throw new Error("Access token payload structure is invalid.");
  }

  const email = payload.email;
  if (!isString(email) || email.trim().length === 0) {
    throw new Error("Access token payload did not include an email.");
  }

  return email.trim();
};

const parseIntegerParam = (value: string | null, name: string): number => {
  if (value === null) {
    throw new Error(`Missing ${name} in confirmation URL.`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name} value in confirmation URL.`);
  }

  return parsed;
};

const parseSignupFromParams = (params: URLSearchParams): SignupRedirect => {
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const tokenType = params.get("token_type");
  const expiresInRaw = params.get("expires_in");
  const flowType = params.get("type");

  if (!isString(accessToken) || accessToken.length === 0) {
    throw new Error("Confirmation URL is missing access_token.");
  }
  if (!isString(refreshToken) || refreshToken.length === 0) {
    throw new Error("Confirmation URL is missing refresh_token.");
  }
  if (!isString(tokenType) || tokenType.length === 0) {
    throw new Error("Confirmation URL is missing token_type.");
  }
  if (flowType !== "signup") {
    throw new Error("Confirmation URL is not for a signup flow.");
  }

  const account = extractEmailFromAccessToken(accessToken);
  const expiresIn = parseIntegerParam(expiresInRaw, "expires_in");

  return {
    account,
    accessToken,
    refreshToken,
    tokenType,
    expiresIn,
  };
};

export const parseSignupFragment = (fragment: string): SignupRedirect => {
  const params = getFragmentParams(fragment);
  return parseSignupFromParams(params);
};

const storeRefreshToken = async (
  account: string,
  token: string,
): Promise<void> => {
  const service = getKeychainServiceName();
  const entry = new AsyncEntry(service, account);
  await entry.setPassword(token);
};

const findStoredCredential = async (
  preferredAccount?: string,
): Promise<StoredCredential | null> => {
  const service = getKeychainServiceName();

  if (preferredAccount !== undefined) {
    const entry = new AsyncEntry(service, preferredAccount);
    const refreshToken = await entry.getPassword();
    if (refreshToken === undefined || refreshToken === null) {
      return null;
    }
    return { account: preferredAccount, refreshToken };
  }

  const credentials = listStoredCredentials(service);
  if (credentials.length === 0) {
    return null;
  }

  return credentials[0];
};

const deleteAllStoredCredentials = async (): Promise<number> => {
  const service = getKeychainServiceName();
  const credentials = listStoredCredentials(service);

  let removed = 0;
  for (const credential of credentials) {
    const entry = new AsyncEntry(service, credential.account);
    const deleted = await entry.deleteCredential();
    if (deleted) {
      removed += 1;
    }
  }

  return removed;
};

const requestSupabase = async (
  path: string,
  body: Record<string, unknown>,
): Promise<Response> => {
  const url = new URL(path, getSupabaseUrl());
  return fetch(url, {
    method: "POST",
    headers: buildSupabaseHeaders(),
    body: JSON.stringify(body),
  });
};

export const signup = async (
  email: string,
  password: string,
  redirectUrl?: string,
): Promise<void> => {
  const path = redirectUrl === undefined
    ? "auth/v1/signup"
    : `auth/v1/signup?redirect_to=${encodeURIComponent(redirectUrl)}`;
  const response = await requestSupabase(path, { email, password });

  if (!response.ok) {
    const payload = await readJson(response);
    throw new Error(formatSupabaseError(payload, response.status));
  }
};

export const login = async (
  email: string,
  password: string,
): Promise<AccessTokenResult> => {
  const response = await requestSupabase("auth/v1/token?grant_type=password", {
    email,
    password,
  });

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(formatSupabaseError(payload, response.status));
  }

  if (!isSupabaseTokenResponse(payload)) {
    throw new Error("Unexpected response from Supabase during login.");
  }

  await storeRefreshToken(email, payload.refresh_token);

  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
    tokenType: payload.token_type,
  };
};

export const getAccessToken = async (
  email?: string,
): Promise<AccessTokenResult> => {
  const credential = await findStoredCredential(email);
  if (credential === null) {
    throw new Error("No stored refresh token found. Please log in first.");
  }

  const response = await requestSupabase(
    "auth/v1/token?grant_type=refresh_token",
    {
      refresh_token: credential.refreshToken,
    },
  );

  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(formatSupabaseError(payload, response.status));
  }

  if (!isSupabaseTokenResponse(payload)) {
    throw new Error(
      "Unexpected response from Supabase while refreshing the session.",
    );
  }

  await storeRefreshToken(credential.account, payload.refresh_token);

  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in,
    tokenType: payload.token_type,
  };
};

export const logout = async (): Promise<number> => {
  return deleteAllStoredCredentials();
};

export const status = async (): Promise<AuthStatus> => {
  const service = getKeychainServiceName();
  const credentials = listStoredCredentials(service);

  if (credentials.length === 0) {
    return { state: "logged_out" };
  }

  return {
    state: "logged_in",
    accounts: credentials.map((credential) => credential.account),
  };
};

export const completeSignupFromFragment = async (
  fragment: string,
): Promise<SignupRedirect> => {
  const result = parseSignupFragment(fragment);
  await storeRefreshToken(result.account, result.refreshToken);
  return result;
};
