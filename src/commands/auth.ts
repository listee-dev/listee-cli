import type { Buffer } from "node:buffer";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline";
import type { Command } from "commander";
import {
  ensureSupabaseConfig,
  login,
  logout,
  signup,
  status,
} from "../services/auth-service.js";
import type {
  AuthStatus,
  EmailOption,
  RawModeCapableInput,
} from "../types/auth.js";

const ensureNonEmpty = (value: string, label: string): string => {
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  return value.trim();
};

const ensureEmail = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new Error("Email is required.");
  }

  return ensureNonEmpty(value, "Email");
};

const handleError = (error: unknown): void => {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error("Unknown error occurred.");
  }
  process.exitCode = 1;
};

const isRawModeCapable = (
  stream: typeof input,
): stream is RawModeCapableInput => {
  return typeof stream.setRawMode === "function";
};

const promptHiddenInput = (promptText: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input, output, terminal: true });

    if (!input.isTTY || !output.isTTY) {
      rl.question(promptText, (answer) => {
        rl.close();
        resolve(ensureNonEmpty(answer, "Password"));
      });
      return;
    }

    const collected: string[] = [];

    const cleanup = (): void => {
      input.off("data", handleData);
      rl.close();
      if (isRawModeCapable(input)) {
        input.setRawMode(false);
      }
      input.pause();
    };

    const cancel = (): void => {
      cleanup();
      output.write("\n");
      reject(new Error("Input cancelled by user."));
    };

    const handleData = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      for (const char of Array.from(text)) {
        if (char === "\u0003" || char === "\u0004") {
          cancel();
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          output.write("\n");
          resolve(ensureNonEmpty(collected.join(""), "Password"));
          return;
        }
        if (char === "\u007f") {
          if (collected.length > 0) {
            collected.pop();
            output.clearLine(0);
            output.cursorTo(0);
            output.write(`${promptText}${"*".repeat(collected.length)}`);
          }
          continue;
        }

        collected.push(char);
        output.clearLine(0);
        output.cursorTo(0);
        output.write(`${promptText}${"*".repeat(collected.length)}`);
      }
    };

    if (isRawModeCapable(input)) {
      input.setRawMode(true);
    }

    input.resume();
    input.on("data", handleData);
    rl.on("SIGINT", cancel);

    output.write(promptText);
  });
};

const execute = <T extends unknown[]>(task: (...args: T) => Promise<void>) => {
  return async (...args: T): Promise<void> => {
    try {
      await task(...args);
    } catch (error) {
      handleError(error);
    }
  };
};

const printStatus = (result: AuthStatus): void => {
  if (result.state === "logged_out") {
    console.log("Not logged in. Run `listee auth login` to authenticate.");
    return;
  }

  if (result.accounts.length === 0) {
    console.log("No accounts found in keychain.");
    return;
  }

  console.log("Logged-in accounts:");
  for (const account of result.accounts) {
    console.log(` • ${account}`);
  }
};

const loginAction = async (options: EmailOption): Promise<void> => {
  ensureSupabaseConfig();
  const email = ensureEmail(options.email);
  const password = await promptHiddenInput("Password: ");
  const _token = await login(email, password);
  console.log("✅ Logged in.");
};

const signupAction = async (options: EmailOption): Promise<void> => {
  ensureSupabaseConfig();
  const email = ensureEmail(options.email);
  const password = await promptHiddenInput("Password: ");
  await signup(email, password);
  console.log("📩 Confirmation email sent.");
};

const logoutAction = async (): Promise<void> => {
  const removed = await logout();
  if (removed === 0) {
    console.log("No stored session tokens were found.");
  } else {
    console.log(`Logged out of ${removed} account(s).`);
  }
};

const statusAction = async (): Promise<void> => {
  const currentStatus = await status();
  printStatus(currentStatus);
};

export const registerAuthCommand = (program: Command): void => {
  const auth = program
    .command("auth")
    .description("Manage Supabase authentication for Listee.");

  auth
    .command("signup")
    .description(
      "Sign up for a new Listee account via Supabase email/password.",
    )
    .requiredOption("--email <email>", "Email address to register")
    .action(
      execute(async (options: EmailOption) => {
        await signupAction(options);
      }),
    );

  auth
    .command("login")
    .description(
      "Authenticate with Supabase using email/password and store refresh token in keychain.",
    )
    .requiredOption("--email <email>", "Email address to log in")
    .action(
      execute(async (options: EmailOption) => {
        await loginAction(options);
      }),
    );

  auth
    .command("status")
    .description("Show stored authentication status from the keychain.")
    .action(
      execute(async () => {
        await statusAction();
      }),
    );

  auth
    .command("logout")
    .description("Remove stored refresh tokens from the keychain.")
    .action(
      execute(async () => {
        await logoutAction();
      }),
    );
};
