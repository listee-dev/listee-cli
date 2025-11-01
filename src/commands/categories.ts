import type { Command } from "commander";
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from "../services/category-api.js";

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

const ensureNonEmptyString = (value: string, label: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
  return trimmed;
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

const printCategoryDetails = (category: {
  readonly name: string;
  readonly id: string;
  readonly kind: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}): void => {
  console.log(`Name: ${category.name}`);
  console.log(`ID: ${category.id}`);
  console.log(`Kind: ${category.kind}`);
  console.log(`Created By: ${category.createdBy}`);
  console.log(`Updated By: ${category.updatedBy}`);
  console.log(`Created At: ${category.createdAt}`);
  console.log(`Updated At: ${category.updatedAt}`);
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
          printCategoryDetails(response.data);
        },
      ),
    );

  categories
    .command("create")
    .description("Create a new category for the authenticated user.")
    .requiredOption("--name <name>", "Name of the category to create")
    .option(
      "--email <email>",
      "Account email to use when creating the category",
    )
    .action(
      execute(
        async (options: { readonly name: string; readonly email?: string }) => {
          const name = ensureNonEmptyString(options.name, "Name");
          const category = await createCategory({
            email: options.email,
            name,
          });
          console.log("Category created.");
          printCategoryDetails(category);
        },
      ),
    );

  categories
    .command("update <categoryId>")
    .description("Update an existing category for the authenticated user.")
    .requiredOption("--name <name>", "New name for the category")
    .option(
      "--email <email>",
      "Account email to use when updating the category",
    )
    .action(
      execute(
        async (
          categoryId: string,
          options: {
            readonly name: string;
            readonly email?: string;
          },
        ) => {
          const id = ensureNonEmptyString(categoryId, "Category ID");
          const name = ensureNonEmptyString(options.name, "Name");

          const category = await updateCategory({
            categoryId: id,
            name,
            email: options.email,
          });
          console.log("Category updated.");
          printCategoryDetails(category);
        },
      ),
    );

  categories
    .command("delete <categoryId>")
    .description("Delete a category for the authenticated user.")
    .option(
      "--email <email>",
      "Account email to use when deleting the category",
    )
    .action(
      execute(
        async (categoryId: string, options: { readonly email?: string }) => {
          const id = ensureNonEmptyString(categoryId, "Category ID");
          await deleteCategory({ categoryId: id, email: options.email });
          console.log("Category deleted.");
        },
      ),
    );
};
