import type { Category as CategoryDb } from "@listee/types";
import { createAuthenticatedContext, requestJson } from "./api-client.js";

export type Category = Omit<CategoryDb, "createdAt" | "updatedAt"> & {
  readonly createdAt: string;
  readonly updatedAt: string;
};

type ListCategoriesResponse = {
  readonly data: readonly Category[];
  readonly meta: {
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  };
};

type CategoryDetailResponse = {
  readonly data: Category;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isCategory = (value: unknown): value is Category => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.kind === "string" &&
    typeof value.createdBy === "string" &&
    typeof value.updatedBy === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
};

const toCategory = (value: unknown): Category => {
  if (!isCategory(value)) {
    throw new Error("API response did not include valid category data.");
  }
  return {
    id: value.id,
    name: value.name,
    kind: value.kind,
    createdBy: value.createdBy,
    updatedBy: value.updatedBy,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

const toCategoryArray = (values: unknown): readonly Category[] => {
  if (!Array.isArray(values)) {
    throw new Error("API response did not include a category list.");
  }
  return values.map((value) => toCategory(value));
};

const toListResponse = (payload: unknown): ListCategoriesResponse => {
  if (!isRecord(payload)) {
    throw new Error("Invalid list categories response.");
  }

  const data = toCategoryArray(payload.data);
  const metaValue = payload.meta;
  if (!isRecord(metaValue)) {
    throw new Error("List categories response is missing pagination metadata.");
  }

  const nextCursorValue =
    metaValue.nextCursor === null || typeof metaValue.nextCursor === "string"
      ? metaValue.nextCursor
      : undefined;
  if (metaValue.hasMore !== true && metaValue.hasMore !== false) {
    throw new Error("List categories response has invalid hasMore flag.");
  }

  if (nextCursorValue === undefined) {
    throw new Error("List categories response has invalid cursor value.");
  }

  return {
    data,
    meta: {
      nextCursor: nextCursorValue,
      hasMore: metaValue.hasMore,
    },
  };
};

const toCategoryDetail = (payload: unknown): CategoryDetailResponse => {
  if (!isRecord(payload)) {
    throw new Error("Invalid category detail response.");
  }
  return {
    data: toCategory(payload.data),
  };
};

export type ListCategoriesParams = {
  readonly email?: string;
  readonly limit?: number;
  readonly cursor?: string | null;
};

export type ListCategoriesResult = ListCategoriesResponse;

export const listCategories = async (
  params: ListCategoriesParams = {},
): Promise<ListCategoriesResult> => {
  const context = await createAuthenticatedContext(params.email);
  const searchParams = new URLSearchParams();
  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit));
  }
  if (params.cursor !== undefined && params.cursor !== null) {
    searchParams.set("cursor", params.cursor);
  }
  const query = searchParams.toString();
  const pathBase = `/users/${encodeURIComponent(context.userId)}/categories`;
  const path = query.length === 0 ? pathBase : `${pathBase}?${query}`;
  const payload = await requestJson(path, context.authorizationValue);
  return toListResponse(payload);
};

export type GetCategoryParams = {
  readonly email?: string;
  readonly categoryId: string;
};

export const getCategory = async (
  params: GetCategoryParams,
): Promise<CategoryDetailResponse> => {
  const context = await createAuthenticatedContext(params.email);
  const path = `/categories/${encodeURIComponent(params.categoryId)}`;
  const payload = await requestJson(path, context.authorizationValue);
  return toCategoryDetail(payload);
};
