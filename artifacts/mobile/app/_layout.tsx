import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AssistantProvider } from "@/context/AssistantContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [fontTimeoutExpired, setFontTimeoutExpired] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const fontTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fallback: hide splash after 2s even if fonts never resolve
  useEffect(() => {
    fontTimerRef.current = setTimeout(() => {
      setFontTimeoutExpired(true);
      setSplashHidden(true);
      SplashScreen.hideAsync().catch(() => {});
    }, 2000);
    return () => {
      if (fontTimerRef.current) clearTimeout(fontTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      if (fontTimerRef.current) {
        clearTimeout(fontTimerRef.current);
        fontTimerRef.current = null;
      }
      setSplashHidden(true);
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!splashHidden) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <AssistantProvider>
                <RootLayoutNav />
              </AssistantProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
