export async function fetchMetadataGraphQL<T>(
  endpoint: string,
  query: string,
  variables?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Metadata GraphQL failed with status ${response.status}`);
  }
  const payload = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message ?? "Metadata GraphQL error");
  }
  if (!payload.data) {
    throw new Error("Metadata GraphQL response missing data payload");
  }
  return payload.data;
}
