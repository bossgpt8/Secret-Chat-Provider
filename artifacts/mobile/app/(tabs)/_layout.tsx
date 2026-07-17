import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { router, Tabs } from "expo-router";
import React, { useCallback } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { FloatingBubble } from "@/components/FloatingBubble";
import { useAssistant } from "@/context/AssistantContext";
import { useAppColorScheme } from "@/hooks/useAppColorScheme";
import { useColors } from "@/hooks/useColors";

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

      {/* Floating bubble — rendered over all tabs */}
      {floatingBubbleEnabled && Platform.OS !== "web" && (
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
