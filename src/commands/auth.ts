import type { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline";
import type { Command } from "commander";
import {
  completeSignupFromFragment,
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
  SignupRedirect,
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

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const handleError = (error: unknown): void => {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error("Unknown error occurred.");
  }
  process.exitCode = 1;
};

const LOOPBACK_HOST = "127.0.0.1";
const LOOPBACK_TIMEOUT_MS = 5 * 60 * 1000;

type LoopbackServer = {
  redirectUrl: string;
  waitForConfirmation: () => Promise<SignupRedirect>;
  shutdown: () => Promise<void>;
};

const callbackPage = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Completing Signup</title>
    <style>
      body { font-family: sans-serif; margin: 3rem; color: #111; }
    </style>
  </head>
  <body>
    <h1 id="headline">Completing signup...</h1>
    <p>This window is part of the Listee CLI signup flow and will update automatically.</p>
    <p id="details">You may close this window and return to your terminal once it finishes.</p>
    <script>
      (async () => {
        const headline = document.getElementById("headline");
        const details = document.getElementById("details");
        const response = await fetch("/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hash: window.location.hash })
        });
        try {
          const payload = await response.json();
          headline.textContent = payload.title ?? "Signup complete.";
          details.textContent = payload.message ?? "You may now return to your terminal.";
          if (!response.ok) {
            document.body.dataset.status = "error";
          }
        } catch (error) {
          headline.textContent = "Unable to complete signup.";
          details.textContent = String(error);
          document.body.dataset.status = "error";
        }
      })().catch((error) => {
        const headline = document.getElementById("headline");
        const details = document.getElementById("details");
        headline.textContent = "Unable to complete signup.";
        details.textContent = String(error);
        document.body.dataset.status = "error";
      });
    </script>
  </body>
</html>`;

const startLoopbackServer = async (): Promise<LoopbackServer> => {
  let resolveResult: ((value: SignupRedirect) => void) | undefined;
  let rejectResult: ((reason?: unknown) => void) | undefined;
  let settled = false;

  const server = createServer((req, res) => {
    const finish = (
      status: number,
      body: string,
      contentType = "text/html",
    ): void => {
      res.writeHead(status, { "Content-Type": contentType });
      res.end(body);
    };

    const respondWithJson = (
      status: number,
      payload: { title: string; message: string },
    ): void => {
      finish(status, JSON.stringify(payload), "application/json");
    };

    if (req.method === "GET" && req.url?.startsWith("/callback")) {
      finish(200, callbackPage);
      return;
    }

    if (req.method === "POST" && req.url === "/token") {
      let data = "";
      req.on("data", (chunk) => {
        data += chunk.toString();
      });
      req.on("end", async () => {
        if (settled) {
          respondWithJson(200, {
            title: "Signup already completed.",
            message: "You may close this window and return to your terminal.",
          });
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (!isRecord(parsed)) {
            throw new Error("Invalid request body received.");
          }
          const hash = parsed.hash;
          if (typeof hash !== "string" || hash.length === 0) {
            throw new Error("Missing hash in request body.");
          }
          const result = await completeSignupFromFragment(hash);
          settled = true;
          respondWithJson(200, {
            title: "Signup confirmed.",
            message: "You may close this window and return to your terminal.",
          });
          resolveResult?.(result);
        } catch (error) {
          respondWithJson(400, {
            title: "Failed to complete signup.",
            message: error instanceof Error ? error.message : String(error),
          });
          rejectResult?.(error);
        }
      });
      return;
    }

    finish(404, "Not Found", "text/plain");
  });

  const waitForConfirmation = new Promise<SignupRedirect>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  server.on("error", (error) => {
    if (!settled) {
      settled = true;
      rejectResult?.(error);
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, LOOPBACK_HOST, () => resolve());
  });

  const address = server.address();
  if (
    address === null ||
    typeof address !== "object" ||
    address.port === undefined
  ) {
    server.close();
    throw new Error("Failed to determine loopback server port.");
  }

  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true;
      rejectResult?.(new Error("Signup confirmation timed out."));
    }
    void (async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    })();
  }, LOOPBACK_TIMEOUT_MS);

  const shutdown = async (): Promise<void> => {
    clearTimeout(timeout);
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  };

  return {
    redirectUrl: `http://${LOOPBACK_HOST}:${address.port}/callback`,
    waitForConfirmation: () =>
      waitForConfirmation.finally(() => clearTimeout(timeout)),
    shutdown,
  };
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
        if (answer.length === 0) {
          reject(new Error("Password must not be empty."));
          return;
        }
        resolve(answer);
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
          const password = collected.join("");
          if (password.length === 0) {
            reject(new Error("Password must not be empty."));
            return;
          }
          resolve(password);
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
  await login(email, password);
  console.log("✅ Logged in.");
};

const signupAction = async (options: EmailOption): Promise<void> => {
  ensureSupabaseConfig();
  const email = ensureEmail(options.email);
  const password = await promptHiddenInput("Password: ");
  const loopback = await startLoopbackServer();

  const handleAbort = (): void => {
    void loopback.shutdown().finally(() => {
      console.log("\nSignup confirmation cancelled.");
      process.exit(1);
    });
  };

  process.once("SIGINT", handleAbort);
  process.once("SIGTERM", handleAbort);

  try {
    await signup(email, password, loopback.redirectUrl);
    console.log(
      "📩 Confirmation email sent. Keep this terminal open while you click the link.",
    );
    const result = await loopback.waitForConfirmation();
    console.log(`✅ Signup confirmed for ${result.account}.`);
  } finally {
    process.removeListener("SIGINT", handleAbort);
    process.removeListener("SIGTERM", handleAbort);
    await loopback.shutdown();
  }
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
