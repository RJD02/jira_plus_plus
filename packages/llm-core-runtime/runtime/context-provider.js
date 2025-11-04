import crypto from "node:crypto";

export function buildExecutionContext(options) {
  if (!options?.tenantId) {
    throw new Error("tenantId is required to build an execution context");
  }
  return {
    tenantId: options.tenantId,
    userId: options.userId ?? null,
    requestId: options.requestId ?? crypto.randomUUID(),
    locale: options.locale,
    timezone: options.timezone,
    metadata: options.metadata,
  };
}

export function mergeExecutionContext(base, override) {
  return {
    ...base,
    ...override,
    metadata: {
      ...(base.metadata ?? {}),
      ...(override?.metadata ?? {}),
    },
  };
}
