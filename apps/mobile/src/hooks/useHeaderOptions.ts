import { useTheme } from "./useTheme";

/**
 * Returns consistent header/actionbar options for every screen.
 * Spread into Stack screenOptions or navigation.setOptions().
 *
 * Colors are driven by useTheme() so light/dark mode is handled automatically.
 */
export function useHeaderOptions() {
  const { colors } = useTheme();
  return {
    headerStyle: { backgroundColor: colors.headerBg },
    /** Blue tint for back chevron and headerRight touchable tint */
    headerTintColor: colors.accent,
    headerTitleStyle: {
      fontWeight: "600" as const,
      fontSize: 17,
      color: colors.text,
    },
    headerShadowVisible: false,
    /** Hide "Back" label on iOS — show chevron only */
    headerBackTitle: "",
  };
}
