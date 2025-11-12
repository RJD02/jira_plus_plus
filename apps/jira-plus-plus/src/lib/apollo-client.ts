import { ApolloClient, HttpLink, InMemoryCache, from } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";
import { emitUnauthorized } from "./auth-events";
import { getAuthToken } from "./auth-token";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function createApolloClient() {
  const defaultEndpoint =
    typeof window !== "undefined" && LOCAL_HOSTS.has(window.location.hostname)
      ? "http://localhost:4000/graphql"
      : "https://api.jira-plus-plus.in/graphql";

  const httpLink = new HttpLink({
    uri: import.meta.env.VITE_GRAPHQL_ENDPOINT ?? defaultEndpoint,
  });

  const authLink = setContext((_, { headers }) => {
    const token = getAuthToken();
    return {
      headers: {
        ...headers,
        authorization: token ? `Bearer ${token}` : "",
      },
    };
  });

  const errorLink = onError(({ graphQLErrors, networkError }) => {
    const unauthenticated =
      graphQLErrors?.some((error) => error.extensions?.code === "UNAUTHENTICATED") ||
      (typeof networkError === "object" && networkError !== null && "statusCode" in networkError
        ? (networkError as { statusCode?: number }).statusCode === 401
        : false);

    if (unauthenticated) {
      emitUnauthorized();
    }
  });

  return new ApolloClient({
    link: from([errorLink, authLink.concat(httpLink)]),
    cache: new InMemoryCache(),
  });
}

export const apolloClient = createApolloClient();
