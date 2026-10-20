import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const BUBBLE_SIZE = 58;
const SNAP_MARGIN = 14;

interface Props {
  assistantName: string;
  onMicPress: () => void;
  onCommandPress: (cmd: string) => void;
  isListening: boolean;
  isSpeaking: boolean;
}

const QUICK_COMMANDS = [
  { icon: "mic-outline",       label: "Listen",    cmd: "__mic__" },
  { icon: "search-outline",    label: "Search",    cmd: "what's in the news today?" },
  { icon: "flashlight-outline",label: "Torch",     cmd: "toggle flashlight" },
  { icon: "musical-notes",     label: "Music",     cmd: "play music" },
  { icon: "moon-outline",      label: "DND",       cmd: "do not disturb" },
];

export function FloatingBubble({ assistantName, onMicPress, onCommandPress, isListening, isSpeaking }: Props) {
  const colors = useColors();
  const pan = useRef(new Animated.ValueXY({ x: SCREEN_W - BUBBLE_SIZE - SNAP_MARGIN, y: SCREEN_H * 0.55 })).current;
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const dragStartPos = useRef({ x: 0, y: 0 });
  const posRef = useRef({ x: SCREEN_W - BUBBLE_SIZE - SNAP_MARGIN, y: SCREEN_H * 0.55 });

  // Pulse when listening or speaking
  useEffect(() => {
    if (isListening || isSpeaking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 550, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.92, duration: 550, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [isListening, isSpeaking]);

  // Menu open/close animation
  useEffect(() => {
    Animated.spring(menuAnim, {
      toValue: menuOpen ? 1 : 0,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
  }, [menuOpen]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
      onPanResponderGrant: (_, g) => {
        setDragging(false);
        dragStartPos.current = { x: g.x0, y: g.y0 };
        pan.setOffset({ x: posRef.current.x, y: posRef.current.y });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_, g) => {
        const dist = Math.hypot(g.dx, g.dy);
        if (dist > 6) setDragging(true);
        pan.setValue({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: (_, g) => {
        pan.flattenOffset();
        const newX = posRef.current.x + g.dx;
        const newY = posRef.current.y + g.dy;
        // Snap to nearest vertical edge
        const snapX = newX + BUBBLE_SIZE / 2 < SCREEN_W / 2
          ? SNAP_MARGIN
          : SCREEN_W - BUBBLE_SIZE - SNAP_MARGIN;
        const clampedY = Math.max(80, Math.min(SCREEN_H - BUBBLE_SIZE - 80, newY));
        posRef.current = { x: snapX, y: clampedY };
        Animated.spring(pan, {
          toValue: { x: snapX, y: clampedY },
          useNativeDriver: false,
          tension: 80,
          friction: 12,
        }).start();
        const dist = Math.hypot(g.dx, g.dy);
        if (dist < 8) {
          // Treat as tap — toggle menu
          setMenuOpen((v) => !v);
        } else {
          setMenuOpen(false);
        }
        setDragging(false);
      },
    })
  ).current;

  if (Platform.OS === "web") return null;

  const bubbleBg = isListening
    ? colors.destructive
    : isSpeaking
    ? colors.accent
    : colors.primary;

  return (
    <Animated.View
      style={[styles.bubble, { transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: pulseAnim }], backgroundColor: bubbleBg }]}
      {...panResponder.panHandlers}
    >
      {/* Quick command menu */}
      {menuOpen && (
        <Animated.View
          style={[
            styles.menu,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: menuAnim,
              transform: [{ scale: menuAnim }],
              right: BUBBLE_SIZE + 10,
              top: -(QUICK_COMMANDS.length * 46) / 2 + BUBBLE_SIZE / 2,
            },
          ]}
          pointerEvents="box-none"
        >
          {QUICK_COMMANDS.map((cmd) => (
            <Pressable
              key={cmd.cmd}
              style={[styles.menuItem, { borderBottomColor: colors.border }]}
              onPress={() => {
                setMenuOpen(false);
                if (cmd.cmd === "__mic__") onMicPress();
                else onCommandPress(cmd.cmd);
              }}
            >
              <Ionicons name={cmd.icon as "mic"} size={16} color={colors.primary} />
              <Text style={[styles.menuLabel, { color: colors.foreground }]}>{cmd.label}</Text>
            </Pressable>
          ))}
          <View style={[styles.menuItem, { borderBottomColor: "transparent" }]}>
            <Text style={[styles.menuLabel, { color: colors.mutedForeground, fontSize: 11 }]} numberOfLines={1}>
              {assistantName}
            </Text>
          </View>
        </Animated.View>
      )}

      {/* Main bubble button */}
      <Pressable
        style={styles.bubbleInner}
        onPress={() => {
          if (!dragging) setMenuOpen((v) => !v);
        }}
        hitSlop={8}
      >
        <Ionicons
          name={isListening ? "stop" : isSpeaking ? "volume-high" : menuOpen ? "close" : "mic"}
          size={24}
          color="#fff"
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: "absolute",
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 9999,
  },
  bubbleInner: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  menu: {
    position: "absolute",
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 130,
    overflow: "hidden",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
