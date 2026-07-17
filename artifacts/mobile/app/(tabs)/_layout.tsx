import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { router, Tabs } from "expo-router";
import React, { useCallback, useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { FloatingBubble } from "@/components/FloatingBubble";
import { useAssistant } from "@/context/AssistantContext";
import { useAppColorScheme } from "@/hooks/useAppColorScheme";
import { useColors } from "@/hooks/useColors";
import { NativeOverlay } from "@/modules/NativeOverlay";

export default function TabLayout() {
  const colors = useColors();
  const colorScheme = useAppColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const { assistantName, floatingBubbleEnabled } = useAssistant();

  const handleMicPress = useCallback(() => {
    router.navigate("/(tabs)/");
  }, []);

  const handleCommandPress = useCallback((cmd: string) => {
    router.navigate({ pathname: "/(tabs)/", params: { bubbleCmd: cmd, bubbleCmdTs: String(Date.now()) } });
  }, []);

  // On Android the floating bubble is a native WindowManager overlay so it
  // persists when the app is backgrounded. Start / stop the foreground service
  // here so the lifecycle is tied to the tab layout (always-mounted root).
  useEffect(() => {
    if (Platform.OS !== "android" || !NativeOverlay.isAvailable) return;
    if (floatingBubbleEnabled) {
      NativeOverlay.hasPermission().then(async (hasPerm) => {
        if (hasPerm) {
          await NativeOverlay.start();
        } else {
          // Send user to system settings; they need to toggle "Display over other apps"
          await NativeOverlay.requestPermission();
        }
      }).catch(() => {});
    } else {
      NativeOverlay.stop().catch(() => {});
    }
    return () => {
      // Do NOT stop the service on unmount — layout remounts on navigation.
      // Service lifecycle is intentionally controlled only by the setting toggle.
    };
  }, [floatingBubbleEnabled]);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedForeground,
          tabBarStyle: {
            position: "absolute",
            backgroundColor: isIOS ? "transparent" : colors.tabBar,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.tabBarBorder,
            elevation: 0,
            ...(isWeb ? { height: 68 } : {}),
          },
          tabBarBackground: () =>
            isIOS ? (
              <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
            ) : isWeb ? (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBar }]} />
            ) : null,
          tabBarLabelStyle: {
            fontSize: 11,
            fontFamily: "Inter_500Medium",
            marginBottom: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Chat",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="mic" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: "Messages",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="controls"
          options={{
            title: "Controls",
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name="tune" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, size }) => (
              <Feather name="settings" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      {/* Floating bubble — React Native component only on iOS/web.
          On Android the native WindowManager overlay (VoxOverlayService) is
          used instead so the bubble persists when the app is backgrounded. */}
      {floatingBubbleEnabled && Platform.OS === "ios" && (
        <FloatingBubble
          assistantName={assistantName}
          onMicPress={handleMicPress}
          onCommandPress={handleCommandPress}
          isListening={false}
          isSpeaking={false}
        />
      )}
    </View>
  );
}
