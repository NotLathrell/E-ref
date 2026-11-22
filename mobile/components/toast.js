/**
 * App-wide toast notifications: a single consistent design (dark pill, bottom of the
 * screen, auto-dismissing) used everywhere, with only the icon and its colour telling
 * a success apart from a failure. Confirmations that need a yes/no answer (discard an
 * item, log out) stay as native alerts — a toast cannot ask a question.
 */

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { Ionicons, Text, TouchableOpacity, View } from './themed';
import { LIGHT_COLORS as C } from '../src/theme/ThemeContext';

const ToastContext = createContext(null);
ToastContext.displayName = 'ToastContext';

const TONE = {
  success: { icon: 'checkmark-circle', color: '#6FCF7A' },
  error: { icon: 'close-circle', color: '#F08A7E' }
};

const DISMISS_AFTER_MS = 2800;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  const hideToast = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
  }, [opacity]);

  const showToast = useCallback(
    (message, { type = 'success', onPress } = {}) => {
      if (!message) return;
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, type, onPress });
      opacity.setValue(0);
      translateY.setValue(12);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true })
      ]).start();
      timer.current = setTimeout(hideToast, DISMISS_AFTER_MS);
    },
    [opacity, translateY, hideToast]
  );

  const tone = TONE[toast?.type] || TONE.success;

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      <View style={{ flex: 1 }}>
      {children}

      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            bottom: 96,
            opacity,
            transform: [{ translateY }]
          }}
        >
          <TouchableOpacity
            themed={false}
            activeOpacity={toast.onPress ? 0.85 : 1}
            onPress={() => {
              if (toast.onPress) toast.onPress();
              hideToast();
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: C.text,
              borderRadius: 14,
              paddingVertical: 13,
              paddingHorizontal: 16,
              shadowColor: '#000',
              shadowOpacity: 0.22,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6
            }}
          >
            <Ionicons themed={false} name={tone.icon} size={20} color={tone.color} />
            <Text themed={false} style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginLeft: 10, flex: 1 }}>
              {toast.message}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
