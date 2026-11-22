/**
 * Keeps the app usable on tablets and unusually large phones, where a layout designed
 * for a phone-width screen would otherwise stretch edge to edge and look wrong (text
 * lines too long to read, buttons stretched thin, cards with huge empty gutters).
 *
 * `useIsTablet` reports when the window is tablet-wide. `ResponsiveStage` fills the
 * screen as normal below that width; above it, it holds its children to a centred
 * column `TABLET_CONTENT_RATIO` of the screen's width, same as a reading pane in a
 * tablet-aware app.
 */

import { useWindowDimensions, View } from 'react-native';

/** Screens at least this wide count as a tablet rather than just a large phone. */
export const TABLET_BREAKPOINT = 768;

/** On a tablet, the main content fills this share of the screen's width, not all of it. */
export const TABLET_CONTENT_RATIO = 0.7;

export function useIsTablet() {
  const { width } = useWindowDimensions();
  return width >= TABLET_BREAKPOINT;
}

export function useContentWidth() {
  const { width } = useWindowDimensions();
  return width >= TABLET_BREAKPOINT ? width * TABLET_CONTENT_RATIO : width;
}

/** Wrap a screen's root content in this so it narrows and centres itself on a tablet. */
export function ResponsiveStage({ children }) {
  const isTablet = useIsTablet();
  const width = useContentWidth();

  if (!isTablet) return <View style={{ flex: 1 }}>{children}</View>;

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ flex: 1, width }}>{children}</View>
    </View>
  );
}
