import type { Command } from "commander";
import { getTask, listTasksByCategory } from "../services/task-api.js";

const execute = <T extends unknown[]>(task: (...args: T) => Promise<void>) => {
  return async (...args: T): Promise<void> => {
    try {
      await task(...args);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      } else {
        console.error("Unknown error occurred.");
      }
      process.exitCode = 1;
    }
  };
};

const printTasks = (
  items: readonly {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly isChecked: boolean;
  }[],
): void => {
  if (items.length === 0) {
    console.log("No tasks found.");
    return;
  }

  console.log("Tasks:");
  for (const item of items) {
    const status = item.isChecked ? "[x]" : "[ ]";
    const details = item.description === null ? "" : ` — ${item.description}`;
    console.log(` • ${status} ${item.name} (${item.id})${details}`);
  }
};

export const registerTaskCommand = (program: Command): void => {
  const tasks = program
    .command("tasks")
    .description("Inspect Listee tasks via the API.");

  tasks
    .command("list")
    .description("List tasks within a specific category.")
    .requiredOption(
      "--category <categoryId>",
      "Category identifier to list tasks for",
    )
    .option("--email <email>", "Account email to use when fetching tasks")
    .action(
      execute(
        async (options: {
          readonly category: string;
          readonly email?: string;
        }) => {
          const response = await listTasksByCategory({
            categoryId: options.category,
            email: options.email,
          });
          printTasks(response.data);
        },
      ),
    );

  tasks
    .command("show <taskId>")
    .description("Show details for a specific task.")
    .option("--email <email>", "Account email to use when fetching the task")
    .action(
      execute(async (taskId: string, options: { readonly email?: string }) => {
        const response = await getTask({ taskId, email: options.email });
        const task = response.data;
        const status = task.isChecked ? "[x]" : "[ ]";
        console.log(`Name: ${task.name}`);
        console.log(`ID: ${task.id}`);
        console.log(`Description: ${task.description ?? ""}`);
        console.log(`Status: ${status}`);
        console.log(`Category: ${task.categoryId}`);
        console.log(`Created By: ${task.createdBy}`);
        console.log(`Updated By: ${task.updatedBy}`);
        console.log(`Created At: ${task.createdAt}`);
        console.log(`Updated At: ${task.updatedAt}`);
      }),
    );
};
