import { getAuthenticatedAccessToken } from "./auth-service.js";

type AuthenticatedContext = {
  readonly accessToken: string;
  readonly userId: string;
  readonly authorizationValue: string;
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

type ParsedPayload =
  | { type: "json"; body: unknown }
  | { type: "text"; body: string }
  | { type: "empty"; body: null };

const readPayload = async (response: Response): Promise<ParsedPayload> => {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (text.trim().length === 0) {
    return { type: "empty", body: null };
  }

  if (contentType.toLowerCase().includes("application/json")) {
    try {
      return { type: "json", body: JSON.parse(text) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      throw new Error(`Failed to parse API response as JSON: ${message}`);
    }
  }

  return { type: "text", body: text };
};

export const createAuthenticatedContext = async (
  email?: string,
): Promise<AuthenticatedContext> => {
  const tokenResult = await getAuthenticatedAccessToken(email);
  const accessToken = tokenResult.accessToken;
  const userId = tokenResult.userId;

  return {
    accessToken,
    userId,
    authorizationValue: accessToken,
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

const extractErrorMessage = (
  payload: ParsedPayload,
  fallback: string,
): string => {
  if (payload.type === "json") {
    const body = payload.body;
    if (isRecord(body)) {
      const error = body.error;
      if (error !== undefined) {
        return typeof error === "string" ? error : String(error);
      }
    }
    return fallback;
  }

  if (payload.type === "text") {
    const snippet =
      payload.body.length > 200
        ? `${payload.body.slice(0, 200)}…`
        : payload.body;
    return `${fallback}; raw response: ${snippet}`;
  }

  return fallback;
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

  const payload = await readPayload(response);
  if (!response.ok) {
    const message = extractErrorMessage(payload, `status ${response.status}`);
    throw new Error(`API request failed: ${message}`);
  }

  if (payload.type !== "json") {
    throw new Error(
      `API request failed: Expected JSON response but received ${payload.type}`,
    );
  }

  return payload.body;
};
