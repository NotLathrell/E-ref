import React from "react";
import { StyleSheet } from "react-native";
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Pressable } from "react-native";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const OUTER_LAYOUT_PROPS = [
  "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight",
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "marginHorizontal", "marginVertical", "alignSelf", "position",
  "top", "right", "bottom", "left", "flex", "flexGrow", "flexShrink",
  "flexBasis", "aspectRatio",
];

function splitStyle(style) {
  const flattened = StyleSheet.flatten(style) || {};
  const outerStyle = {};
  const innerStyle = { ...flattened };

  OUTER_LAYOUT_PROPS.forEach((key) => {
    if (flattened[key] !== undefined) {
      outerStyle[key] = flattened[key];
      delete innerStyle[key];
    }
  });

  if (outerStyle.width !== undefined) {
    innerStyle.width = "100%";
  }

  return { outerStyle, innerStyle };
}

export function AnimatedTouchableOpacity({
  children,
  style,
  entering,
  exiting,
  onPressIn,
  onPressOut,
  ...props
}) {
  const { outerStyle, innerStyle } = splitStyle(style);
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e) => {
    scale.value = withSpring(0.96, { damping: 15, stiffness: 300 });
    onPressIn?.(e);
  };

  const handlePressOut = (e) => {
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
    onPressOut?.(e);
  };

  return (
    <Animated.View
      entering={entering ?? FadeInUp.springify().damping(15).stiffness(120)}
      exiting={exiting}
      collapsable={false}
      style={outerStyle}
    >
      <AnimatedPressable
        {...props}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[innerStyle, animatedStyle]}
      >
        {children}
      </AnimatedPressable>
    </Animated.View>
  );
}

export default AnimatedTouchableOpacity;