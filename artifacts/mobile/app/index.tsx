import { Redirect } from "expo-router";
import { useAssistant } from "@/context/AssistantContext";
import { ActivityIndicator, View, Text } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useEffect, useState } from "react";

export default function Index() {
  const { isOnboarded, isLoading } = useAssistant();
  const colors = useColors();
  const [showTimeout, setShowTimeout] = useState(false);

  useEffect(() => {
    // Safety: if loading takes >8 seconds, show error
    const timeout = setTimeout(() => {
      setShowTimeout(true);
    }, 8000);
    return () => clearTimeout(timeout);
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
        {showTimeout && (
          <Text style={{ marginTop: 20, color: colors.text, textAlign: "center", paddingHorizontal: 20 }}>
            Loading is taking longer than expected. Please restart the app.
          </Text>
        )}
      </View>
    );
  }

  if (!isOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)" />;
}
