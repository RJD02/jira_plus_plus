const METADATA_ENDPOINT = import.meta.env.VITE_METADATA_GRAPHQL_ENDPOINT ?? "/metadata/graphql";

export type MetadataGraphQLRequestOptions = {
  query: string;
  variables?: Record<string, unknown>;
  userId?: string | null;
};

export async function callMetadataGraphQL<T>({ query, variables, userId }: MetadataGraphQLRequestOptions): Promise<T> {
  const response = await fetch(METADATA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userId ? { "x-user-id": userId } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`Metadata API error (${response.status})`);
  }
  const payload = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message ?? "Unknown error").join("; "));
  }
  if (!payload.data) {
    throw new Error("Metadata API response missing data");
  }
  return payload.data;
}
