// Low-level DataForSEO HTTP client. The ONLY place that talks to DataForSEO.
// Higher layers (provider, cache, spend logging) wrap this; never call fetch directly.

/**
 * DataForSEO's "Base64" credential (base64 of `login:password`), shown on
 * app.dataforseo.com/api-access. We present it to users as a plain API key.
 */
export interface DataForSeoCredentials {
  apiKey: string;
}

export interface DataForSeoTask<T = unknown> {
  id: string;
  status_code: number;
  status_message: string;
  cost: number;
  result: T[] | null;
}

export interface DataForSeoEnvelope<T = unknown> {
  status_code: number;
  status_message: string;
  cost: number;
  tasks_count: number;
  tasks_error: number;
  tasks: DataForSeoTask<T>[];
}

/** Result of a call: the first task's first result, plus what the call cost. */
export interface CallResult<T> {
  result: T;
  costUsd: number;
  /** The full response, for saving as a test fixture. */
  raw: DataForSeoEnvelope<T>;
}

export class DataForSeoError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly costUsd = 0,
  ) {
    super(message);
    this.name = "DataForSeoError";
  }
}

// https://docs.dataforseo.com/v3/appendix/errors/
const OK = 20000;
const TASK_CREATED = 20100;
const TASK_IN_QUEUE = 40602;
const TASK_HANDED = 40601;

export interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Poll interval for queued tasks. */
  pollIntervalMs?: number;
  /** Give up waiting for a queued task after this long. */
  taskTimeoutMs?: number;
}

export class DataForSeoClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly authHeader: string;
  private readonly pollIntervalMs: number;
  private readonly taskTimeoutMs: number;

  constructor(credentials: DataForSeoCredentials, options: ClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://api.dataforseo.com";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.taskTimeoutMs = options.taskTimeoutMs ?? 180_000;
    this.authHeader = `Basic ${credentials.apiKey.trim()}`;
  }

  async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<DataForSeoEnvelope<T>> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: this.authHeader, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) {
      throw new DataForSeoError(
        "DataForSEO rejected your email or API key. Check both at app.dataforseo.com/api-access.",
        401,
      );
    }
    const json = (await res.json()) as DataForSeoEnvelope<T>;
    if (json.status_code !== OK) {
      throw new DataForSeoError(json.status_message, json.status_code, json.cost ?? 0);
    }
    return json;
  }

  /** Call a `/live` endpoint (Labs, user_data): one request, immediate result. */
  async live<T>(path: string, payload?: Record<string, unknown>): Promise<CallResult<T>> {
    const raw = payload === undefined
      ? await this.request<T>("GET", path)
      : await this.request<T>("POST", path, [payload]);
    const task = firstTask(raw);
    if (task.status_code !== OK) {
      throw new DataForSeoError(task.status_message, task.status_code, task.cost ?? 0);
    }
    return { result: task.result?.[0] as T, costUsd: raw.cost ?? 0, raw };
  }

  /**
   * Run a queued App Data task: POST `{base}/task_post`, then poll
   * `{base}/task_get/advanced/{id}` until ready. Billing happens at task_post,
   * so the returned cost is the task_post cost.
   */
  async task<T>(base: string, payload: Record<string, unknown>): Promise<CallResult<T>> {
    const posted = await this.request("POST", `${base}/task_post`, [payload]);
    const postedTask = firstTask(posted);
    if (postedTask.status_code !== TASK_CREATED) {
      throw new DataForSeoError(postedTask.status_message, postedTask.status_code, postedTask.cost ?? 0);
    }
    const costUsd = posted.cost ?? postedTask.cost ?? 0;

    const deadline = Date.now() + this.taskTimeoutMs;
    while (Date.now() < deadline) {
      await sleep(this.pollIntervalMs);
      const raw = await this.request<T>("GET", `${base}/task_get/advanced/${postedTask.id}`);
      const task = firstTask(raw);
      if (task.status_code === OK) {
        return { result: task.result?.[0] as T, costUsd, raw };
      }
      if (task.status_code !== TASK_IN_QUEUE && task.status_code !== TASK_HANDED) {
        throw new DataForSeoError(task.status_message, task.status_code, costUsd);
      }
    }
    throw new DataForSeoError(
      `Task ${postedTask.id} not ready after ${this.taskTimeoutMs / 1000}s (already billed; retry task_get later)`,
      TASK_IN_QUEUE,
      costUsd,
    );
  }
}

function firstTask<T>(envelope: DataForSeoEnvelope<T>): DataForSeoTask<T> {
  const task = envelope.tasks?.[0];
  if (!task) throw new DataForSeoError("DataForSEO returned no tasks", envelope.status_code);
  return task;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
