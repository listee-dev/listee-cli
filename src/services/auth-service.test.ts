import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Buffer } from "node:buffer";
import {
  type AccessTokenResult,
  ensureSupabaseConfig,
  parseSignupFragment,
  toAuthenticatedAccessTokenResult,
} from "./auth-service.js";

const ORIGINAL_ENV = { ...process.env };

const resetEnv = (): void => {
  process.env = { ...ORIGINAL_ENV };
};

beforeEach(resetEnv);
afterEach(resetEnv);

describe("ensureSupabaseConfig", () => {
  it("throws when SUPABASE_URL is missing", () => {
    delete process.env.SUPABASE_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = "pk_test";

    expect(() => {
      ensureSupabaseConfig();
    }).toThrow("SUPABASE_URL is not set");
  });

  it("throws when publishable key and legacy anon key are missing", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;

    expect(() => {
      ensureSupabaseConfig();
    }).toThrow("SUPABASE_PUBLISHABLE_KEY is not set");
  });

  it("does not throw when publishable key is set", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "pk_test";

    expect(() => ensureSupabaseConfig()).not.toThrow();
  });

  it("allows fallback to legacy anon key", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    process.env.SUPABASE_ANON_KEY = "anon_key";

    expect(() => ensureSupabaseConfig()).not.toThrow();
  });
});

// Dummy test to ensure AccessTokenResult type stays exported
it("allows constructing AccessTokenResult shape", () => {
  const sample: AccessTokenResult = {
    accessToken: "token",
    expiresIn: 3600,
    tokenType: "bearer",
  };
  expect(sample.tokenType).toBe("bearer");
});

describe("parseSignupFragment", () => {
  const encodeSegment = (value: string): string => {
    return Buffer.from(value, "utf8").toString("base64url");
  };

  const header = encodeSegment(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadSegment = (): string => {
    const currentEpoch = Math.floor(Date.now() / 1000);
    const payload = {
      sub: "user-id",
      email: "user@example.com",
      exp: currentEpoch + 3600,
      iat: currentEpoch,
    };
    return encodeSegment(JSON.stringify(payload));
  };
  const signature = encodeSegment("signature");

  it("parses tokens from a confirmation fragment", () => {
    const accessToken = `${header}.${payloadSegment()}.${signature}`;
    const fragment = `#access_token=${accessToken}&refresh_token=refresh123&expires_in=3600&token_type=bearer&type=signup`;
    const result = parseSignupFragment(fragment);

    expect(result.account).toBe("user@example.com");
    expect(result.refreshToken).toBe("refresh123");
    expect(result.expiresIn).toBe(3600);
  });

  it("throws when fragment is missing required parameters", () => {
    const fragment = "#token_type=bearer";

    expect(() => {
      parseSignupFragment(fragment);
    }).toThrow("Confirmation URL is missing access_token.");
  });
});

describe("toAuthenticatedAccessTokenResult", () => {
  const encodeSegment = (value: unknown): string => {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  };

  const header = encodeSegment({ alg: "ES256", typ: "JWT" });

  const buildToken = (payload: Record<string, unknown>): string => {
    const payloadSegment = encodeSegment(payload);
    const signature = encodeSegment({ sig: "signature" });
    return `${header}.${payloadSegment}.${signature}`;
  };

  it("returns enriched access token details when payload is valid", () => {
    const epoch = Math.floor(Date.now() / 1000);
    const payload = {
      sub: "user-123",
      email: "user@example.com",
      iss: "https://example.supabase.co/auth/v1",
      aud: "authenticated",
      role: "authenticated",
      exp: epoch + 3600,
      iat: epoch,
    };
    const accessToken = buildToken(payload);
    const input: AccessTokenResult = {
      accessToken,
      expiresIn: 3600,
      tokenType: "bearer",
    };

    const result = toAuthenticatedAccessTokenResult(input);

    expect(result.userId).toBe("user-123");
    expect(result.token.email).toBe("user@example.com");
    expect(result.accessToken).toBe(accessToken);
  });

  it("throws when the JWT payload is missing required subject", () => {
    const epoch = Math.floor(Date.now() / 1000);
    const payload = {
      email: "user@example.com",
      iss: "https://example.supabase.co/auth/v1",
      aud: "authenticated",
      role: "authenticated",
      exp: epoch + 3600,
      iat: epoch,
    };
    const accessToken = buildToken(payload);
    const input: AccessTokenResult = {
      accessToken,
      expiresIn: 3600,
      tokenType: "bearer",
    };

    expect(() => {
      toAuthenticatedAccessTokenResult(input);
    }).toThrow("Access token payload structure is invalid.");
  });
});
