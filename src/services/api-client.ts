import {
  buildListeeApiUrl,
  extractApiErrorMessage,
  readApiPayload,
} from "./api-base.js";
import { getAuthenticatedAccessToken } from "./auth-service.js";

type AuthenticatedContext = {
  readonly accessToken: string;
  readonly userId: string;
  readonly authorizationValue: string;
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
  return buildListeeApiUrl(path);
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

  const payload = await readApiPayload(response);
  if (!response.ok) {
    const message = extractApiErrorMessage(
      payload,
      `status ${response.status}`,
    );
    throw new Error(`API request failed: ${message}`);
  }

  if (payload.type !== "json") {
    throw new Error(
      `API request failed: Expected JSON response but received ${payload.type}`,
    );
  }

  return payload.body;
};
