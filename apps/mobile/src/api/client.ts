import { createClient } from "urql";
import * as SecureStore from "expo-secure-store";

const API_URL = "http://localhost:3001/graphql"; // TODO: Update with actual API URL

export const urqlClient = createClient({
  url: API_URL,
  fetchOptions: async () => {
    const token = await SecureStore.getItemAsync("authToken");
    return {
      headers: {
        authorization: token ? `Bearer ${token}` : "",
      },
    };
  },
});
