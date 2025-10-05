import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type AccessTokenResult, ensureSupabaseConfig } from "./authService.js";

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
