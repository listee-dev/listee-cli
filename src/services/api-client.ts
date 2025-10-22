import { Buffer } from "node:buffer";
import { getAccessToken } from "./auth-service.js";

type JwtClaims = {
  readonly sub?: string;
  readonly email?: string;
};

type AuthenticatedContext = {
  readonly accessToken: string;
  readonly userId: string;
  readonly authorizationValue: string;
};

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const getEnvValue = (key: string): string => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim().length === 0) {
    throw new Error(
      `${key} is not set. Please configure the environment variable before continuing.`,
    );
  }
  return raw.trim();
};

const getApiBaseUrl = (): URL => {
  const rawUrl = getEnvValue("LISTEE_API_URL");
  return new URL(rawUrl);
};

const decodeJwtClaims = (token: string): JwtClaims => {
  const segments = token.split(".");
  if (segments.length < 2) {
    throw new Error("Access token is malformed.");
  }

  const payloadSegment = segments[1];
  try {
    const decoded = Buffer.from(payloadSegment, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (!isRecord(parsed)) {
      throw new Error("Access token payload is not an object.");
    }

    const subValue =
      typeof parsed.sub === "string" && parsed.sub.length > 0
        ? parsed.sub
        : undefined;
    const emailValue =
      typeof parsed.email === "string" && parsed.email.length > 0
        ? parsed.email
        : undefined;

    return {
      ...(subValue === undefined ? {} : { sub: subValue }),
      ...(emailValue === undefined ? {} : { email: emailValue }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Failed to decode access token payload: ${message}`);
  }
};

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Failed to parse API response: ${message}`);
  }
};

const getAuthorizationMode = (): "access-token" | "user-id" => {
  const raw = process.env.LISTEE_API_AUTH_BEARER_MODE;
  if (raw === undefined || raw.trim().length === 0) {
    return "user-id";
  }

  const value = raw.trim().toLowerCase();
  if (value === "access-token" || value === "user-id") {
    return value;
  }

  throw new Error(
    "LISTEE_API_AUTH_BEARER_MODE must be either 'access-token' or 'user-id'.",
  );
};

export const createAuthenticatedContext = async (
  email?: string,
): Promise<AuthenticatedContext> => {
  const tokenResult = await getAccessToken(email);
  const claims = decodeJwtClaims(tokenResult.accessToken);
  if (!isNonEmptyString(claims.sub)) {
    throw new Error("Access token does not include the user identifier.");
  }

  const mode = getAuthorizationMode();
  const authorizationValue =
    mode === "user-id" ? claims.sub : tokenResult.accessToken;

  return {
    accessToken: tokenResult.accessToken,
    userId: claims.sub,
    authorizationValue,
  };
};

const buildHeaders = (authorizationValue: string): HeadersInit => {
  return {
    Authorization: `Bearer ${authorizationValue}`,
    Accept: "application/json",
  };
};

const buildUrl = (path: string): URL => {
  if (!path.startsWith("/")) {
    throw new Error("API path must start with '/' .");
  }
  const base = getApiBaseUrl();
  const baseHref = base.href.endsWith("/") ? base.href : `${base.href}/`;
  const normalizedPath = path.replace(/^\//u, "");
  return new URL(normalizedPath, baseHref);
};

const extractErrorMessage = (payload: unknown, fallback: string): string => {
  if (!isRecord(payload)) {
    return fallback;
  }
  const error = payload.error;
  if (error === undefined) {
    return fallback;
  }
  return typeof error === "string" ? error : String(error);
};

export const requestJson = async (
  path: string,
  authorizationValue: string,
  init?: RequestInit,
): Promise<unknown> => {
  const url = buildUrl(path);
  const response = await fetch(url, {
    ...init,
    headers: {
      ...buildHeaders(authorizationValue),
      ...(init?.headers ?? {}),
    },
  });

  const payload = await readJson(response);
  if (!response.ok) {
    const message = extractErrorMessage(payload, `status ${response.status}`);
    throw new Error(`API request failed: ${message}`);
  }

  return payload;
};
