import type { Command } from "commander";
import {
  createTask,
  deleteTask,
  getTask,
  listTasksByCategory,
  updateTask,
} from "../services/task-api.js";

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

const ensureNonEmptyString = (value: string, label: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  return trimmed;
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

const printTaskDetails = (task: {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly isChecked: boolean;
  readonly categoryId: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}): void => {
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
        printTaskDetails(response.data);
      }),
    );

  tasks
    .command("create")
    .description("Create a new task within a category.")
    .requiredOption(
      "--category <categoryId>",
      "Category identifier to attach the new task to",
    )
    .requiredOption("--name <name>", "Name of the task to create")
    .option("--description <description>", "Optional description for the task")
    .option("--checked", "Mark the task as checked upon creation")
    .option("--email <email>", "Account email to use when creating the task")
    .action(
      execute(
        async (options: {
          readonly category: string;
          readonly name: string;
          readonly description?: string;
          readonly checked?: boolean;
          readonly email?: string;
        }) => {
          const categoryId = ensureNonEmptyString(options.category, "Category");
          const name = ensureNonEmptyString(options.name, "Name");
          const description =
            options.description === undefined
              ? undefined
              : options.description.trim();
          const task = await createTask({
            categoryId,
            name,
            description,
            isChecked: options.checked === true ? true : undefined,
            email: options.email,
          });
          console.log("Task created.");
          printTaskDetails(task);
        },
      ),
    );

  tasks
    .command("update <taskId>")
    .description("Update an existing task.")
    .option("--name <name>", "New name for the task")
    .option("--description <description>", "New description for the task")
    .option("--clear-description", "Remove the task description")
    .option("--checked", "Mark the task as checked")
    .option("--unchecked", "Mark the task as unchecked")
    .option("--email <email>", "Account email to use when updating the task")
    .action(
      execute(
        async (
          taskId: string,
          options: {
            readonly name?: string;
            readonly description?: string;
            readonly clearDescription?: boolean;
            readonly checked?: boolean;
            readonly unchecked?: boolean;
            readonly email?: string;
          },
        ) => {
          const id = ensureNonEmptyString(taskId, "Task ID");
          const name =
            options.name === undefined
              ? undefined
              : ensureNonEmptyString(options.name, "Name");

          if (options.checked === true && options.unchecked === true) {
            throw new Error(
              "--checked and --unchecked cannot be used together.",
            );
          }

          if (
            options.clearDescription === true &&
            options.description !== undefined
          ) {
            throw new Error(
              "--description cannot be combined with --clear-description.",
            );
          }

          const description =
            options.clearDescription === true
              ? null
              : options.description === undefined
                ? undefined
                : options.description.trim();
          const isChecked =
            options.checked === true
              ? true
              : options.unchecked === true
                ? false
                : undefined;

          if (
            name === undefined &&
            description === undefined &&
            isChecked === undefined
          ) {
            throw new Error(
              "Provide at least one update option (--name, --description, --clear-description, --checked, --unchecked).",
            );
          }

          const task = await updateTask({
            taskId: id,
            name,
            description,
            isChecked,
            email: options.email,
          });
          console.log("Task updated.");
          printTaskDetails(task);
        },
      ),
    );

  tasks
    .command("delete <taskId>")
    .description("Delete a task.")
    .option("--email <email>", "Account email to use when deleting the task")
    .action(
      execute(async (taskId: string, options: { readonly email?: string }) => {
        const id = ensureNonEmptyString(taskId, "Task ID");
        await deleteTask({ taskId: id, email: options.email });
        console.log("Task deleted.");
      }),
    );
};
