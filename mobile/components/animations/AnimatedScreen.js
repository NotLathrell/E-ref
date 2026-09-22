import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  View,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";

export function AnimatedScreen({
  children,
  direction = "center",
}) {
  const isFocused = useIsFocused();

  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const startPosition =
      direction === "left"
        ? -20
        : direction === "right"
          ? 20
          : 0;

    opacity.stopAnimation();
    translateX.stopAnimation();
    scale.stopAnimation();

    opacity.setValue(0);
    translateX.setValue(startPosition);
    scale.setValue(direction === "center" ? 0.96 : 0.985);

    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      Animated.timing(translateX, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      Animated.timing(scale, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => {
      animation.stop();
    };
  }, [
    isFocused,
    direction,
    opacity,
    translateX,
    scale,
  ]);

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity,
        transform: [
          { translateX },
          { scale },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}