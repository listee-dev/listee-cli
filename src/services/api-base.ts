import { EnvValidationError, getEnv } from "../env.js";

type ParsedPayloadJson = { type: "json"; body: unknown };
type ParsedPayloadText = { type: "text"; body: string };
type ParsedPayloadEmpty = { type: "empty"; body: null };

export type ParsedPayload =
  | ParsedPayloadJson
  | ParsedPayloadText
  | ParsedPayloadEmpty;

export const getListeeApiBaseUrl = (): URL => {
  try {
    const env = getEnv();
    return new URL(env.LISTEE_API_URL);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      const listeeApiIssue = error.issues.find((issue) => {
        return issue.path.join(".") === "LISTEE_API_URL";
      });
      if (listeeApiIssue !== undefined) {
        const message = listeeApiIssue.message.includes(
          "expected string, received undefined",
        )
          ? "LISTEE_API_URL is not set. Please configure the environment variable before continuing."
          : listeeApiIssue.message;
        throw new Error(message);
      }
    }
    throw error;
  }
};

export const buildListeeApiUrl = (path: string): URL => {
  if (!path.startsWith("/")) {
    throw new Error("API path must start with '/'.");
  }
  const base = getListeeApiBaseUrl();
  const baseHref = base.href.endsWith("/") ? base.href : `${base.href}/`;
  const normalizedPath = path.replace(/^\//u, "");
  return new URL(normalizedPath, baseHref);
};

export const readApiPayload = async (
  response: Response,
): Promise<ParsedPayload> => {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (text.trim().length === 0) {
    return { type: "empty", body: null } satisfies ParsedPayload;
  }

  if (contentType.toLowerCase().includes("application/json")) {
    try {
      const parsed = JSON.parse(text);
      return { type: "json", body: parsed } satisfies ParsedPayload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      throw new Error(`Failed to parse API response as JSON: ${message}`);
    }
  }

  return { type: "text", body: text } satisfies ParsedPayload;
};

export const extractApiErrorMessage = (
  payload: ParsedPayload,
  fallback: string,
): string => {
  if (payload.type === "json") {
    const body = payload.body;
    if (typeof body === "object" && body !== null) {
      const error = (body as { error?: unknown }).error;
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
