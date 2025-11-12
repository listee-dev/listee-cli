import { Buffer } from "node:buffer";
import {
  type AccountProvisioner,
  createAccountProvisioner,
} from "@listee/auth";
import { AsyncEntry, findCredentials } from "@napi-rs/keyring";
import { checkEnv, getEnv } from "../env.js";
import type {
  AccessTokenResult,
  AuthStatus,
  AuthTokenClaims,
  AuthTokenResponse,
  SignupRedirect,
  StoredCredential,
} from "../types/auth.js";
import {
  buildListeeApiUrl,
  extractApiErrorMessage,
  readApiPayload,
} from "./api-base.js";

const DEFAULT_SERVICE_NAME = "listee-cli";
let cachedAccountProvisioner: AccountProvisioner | null = null;

const getAccountProvisioner = (): AccountProvisioner => {
  if (cachedAccountProvisioner === null) {
    cachedAccountProvisioner = createAccountProvisioner();
  }
  return cachedAccountProvisioner;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isString = (value: unknown): value is string => {
  return typeof value === "string";
};

const isNumber = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value);
};

const isAuthTokenResponse = (value: unknown): value is AuthTokenResponse => {
  if (!isRecord(value)) {
    return false;
  }

  const accessToken = value.accessToken;
  const refreshToken = value.refreshToken;
  const tokenType = value.tokenType;
  const expiresIn = value.expiresIn;

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

export const ensureListeeApiConfig = (): void => {
  checkEnv();
  void getEnv().LISTEE_API_URL;
};

const getKeychainServiceName = (): string => {
  const env = getEnv();
  return env.LISTEE_CLI_KEYCHAIN_SERVICE ?? DEFAULT_SERVICE_NAME;
};

type AuthRequestBody = Record<string, unknown>;

const requestAuthJson = async (
  path: string,
  body: AuthRequestBody,
): Promise<unknown> => {
  const url = buildListeeApiUrl(path);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await readApiPayload(response);
  if (response.ok) {
    if (payload.type === "json") {
      return payload.body;
    }
    if (payload.type === "empty") {
      return null;
    }
    throw new Error(
      `Listee API auth request expected JSON or empty response but received ${payload.type}`,
    );
  }

  const message = extractApiErrorMessage(payload, `status ${response.status}`);
  throw new Error(`Listee API auth request failed: ${message}`);
};

const toAuthTokenResponse = (payload: unknown): AuthTokenResponse => {
  if (isAuthTokenResponse(payload)) {
    return payload;
  }

  if (
    isRecord(payload) &&
    "data" in payload &&
    isAuthTokenResponse((payload as { data: unknown }).data)
  ) {
    return (payload as { data: AuthTokenResponse }).data;
  }

  throw new Error("Listee API auth response did not include token details.");
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

const isAuthTokenPayload = (payload: unknown): payload is AuthTokenClaims => {
  if (!isRecord(payload)) {
    return false;
  }

  const subValue = "sub" in payload ? payload.sub : undefined;
  const emailValue = "email" in payload ? payload.email : undefined;
  const expValue = "exp" in payload ? payload.exp : undefined;
  const iatValue = "iat" in payload ? payload.iat : undefined;

  if (
    !isString(subValue) ||
    subValue.trim().length === 0 ||
    !isString(emailValue) ||
    emailValue.trim().length === 0 ||
    !isNumber(expValue) ||
    expValue <= 0 ||
    !isNumber(iatValue) ||
    iatValue <= 0
  ) {
    return false;
  }

  const currentEpochSeconds = Math.floor(Date.now() / 1000);
  if (expValue <= currentEpochSeconds) {
    return false;
  }

  return true;
};

const decodeAuthToken = (token: string): AuthTokenClaims => {
  const payload = decodeJwtPayload(token);
  if (!isAuthTokenPayload(payload)) {
    throw new Error("Access token payload structure is invalid.");
  }

  return payload;
};

const extractSubjectFromTokenPayload = (payload: AuthTokenClaims): string => {
  const subjectValue = payload.sub;
  if (!isString(subjectValue) || subjectValue.trim().length === 0) {
    throw new Error("Access token payload did not include a user id.");
  }

  return subjectValue.trim();
};

const extractEmailFromAccessToken = (token: string): string => {
  const payload = decodeAuthToken(token);
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

export const signup = async (
  email: string,
  password: string,
  redirectUrl?: string,
): Promise<void> => {
  const requestBody: AuthRequestBody = {
    email,
    password,
  };
  if (redirectUrl !== undefined) {
    requestBody.redirectUrl = redirectUrl;
  }
  await requestAuthJson("/auth/signup", requestBody);
};

export const login = async (
  email: string,
  password: string,
): Promise<AccessTokenResult> => {
  const payload = await requestAuthJson("/auth/login", {
    email,
    password,
  });
  const tokenResponse = toAuthTokenResponse(payload);

  await storeRefreshToken(email, tokenResponse.refreshToken);

  return {
    accessToken: tokenResponse.accessToken,
    expiresIn: tokenResponse.expiresIn,
    tokenType: tokenResponse.tokenType,
  };
};

export const getAccessToken = async (
  email?: string,
): Promise<AccessTokenResult> => {
  const credential = await findStoredCredential(email);
  if (credential === null) {
    throw new Error("No stored refresh token found. Please log in first.");
  }

  const payload = await requestAuthJson("/auth/token", {
    refreshToken: credential.refreshToken,
  });
  const tokenResponse = toAuthTokenResponse(payload);

  await storeRefreshToken(credential.account, tokenResponse.refreshToken);

  return {
    accessToken: tokenResponse.accessToken,
    expiresIn: tokenResponse.expiresIn,
    tokenType: tokenResponse.tokenType,
  };
};

export type AuthenticatedAccessTokenResult = AccessTokenResult & {
  userId: string;
  token: AuthTokenClaims;
};

export const toAuthenticatedAccessTokenResult = (
  tokenResult: AccessTokenResult,
): AuthenticatedAccessTokenResult => {
  const accessToken = tokenResult.accessToken.trim();
  if (accessToken.length === 0) {
    throw new Error("Access token is empty.");
  }

  const token = decodeAuthToken(accessToken);
  const userId = extractSubjectFromTokenPayload(token);

  return {
    ...tokenResult,
    accessToken,
    userId,
    token,
  };
};

export const getAuthenticatedAccessToken = async (
  email?: string,
): Promise<AuthenticatedAccessTokenResult> => {
  const tokenResult = await getAccessToken(email);
  return toAuthenticatedAccessTokenResult(tokenResult);
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
  await provisionSignupAccount(result);
  await storeRefreshToken(result.account, result.refreshToken);
  return result;
};

const provisionSignupAccount = async (
  result: SignupRedirect,
): Promise<void> => {
  const tokenPayload = decodeAuthToken(result.accessToken);
  const userId = extractSubjectFromTokenPayload(tokenPayload);
  const provisioner = getAccountProvisioner();

  try {
    await provisioner.provision({
      userId,
      token: tokenPayload,
      email: result.account,
    });
  } catch (error) {
    const message = toErrorMessage(error);
    console.error(
      `Account provisioning failed for ${result.account}: ${message}`,
    );
    throw new Error(`Account provisioning failed: ${message}`);
  }
};
