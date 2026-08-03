import { AlertProvider } from "@/context/alertContext";
import { AuthProvider } from "@/context/authContext";
import { PrefsProvider } from "@/context/prefsContext";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "./global.css";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <AuthProvider>
          <PrefsProvider>
            <AlertProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                }}
              >
                <Stack.Screen
                  name="(modals)/profileModal"
                  options={{
                    presentation: "modal",
                  }}
                />
                <Stack.Screen
                  name="(modals)/accountModal"
                  options={{
                    presentation: "modal",
                  }}
                />
                <Stack.Screen
                  name="(modals)/transactionModal"
                  options={{
                    presentation: "modal",
                  }}
                />
                <Stack.Screen
                  name="(modals)/notificationsModal"
                  options={{
                    presentation: "modal",
                  }}
                />
                <Stack.Screen
                  name="(modals)/subscriptionModal"
                  options={{
                    presentation: "modal",
                  }}
                />
                <Stack.Screen
                  name="(modals)/searchModal"
                  options={{
                    presentation: "modal",
                  }}
                />
                <Stack.Screen
                  name="(modals)/privacyPolicy"
                  options={{
                    presentation: "modal",
                  }}
                />
              </Stack>
            </AlertProvider>
          </PrefsProvider>
        </AuthProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
