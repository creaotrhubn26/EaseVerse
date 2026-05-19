import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { TokenCache } from "@clerk/clerk-expo";

export const clerkTokenCache: TokenCache | undefined =
  Platform.OS === "web"
    ? undefined
    : {
        async getToken(key: string) {
          try {
            return await SecureStore.getItemAsync(key);
          } catch (error) {
            console.warn("SecureStore getToken failed:", error);
            await SecureStore.deleteItemAsync(key);
            return null;
          }
        },
        async saveToken(key: string, token: string) {
          try {
            await SecureStore.setItemAsync(key, token);
          } catch (error) {
            console.warn("SecureStore saveToken failed:", error);
          }
        },
      };
