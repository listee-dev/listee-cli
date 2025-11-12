import type { Task as TaskDb } from "@listee/types";
import { createAuthenticatedContext, requestJson } from "./api-client.js";

export type Task = Omit<TaskDb, "createdAt" | "updatedAt"> & {
  readonly createdAt: string;
  readonly updatedAt: string;
};

type TaskListResponse = {
  readonly data: readonly Task[];
};

type TaskDetailResponse = {
  readonly data: Task;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const isTask = (value: unknown): value is Task => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (typeof value.description === "string" || value.description === null) &&
    typeof value.isChecked === "boolean" &&
    typeof value.categoryId === "string" &&
    typeof value.createdBy === "string" &&
    typeof value.updatedBy === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
};

const toTask = (value: unknown): Task => {
  if (!isTask(value)) {
    throw new Error("API response did not include valid task data.");
  }
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    isChecked: value.isChecked,
    categoryId: value.categoryId,
    createdBy: value.createdBy,
    updatedBy: value.updatedBy,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
};

const toTaskList = (payload: unknown): TaskListResponse => {
  if (!isRecord(payload)) {
    throw new Error("Invalid task list response.");
  }
  const data = payload.data;
  if (!Array.isArray(data)) {
    throw new Error("Task list response is missing task data.");
  }
  return {
    data: data.map((item) => toTask(item)),
  };
};

const toTaskDetail = (payload: unknown): TaskDetailResponse => {
  if (!isRecord(payload)) {
    throw new Error("Invalid task detail response.");
  }
  return {
    data: toTask(payload.data),
  };
};

export type ListTasksParams = {
  readonly email?: string;
  readonly categoryId: string;
};

export const listTasksByCategory = async (
  params: ListTasksParams,
): Promise<TaskListResponse> => {
  const context = await createAuthenticatedContext(params.email);
  const path = `/categories/${encodeURIComponent(params.categoryId)}/tasks`;
  const payload = await requestJson(path, context.authorizationValue);
  return toTaskList(payload);
};

export type GetTaskParams = {
  readonly email?: string;
  readonly taskId: string;
};

export const getTask = async (
  params: GetTaskParams,
): Promise<TaskDetailResponse> => {
  const context = await createAuthenticatedContext(params.email);
  const path = `/tasks/${encodeURIComponent(params.taskId)}`;
  const payload = await requestJson(path, context.authorizationValue);
  return toTaskDetail(payload);
};

export type CreateTaskParams = {
  readonly email?: string;
  readonly categoryId: string;
  readonly name: string;
  readonly description?: string | null;
  readonly isChecked?: boolean;
};

export const createTask = async (params: CreateTaskParams): Promise<Task> => {
  const context = await createAuthenticatedContext(params.email);
  const path = `/categories/${encodeURIComponent(params.categoryId)}/tasks`;
  const description =
    params.description === undefined ? null : params.description;
  const body = {
    name: params.name,
    description,
    ...(params.isChecked === undefined ? {} : { isChecked: params.isChecked }),
  };

  const payload = await requestJson(path, context.authorizationValue, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return toTaskDetail(payload).data;
};

export type UpdateTaskParams = {
  readonly email?: string;
  readonly taskId: string;
  readonly name?: string;
  readonly description?: string | null;
  readonly isChecked?: boolean;
};

export const updateTask = async (params: UpdateTaskParams): Promise<Task> => {
  const context = await createAuthenticatedContext(params.email);
  const path = `/tasks/${encodeURIComponent(params.taskId)}`;
  const body = {
    ...(params.name === undefined ? {} : { name: params.name }),
    ...(params.description === undefined
      ? {}
      : { description: params.description }),
    ...(params.isChecked === undefined ? {} : { isChecked: params.isChecked }),
  };

  if (Object.keys(body).length === 0) {
    throw new Error("No task fields were provided for update.");
  }

  const payload = await requestJson(path, context.authorizationValue, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return toTaskDetail(payload).data;
};

export type DeleteTaskParams = {
  readonly email?: string;
  readonly taskId: string;
};

export const deleteTask = async (params: DeleteTaskParams): Promise<void> => {
  const context = await createAuthenticatedContext(params.email);
  const path = `/tasks/${encodeURIComponent(params.taskId)}`;
  await requestJson(path, context.authorizationValue, {
    method: "DELETE",
  });
};
