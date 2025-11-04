import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

type EnvIssue = {
  readonly path: readonly (string | number)[];
  readonly message: string;
};

export class EnvValidationError extends Error {
  readonly issues: EnvIssue[];

  constructor(issues: EnvIssue[]) {
    super("Invalid environment variables");
    this.issues = issues;
  }
}

const urlString = z.url();
const nonEmptyString = z
  .string()
  .min(1)
  .refine((value) => value === value.trim(), {
    message: "Value must not include leading or trailing whitespace.",
  });
const optionalNonEmptyString = nonEmptyString.optional();

const buildEnv = () => {
  return createEnv({
    server: {
      SUPABASE_URL: urlString,
      SUPABASE_PUBLISHABLE_KEY: nonEmptyString,
      LISTEE_API_URL: urlString,
      LISTEE_CLI_KEYCHAIN_SERVICE: optionalNonEmptyString,
    },
    runtimeEnv: process.env,
    emptyStringAsUndefined: true,
    onValidationError: (issues: ReadonlyArray<unknown>): never => {
      const normalizedIssues: EnvIssue[] = issues.map((issue) => {
        if (
          typeof issue === "object" &&
          issue !== null &&
          "message" in issue &&
          typeof issue.message === "string"
        ) {
          const pathValue =
            "path" in issue &&
            Array.isArray(issue.path) &&
            issue.path.every(
              (segment) =>
                typeof segment === "string" || typeof segment === "number",
            )
              ? [...issue.path]
              : [];
          return {
            path: pathValue,
            message: issue.message,
          } satisfies EnvIssue;
        }
        return {
          path: [],
          message: "Unknown environment validation error",
        } satisfies EnvIssue;
      });
      throw new EnvValidationError(normalizedIssues);
    },
  });
};

type Env = ReturnType<typeof buildEnv>;

let cachedEnv: Env | null = null;

const loadEnv = (): Env => {
  if (cachedEnv === null) {
    cachedEnv = buildEnv();
  }
  return cachedEnv;
};

export const getEnv = (): Env => {
  return loadEnv();
};

export const resetEnvCache = (): void => {
  cachedEnv = null;
};

const describeIssue = (issue: EnvIssue): string => {
  const path = issue.path.join(".");

  if (path === "SUPABASE_URL") {
    return "SUPABASE_URL is not set. Please configure the environment variable before continuing.";
  }

  if (path === "SUPABASE_PUBLISHABLE_KEY") {
    return "SUPABASE_PUBLISHABLE_KEY is not set. Please configure the environment variable before continuing.";
  }

  if (path === "LISTEE_API_URL") {
    return "LISTEE_API_URL is not set. Please configure the environment variable before continuing.";
  }

  return issue.message;
};

export const checkEnv = (): void => {
  try {
    void getEnv();
  } catch (error) {
    if (error instanceof EnvValidationError) {
      const firstIssue = error.issues[0];
      const message =
        firstIssue !== undefined
          ? describeIssue(firstIssue)
          : "Invalid environment variables";
      throw new Error(message);
    }
    throw error;
  }
};
