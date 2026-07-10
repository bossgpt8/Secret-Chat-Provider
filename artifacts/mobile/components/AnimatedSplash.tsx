import React, { useEffect, useRef, useState } from "react";
import VoxIcon from "../assets/images/icon.png";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StyleSheet,
  Text,
} from "react-native";

const { width, height } = Dimensions.get("window");
const APP_NAME = "Vox";
const TYPING_SPEED = 120; // ms per character
const CURSOR_BLINK_SPEED = 500;
const POST_TYPE_HOLD = 800; // ms to hold after typing completes
const FADE_OUT_DURATION = 600;

interface AnimatedSplashProps {
  onDone: () => void;
}

export function AnimatedSplash({ onDone }: AnimatedSplashProps) {
  // --- Animated values ---
  const iconScale = useRef(new Animated.Value(0)).current;
  const iconTranslateY = useRef(new Animated.Value(30)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const cursorOpacity = useRef(new Animated.Value(1)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;

  // --- Typing state ---
  const [displayedText, setDisplayedText] = useState("");
  const [showCursor, setShowCursor] = useState(false);

  useEffect(() => {
    let destroyed = false;

    // Phase 1: Icon bounces in
    Animated.parallel([
      Animated.spring(iconScale, {
        toValue: 1,
        tension: 60,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(iconTranslateY, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(iconOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (destroyed) return;

      // Phase 2: Fade in tagline slot, start typing
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      setShowCursor(true);
      let index = 0;

      const typeNext = () => {
        if (destroyed) return;
        index++;
        setDisplayedText(APP_NAME.slice(0, index));
        if (index < APP_NAME.length) {
          setTimeout(typeNext, TYPING_SPEED);
        } else {
          // Phase 3: Blink cursor briefly then fade everything out
          setTimeout(() => {
            if (destroyed) return;

            // Stop blinking — leave cursor visible for exit
            Animated.timing(screenOpacity, {
              toValue: 0,
              duration: FADE_OUT_DURATION,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true,
            }).start(() => {
              if (!destroyed) onDone();
            });
          }, POST_TYPE_HOLD);
        }
      };

      setTimeout(typeNext, 200);
    });

    // Blinking cursor loop
    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: CURSOR_BLINK_SPEED,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: CURSOR_BLINK_SPEED,
          useNativeDriver: true,
        }),
      ])
    );
    blink.start();

    return () => {
      destroyed = true;
      blink.stop();
    };
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      {/* Icon */}
      <Animated.View
        style={[
          styles.iconWrapper,
          {
            opacity: iconOpacity,
            transform: [
              { scale: iconScale },
              { translateY: iconTranslateY },
            ],
          },
        ]}
      >
        <Image
          source={VoxIcon}
          style={styles.icon}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Typing name */}
      <Animated.View style={[styles.nameRow, { opacity: taglineOpacity }]}>
        <Text style={styles.nameText}>{displayedText}</Text>
        {showCursor && (
          <Animated.Text
            style={[styles.cursor, { opacity: cursorOpacity }]}
          >
            |
          </Animated.Text>
        )}
      </Animated.View>

      {/* Tagline */}
      <Animated.View style={{ opacity: taglineOpacity }}>
        <Text style={styles.tagline}>Your AI voice assistant</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0d0b1a",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  iconWrapper: {
    marginBottom: 32,
    shadowColor: "#7c3aed",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 20,
  },
  icon: {
    width: 120,
    height: 120,
    borderRadius: 28,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  nameText: {
    fontFamily: "Inter_700Bold",
    fontSize: 52,
    color: "#f0eeff",
    letterSpacing: 4,
  },
  cursor: {
    fontFamily: "Inter_400Regular",
    fontSize: 52,
    color: "#7c3aed",
    marginLeft: 2,
    marginTop: -4,
  },
  tagline: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#6b60a0",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});
