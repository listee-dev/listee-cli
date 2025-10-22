import type { Command } from "commander";
import { getCategory, listCategories } from "../services/category-api.js";

const ensurePositiveInteger = (value: string): number => {
  if (!/^\d+$/.test(value)) {
    throw new Error("Limit must be a positive integer.");
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Limit must be a positive integer.");
  }
  return parsed;
};

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

const printCategories = (
  items: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind: string;
  }[],
): void => {
  if (items.length === 0) {
    console.log("No categories found.");
    return;
  }

  console.log("Categories:");
  for (const item of items) {
    console.log(` • ${item.name} (${item.id}) [${item.kind}]`);
  }
};

export const registerCategoryCommand = (program: Command): void => {
  const categories = program
    .command("categories")
    .description("Inspect Listee categories via the API.");

  categories
    .command("list")
    .description("List categories for the authenticated user.")
    .option("--email <email>", "Account email to use when fetching categories")
    .option("--limit <limit>", "Maximum number of categories to fetch")
    .option("--cursor <cursor>", "Cursor returned by a previous list operation")
    .action(
      execute(
        async (options: {
          readonly email?: string;
          readonly limit?: string;
          readonly cursor?: string;
        }) => {
          const limit =
            options.limit === undefined
              ? undefined
              : ensurePositiveInteger(options.limit);
          const result = await listCategories({
            email: options.email,
            limit,
            cursor: options.cursor ?? null,
          });
          printCategories(result.data);
          if (result.meta.hasMore) {
            const cursorValue = result.meta.nextCursor ?? "";
            console.log(
              "More categories available. Use --cursor",
              cursorValue,
              "to continue.",
            );
          }
        },
      ),
    );

  categories
    .command("show <categoryId>")
    .description("Show details for a specific category.")
    .option(
      "--email <email>",
      "Account email to use when fetching the category",
    )
    .action(
      execute(
        async (categoryId: string, options: { readonly email?: string }) => {
          const response = await getCategory({
            email: options.email,
            categoryId,
          });
          const category = response.data;
          console.log(`Name: ${category.name}`);
          console.log(`ID: ${category.id}`);
          console.log(`Kind: ${category.kind}`);
          console.log(`Created By: ${category.createdBy}`);
          console.log(`Updated By: ${category.updatedBy}`);
          console.log(`Created At: ${category.createdAt}`);
          console.log(`Updated At: ${category.updatedAt}`);
        },
      ),
    );
};
