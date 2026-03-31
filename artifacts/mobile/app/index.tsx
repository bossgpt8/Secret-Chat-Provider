import { Redirect } from "expo-router";
import { useAssistant } from "@/context/AssistantContext";
import { ActivityIndicator, View } from "react-native";
import { useColors } from "@/hooks/useColors";

export default function Index() {
  const { isOnboarded, isLoading } = useAssistant();
  const colors = useColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!isOnboarded) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/chat" />;
}
