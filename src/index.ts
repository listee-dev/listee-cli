import { Command } from "commander";
import { registerAuthCommand } from "./commands/auth.js";
import { registerCategoryCommand } from "./commands/categories.js";
import { registerTaskCommand } from "./commands/tasks.js";
import { checkEnv } from "./env.js";

checkEnv();

const program = new Command();

program
  .name("listee")
  .description(
    "Official CLI for Listee: manage authentication, categories, and tasks.",
  )
  .version("0.0.1");

registerAuthCommand(program);
registerCategoryCommand(program);
registerTaskCommand(program);

const main = async (): Promise<void> => {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("Unknown error occurred.");
    }
    process.exitCode = 1;
  }
};

void main();
