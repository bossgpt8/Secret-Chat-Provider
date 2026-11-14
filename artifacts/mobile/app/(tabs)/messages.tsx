import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAssistant } from "@/context/AssistantContext";
import { useColors } from "@/hooks/useColors";
import {
  buildInbox,
  dedupeKey,
  dedupeNotifications,
  displayTitle,
  getAppMeta,
  hasContent,
  InboxKind,
  initials,
  resolveReplyDeepUrl,
  timeAgo,
} from "@/lib/notificationInbox";
import { NativeNotifications, VoxNotification } from "@/modules/NativeNotifications";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Colors = ReturnType<typeof useColors>;
type ReplyStatus = "idle" | "sending" | "sent" | "handoff" | "error";

function animate() {
  LayoutAnimation.configureNext(LayoutAnimation.create(180, "easeInEaseOut", "opacity"));
}

function Avatar({ n, colors, kind }: { n: VoxNotification; colors: Colors; kind: InboxKind }) {
  const meta = getAppMeta(n.packageName, n.app);
  if (kind === "activity") {
    return (
      <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
        <Ionicons name={meta.icon as "mic"} size={18} color={colors.mutedForeground} />
      </View>
    );
  }
  return (
    <View>
      <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
        <Text style={[styles.avatarText, { color: colors.secondaryForeground }]}>{initials(displayTitle(n))}</Text>
      </View>
      <View style={[styles.appBadge, { backgroundColor: meta.color, borderColor: colors.card }]}>
        <Ionicons name={meta.icon as "mic"} size={9} color="#fff" />
      </View>
    </View>
  );
}

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { customApiUrl } = useAssistant();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [notifications, setNotifications] = useState<VoxNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [kind, setKind] = useState<InboxKind>("personal");
  const [searchQuery, setSearchQuery] = useState("");
  const [appFilter, setAppFilter] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<string | null>(null);
  const expandedRef = useRef<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyStatus, setReplyStatus] = useState<ReplyStatus>("idle");
  const [replyNote, setReplyNote] = useState<string | null>(null);
  const [aiSuggestLoading, setAiSuggestLoading] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const suggestToken = useRef(0);
  const composerEpoch = useRef(0);
  const sendingRef = useRef(false);

  const inbox = useMemo(
    () => buildInbox(notifications, { kind, query: searchQuery, app: appFilter }),
    [notifications, kind, searchQuery, appFilter],
  );

  function getApiBase(): string {
    const configured = customApiUrl?.trim() || process.env.EXPO_PUBLIC_API_URL;
    if (configured) return configured.endsWith("/") ? configured : `${configured}/`;
    if (Platform.OS === "web") return "/api/";
    return "https://vox.bossbot.me/api/";
  }

  function resetReply(key: string | null) {
    suggestToken.current += 1; // invalidate any in-flight suggestion
    composerEpoch.current += 1; // invalidate any in-flight send result
    sendingRef.current = false;
    expandedRef.current = key;
    setExpanded(key);
    setReplyText("");
    setReplyStatus("idle");
    setReplyNote(null);
    setAiSuggestLoading(null);
    setAiError(null);
  }

  function toggleExpand(key: string) {
    animate();
    resetReply(expanded === key ? null : key);
  }

  async function handleAiSuggestReply(n: VoxNotification) {
    if (sendingRef.current) return;
    const token = ++suggestToken.current;
    const epoch = composerEpoch.current;
    setAiSuggestLoading(n.key);
    setAiError(null);
    try {
      const r = await fetch(`${getApiBase()}suggest-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: n.sender ?? n.app,
          app: getAppMeta(n.packageName, n.app).name,
          text: n.text ?? "",
        }),
      });
      if (!r.ok) throw new Error("suggest-reply failed");
      const d = (await r.json()) as { suggestion?: string };
      if (token !== suggestToken.current || epoch !== composerEpoch.current || expandedRef.current !== n.key) return;
      if (d.suggestion) setReplyText(d.suggestion);
      else setAiError("No suggestion this time. Write your own reply.");
    } catch {
      if (token === suggestToken.current && epoch === composerEpoch.current && expandedRef.current === n.key) {
        setAiError("Couldn't reach Vox for a suggestion.");
      }
    } finally {
      if (token === suggestToken.current) setAiSuggestLoading(null);
    }
  }

  async function loadNotifications() {
    setLoading(true);
    try {
      const items = await NativeNotifications.getRecent();
      setNotifications(dedupeNotifications(items.filter(hasContent)));
      setLoadError(null);
      setLastUpdated(Date.now());
    } catch (e) {
      console.warn("getRecent error", e);
      setLoadError("Couldn't read notifications from Android.");
    } finally {
      setLoading(false);
    }
  }

  async function checkPermissionAndLoad() {
    if (!NativeNotifications.isAvailable) {
      setHasPermission(false);
      return;
    }
    try {
      const granted = await NativeNotifications.hasPermission();
      setHasPermission(granted);
      if (granted) await loadNotifications();
    } catch {
      setLoadError("Couldn't check Notification Access.");
      setHasPermission(false);
    }
  }

  async function handleSmartReply(n: VoxNotification) {
    const text = replyText.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    const epoch = composerEpoch.current;
    const live = () => epoch === composerEpoch.current && expandedRef.current === n.key;
    // Cancel any pending suggestion so it can't overwrite the composer mid-send.
    suggestToken.current += 1;
    setAiSuggestLoading(null);
    setReplyStatus("sending");
    setReplyNote(null);
    try {
      if (n.hasReply && NativeNotifications.isAvailable) {
        const sent = await NativeNotifications.replyTo(n.key, text).catch(() => false);
        if (sent) {
          if (!live()) return;
          setReplyStatus("sent");
          setReplyText("");
          setReplyNote("Sent from Vox.");
          setTimeout(() => {
            if (live()) {
              animate();
              resetReply(null);
            }
          }, 1400);
          return;
        }
      }
      const deepUrl = resolveReplyDeepUrl(n.packageName, n.app, text);
      if (deepUrl) {
        const canOpen = await Linking.canOpenURL(deepUrl).catch(() => false);
        if (canOpen) {
          await Linking.openURL(deepUrl);
          if (!live()) return;
          setReplyStatus("handoff");
          setReplyNote(`Draft opened in ${getAppMeta(n.packageName, n.app).name}. Pick the chat and send it there.`);
          return;
        }
      }
      if (!live()) return;
      setReplyStatus("error");
      setReplyNote("Couldn't reply from here. Open the app directly.");
    } catch {
      if (!live()) return;
      setReplyStatus("error");
      setReplyNote("Send failed. Try again.");
    } finally {
      if (epoch === composerEpoch.current) sendingRef.current = false;
    }
  }

  useFocusEffect(
    useCallback(() => {
      checkPermissionAndLoad();
      if (NativeNotifications.isAvailable) {
        pollRef.current = setInterval(() => {
          if (hasPermission) loadNotifications();
        }, 5000);
      }
      const unsub = NativeNotifications.onNotification((n) => {
        if (!hasContent(n)) return;
        setNotifications((prev) => {
          const dk = dedupeKey(n);
          const rest = prev.filter((p) => p.key !== n.key && dedupeKey(p) !== dk);
          return [n, ...rest].slice(0, 100);
        });
        setLastUpdated(Date.now());
      });
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        unsub();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasPermission]),
  );

  function switchKind(k: InboxKind) {
    if (k === kind) return;
    animate();
    setKind(k);
    setAppFilter(null);
    resetReply(null);
  }

  const ready = hasPermission === true;
  const personalCount = inbox.personal.length;
  const activityCount = inbox.activity.length;
  const total = notifications.length;
  const filtering = !!searchQuery.trim() || !!appFilter;

  const subtitle = !ready
    ? "Your inbox, read by Vox"
    : loading && !lastUpdated
      ? "Checking notifications"
      : `${personalCount} from people${lastUpdated ? ` · updated ${timeAgo(lastUpdated)}` : ""}`;

  // ── Body content ─────────────────────────────────────────────────────────
  let body: React.ReactNode = null;

  if (Platform.OS !== "android") {
    body = (
      <StateBlock
        colors={colors}
        icon="phone-portrait-outline"
        title="Available on Android"
        text="Vox reads incoming messages through Android Notification Access. Install the Android app and grant access to see them here."
      />
    );
  } else if (hasPermission === false) {
    body = (
      <View style={styles.permWrap}>
        <StateBlock
          colors={colors}
          icon="notifications-off-outline"
          title="Let Vox see your messages"
          text={loadError ?? "Grant Notification Access so Vox can read incoming messages and help you reply. Nothing is sent without you pressing send."}
        />
        <Pressable
          testID="grant-access"
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          onPress={async () => {
            await NativeNotifications.requestPermission();
            setTimeout(checkPermissionAndLoad, 1500);
          }}
        >
          <Ionicons name="settings-outline" size={16} color={colors.primaryForeground} />
          <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Open Notification Access</Text>
        </Pressable>
        <View style={[styles.steps, { borderColor: colors.border }]}>
          {["Tap the button above", "Find Vox in the list and switch it on", "Come back here. Messages load on their own"].map((t, i) => (
            <View key={t} style={styles.stepRow}>
              <Text style={[styles.stepNum, { color: colors.primary }]}>{i + 1}</Text>
              <Text style={[styles.stepText, { color: colors.foreground }]}>{t}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  } else if (hasPermission === null || (loading && total === 0 && !lastUpdated)) {
    body = (
      <View>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.row, { opacity: 1 - i * 0.16 }]}>
            <View style={[styles.avatar, { backgroundColor: colors.muted }]} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={[styles.skel, { width: "45%", backgroundColor: colors.muted }]} />
              <View style={[styles.skel, { width: "85%", backgroundColor: colors.muted }]} />
            </View>
          </View>
        ))}
      </View>
    );
  } else if (loadError && total === 0) {
    body = (
      <StateBlock colors={colors} icon="alert-circle-outline" title="Something went wrong" text={loadError}>
        <Pressable style={[styles.ghostBtn, { borderColor: colors.border }]} onPress={loadNotifications}>
          <Ionicons name="refresh" size={15} color={colors.primary} />
          <Text style={[styles.ghostBtnText, { color: colors.primary }]}>Try again</Text>
        </Pressable>
      </StateBlock>
    );
  } else if (kind === "personal" && personalCount === 0) {
    body = (
      <StateBlock
        colors={colors}
        icon="chatbubbles-outline"
        title={total === 0 ? "No notifications yet" : "No messages from people"}
        text={
          total === 0
            ? "When someone messages you on WhatsApp, SMS, Telegram or similar apps, it shows up here."
            : `Only device and app alerts have arrived so far. ${activityCount} ${activityCount === 1 ? "is" : "are"} kept under Activity.`
        }
      >
        {activityCount > 0 && (
          <Pressable style={[styles.ghostBtn, { borderColor: colors.border }]} onPress={() => switchKind("activity")}>
            <Text style={[styles.ghostBtnText, { color: colors.primary }]}>View activity ({activityCount})</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </Pressable>
        )}
      </StateBlock>
    );
  } else if (kind === "activity" && activityCount === 0) {
    body = (
      <StateBlock colors={colors} icon="checkmark-done-outline" title="No device activity" text="System and app alerts like downloads or the torch would collect here." />
    );
  } else if (inbox.visible.length === 0) {
    body = (
      <StateBlock colors={colors} icon="search-outline" title="No matches" text="Nothing fits that search or app filter.">
        <Pressable
          style={[styles.ghostBtn, { borderColor: colors.border }]}
          onPress={() => {
            setSearchQuery("");
            setAppFilter(null);
          }}
        >
          <Text style={[styles.ghostBtnText, { color: colors.primary }]}>Clear filters</Text>
        </Pressable>
      </StateBlock>
    );
  } else {
    body = (
      <View>
        {loadError && (
          <View style={[styles.inlineError, { backgroundColor: colors.destructive + "14" }]}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.destructive} />
            <Text style={[styles.inlineErrorText, { color: colors.destructive }]}>{loadError} Showing last results.</Text>
          </View>
        )}
        {inbox.visible.map((n, idx) => {
          const meta = getAppMeta(n.packageName, n.app);
          const isOpen = expanded === n.key;
          const canReply = n.hasReply || !!resolveReplyDeepUrl(n.packageName, n.app, "");
          const title = displayTitle(n);
          const isLast = idx === inbox.visible.length - 1;
          return (
            <View key={n.key} style={isOpen ? [styles.openCard, { backgroundColor: colors.card, borderColor: colors.border }] : null}>
              <Pressable
                testID={`msg-${n.key}`}
                onPress={() => toggleExpand(n.key)}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed && !isOpen ? colors.muted : "transparent" }]}
              >
                <Avatar n={n} colors={colors} kind={kind} />
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={[styles.sender, { color: colors.foreground }]} numberOfLines={1}>{title}</Text>
                    <Text style={[styles.time, { color: colors.mutedForeground }]}>{timeAgo(n.timestamp)}</Text>
                  </View>
                  <Text style={[styles.preview, { color: isOpen ? colors.foreground : colors.mutedForeground }]} numberOfLines={isOpen ? undefined : 2}>
                    {n.text?.trim() || "No message text"}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={[styles.appLabel, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {meta.name}
                    </Text>
                    {canReply && !isOpen && (
                      <>
                        <View style={[styles.metaDot, { backgroundColor: colors.mutedForeground }]} />
                        <Text style={[styles.appLabel, { color: colors.primary }]}>{n.hasReply ? "Reply here" : "Reply in app"}</Text>
                      </>
                    )}
                  </View>
                </View>
              </Pressable>

              {isOpen && (
                <View style={styles.detail}>
                  <Text style={[styles.detailMeta, { color: colors.mutedForeground }]}>
                    {new Date(n.timestamp).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" })}
                  </Text>
                  {canReply ? (
                    <View style={{ gap: 10 }}>
                      <View style={styles.replyRow}>
                        <TextInput
                          testID="reply-input"
                          style={[styles.replyInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                          placeholder={`Reply to ${title}`}
                          placeholderTextColor={colors.mutedForeground}
                          value={replyText}
                          onChangeText={(t) => {
                            setReplyText(t);
                            if (aiSuggestLoading) {
                              suggestToken.current += 1; // user typed: drop pending suggestion
                              setAiSuggestLoading(null);
                            }
                            if (replyStatus !== "sending") {
                              setReplyStatus("idle");
                              setReplyNote(null);
                            }
                          }}
                          multiline
                          editable={replyStatus !== "sending"}
                        />
                        <Pressable
                          testID="reply-send"
                          accessibilityLabel="Send reply"
                          style={[
                            styles.sendBtn,
                            {
                              backgroundColor: replyStatus === "sent" ? colors.success : colors.primary,
                              opacity: replyStatus === "sending" || !replyText.trim() ? 0.45 : 1,
                            },
                          ]}
                          onPress={() => handleSmartReply(n)}
                          disabled={replyStatus === "sending" || !replyText.trim()}
                        >
                          {replyStatus === "sending" ? (
                            <ActivityIndicator size="small" color={colors.primaryForeground} />
                          ) : (
                            <Ionicons name={replyStatus === "sent" ? "checkmark" : n.hasReply ? "arrow-up" : "open-outline"} size={18} color={colors.primaryForeground} />
                          )}
                        </Pressable>
                      </View>
                      <View style={styles.replyFoot}>
                        <Pressable
                          testID="ai-suggest"
                          style={[styles.suggestBtn, { backgroundColor: colors.secondary }]}
                          onPress={() => handleAiSuggestReply(n)}
                          disabled={aiSuggestLoading === n.key}
                        >
                          {aiSuggestLoading === n.key ? (
                            <ActivityIndicator size="small" color={colors.secondaryForeground} />
                          ) : (
                            <Ionicons name="sparkles-outline" size={13} color={colors.secondaryForeground} />
                          )}
                          <Text style={[styles.suggestText, { color: colors.secondaryForeground }]}>
                            {aiSuggestLoading === n.key ? "Drafting" : replyText.trim() ? "Suggest another" : "Suggest a reply"}
                          </Text>
                        </Pressable>
                        <Text style={[styles.hint, { color: colors.mutedForeground }]} numberOfLines={2}>
                          {n.hasReply ? "Sends through the notification" : `Opens ${meta.name} with your draft`}
                        </Text>
                      </View>
                      {(replyNote || aiError) && (
                        <View style={styles.noteRow}>
                          <Ionicons
                            name={replyStatus === "error" || (!replyNote && aiError) ? "alert-circle-outline" : replyStatus === "sent" ? "checkmark-circle-outline" : "information-circle-outline"}
                            size={14}
                            color={replyStatus === "error" || (!replyNote && aiError) ? colors.destructive : replyStatus === "sent" ? colors.success : colors.mutedForeground}
                          />
                          <Text
                            style={[
                              styles.noteText,
                              { color: replyStatus === "error" || (!replyNote && aiError) ? colors.destructive : colors.mutedForeground },
                            ]}
                          >
                            {replyNote ?? aiError}
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
                      {kind === "activity" ? "This is a device or app alert. Vox can't reply to it." : `${meta.name} doesn't offer a reply action. Open the app to respond.`}
                    </Text>
                  )}
                </View>
              )}
              {!isOpen && !isLast && expanded !== inbox.visible[idx + 1]?.key && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Messages</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>
        </View>
        {ready && (
          <Pressable
            testID="refresh"
            accessibilityLabel="Refresh"
            hitSlop={8}
            onPress={loadNotifications}
            disabled={loading}
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={18} color={colors.primary} />}
          </Pressable>
        )}
      </View>

      {ready && total > 0 && (
        <View style={styles.controls}>
          {/* Segmented */}
          <View style={[styles.segment, { backgroundColor: colors.muted }]}>
            {(["personal", "activity"] as InboxKind[]).map((k) => {
              const active = kind === k;
              const count = k === "personal" ? personalCount : activityCount;
              return (
                <Pressable
                  key={k}
                  testID={`segment-${k}`}
                  onPress={() => switchKind(k)}
                  style={[styles.segBtn, active && { backgroundColor: colors.card }]}
                >
                  <Text style={[styles.segText, { color: active ? colors.foreground : colors.mutedForeground }]}>
                    {k === "personal" ? "People" : "Activity"}
                  </Text>
                  <Text style={[styles.segCount, { color: active ? colors.primary : colors.mutedForeground }]}>{count}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Search */}
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search" size={15} color={colors.mutedForeground} />
            <TextInput
              testID="search"
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder={kind === "personal" ? "Search people and messages" : "Search activity"}
              placeholderTextColor={colors.mutedForeground}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
              </Pressable>
            )}
          </View>

          {/* App filter: fixed height, non-growing */}
          {inbox.apps.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}
            >
              {[{ packageName: "", name: "All apps", color: colors.primary, count: kind === "personal" ? personalCount : activityCount }, ...inbox.apps].map((a) => {
                const active = a.packageName === "" ? !appFilter : appFilter === a.packageName;
                return (
                  <Pressable
                    key={a.packageName || "all"}
                    onPress={() => setAppFilter(a.packageName === "" || active ? null : a.packageName)}
                    style={[
                      styles.chip,
                      { backgroundColor: active ? colors.foreground : colors.card, borderColor: active ? colors.foreground : colors.border },
                    ]}
                  >
                    {a.packageName !== "" && <View style={[styles.chipDot, { backgroundColor: a.color }]} />}
                    <Text style={[styles.chipText, { color: active ? colors.background : colors.foreground }]} numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Text style={[styles.chipCount, { color: active ? colors.background : colors.mutedForeground }]}>{a.count}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: bottomPad + 96 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {body}
        {ready && kind === "personal" && activityCount > 0 && personalCount > 0 && !filtering && (
          <Pressable onPress={() => switchKind("activity")} style={styles.footerLink}>
            <Ionicons name="layers-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
              {activityCount} device and app {activityCount === 1 ? "alert" : "alerts"} in Activity
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StateBlock({
  colors,
  icon,
  title,
  text,
  children,
}: {
  colors: Colors;
  icon: string;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.state}>
      <View style={[styles.stateIcon, { backgroundColor: colors.secondary }]}>
        <Ionicons name={icon as "mic"} size={26} color={colors.primary} />
      </View>
      <Text style={[styles.stateTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.stateText, { color: colors.mutedForeground }]}>{text}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  title: { fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.6 },
  subtitle: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 2 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, alignItems: "center", justifyContent: "center" },

  controls: { paddingHorizontal: 16, gap: 10, paddingBottom: 8 },
  segment: { flexDirection: "row", borderRadius: 12, padding: 3 },
  segBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 9 },
  segText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  segCount: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },

  chipScroll: { flexGrow: 0, flexShrink: 0, marginHorizontal: -16 },
  chipRow: { paddingHorizontal: 16, gap: 6, alignItems: "center" },
  chip: { flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, maxWidth: 180 },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  chipCount: { fontSize: 11, fontFamily: "Inter_500Medium" },

  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  openCard: { marginHorizontal: 8, marginVertical: 6, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  appBadge: { position: "absolute", right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  sender: { flex: 1, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  time: { fontSize: 12, fontFamily: "Inter_500Medium" },
  preview: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  metaDot: { width: 3, height: 3, borderRadius: 2, opacity: 0.6 },
  appLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 72, marginRight: 16 },
  skel: { height: 10, borderRadius: 5 },

  detail: { paddingHorizontal: 16, paddingBottom: 14, paddingLeft: 72, gap: 10 },
  detailMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  replyRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  replyInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, minHeight: 40, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  replyFoot: { flexDirection: "row", alignItems: "center", gap: 10 },
  suggestBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 15 },
  suggestText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  hint: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right" },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  noteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  inlineError: { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 16, marginBottom: 6, padding: 8, borderRadius: 10 },
  inlineErrorText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },

  state: { alignItems: "center", paddingHorizontal: 32, paddingTop: 56, paddingBottom: 24, gap: 10 },
  stateIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  stateTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  stateText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, maxWidth: 320 },
  ghostBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, height: 38, paddingHorizontal: 16, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth },
  ghostBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  permWrap: { paddingBottom: 16 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 24, height: 48, borderRadius: 24 },
  primaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  steps: { marginHorizontal: 24, marginTop: 20, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, gap: 12 },
  stepRow: { flexDirection: "row", gap: 12, alignItems: "baseline" },
  stepNum: { fontSize: 14, fontFamily: "Inter_700Bold", width: 14 },
  stepText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },

  footerLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 20 },
  footerText: { fontSize: 13, fontFamily: "Inter_500Medium" },
});
