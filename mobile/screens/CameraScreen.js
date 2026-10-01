import { useState } from "react";
import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";

import { analyzeScan, applyFoodChoice, draftFromObject, foodChoicesFromTopK } from "../services/scanPipeline";
import { MAX_EXTRA_ANGLES } from "../services/cnn";
import { scanLabelImage, formatLabelDate } from "../services/ocr";
import { enrichItem } from "../services/enrich";
import { STORAGE_LOCATIONS, CATEGORIES, getFoodById } from "../data/foodCatalog";
import { useInventory } from "../context/InventoryContext";

import { AnimatedScreen } from "../components/animations/AnimatedScreen";
import { DetectionImage, FoodPickerModal, ObjectRow, ReviewBanner, tierColor } from "../components/detection";
import { ManualAddModal } from "../components/inventory";
import { AnimatedTouchableOpacity } from "../components/animations/AnimatedTouchableOpacity";
import { ActivityIndicator, Image, Ionicons, ScrollView, Text, TextInput, View } from "../components/themed";

const COLORS = {
  background: "#FFF7ED",
  card: "#FFEDD5",
  primary: "#C2410C",
  accent: "#9A3412",
  gold: "#FBBF24",
  text: "#431407",
  muted: "#8A6D56",
  border: "#FED7AA",
  white: "#FFFFFF",
  success: "#6F9B72",
  warning: "#D89B3D",
  danger: "#C95C54",
};

const BRAND = COLORS.primary;
const BRAND_GREEN = COLORS.success;

const TIER_TEXT_COLOR = { fresh: "#15803d", subfresh: "#8A5D14", rotten: "#b91c1c" };
const TIER_ICON = {
  fresh: "checkmark-circle-outline",
  subfresh: "alert-circle-outline",
  rotten: "close-circle-outline",
};

function freshnessTierColor(tier) {
  return tierColor(tier);
}

function freshnessTierTextColor(tier) {
  return TIER_TEXT_COLOR[tier] || TIER_TEXT_COLOR.rotten;
}

function freshnessTierIcon(tier) {
  return TIER_ICON[tier] || TIER_ICON.rotten;
}

const FLAG_LABELS = {
  discoloration: "Discoloration",
  texture_abnormality: "Texture issues",
  packaging_damage: "Packaging damage",
  mold_spots: "Mold spots",
  excess_moisture: "Excess moisture",
};

const FLAG_ICONS = {
  discoloration: "color-palette-outline",
  texture_abnormality: "flask-outline",
  packaging_damage: "bandage-outline",
  mold_spots: "leaf-outline",
  excess_moisture: "water-outline",
};

const FLAG_LIST = Object.keys(FLAG_LABELS);

// ─────────────────────────────────────────────────────────────
// Styles (simplified design)
// ─────────────────────────────────────────────────────────────

const screenScrollStyle = {
  flex: 1,
  backgroundColor: COLORS.background,
};

const resultScrollContentStyle = {
  paddingHorizontal: 20,
  paddingTop: 52,
  paddingBottom: 120,
};

const captureScrollContentStyle = {
  paddingHorizontal: 20,
  paddingTop: 40,
  paddingBottom: 120,
};

const headerTitleStyle = {
  fontSize: 26,
  fontWeight: "600",
  color: COLORS.text,
  marginBottom: 6,
};

const headerSubtitleStyle = {
  fontSize: 14,
  color: COLORS.muted,
  lineHeight: 20,
  marginBottom: 18,
};

const cardStyle = {
  backgroundColor: COLORS.white,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: COLORS.border,
  padding: 16,
  marginBottom: 16,
  shadowColor: COLORS.primary,
  shadowOpacity: 0.04,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 1,
};

const sectionTitleRowStyle = {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: 12,
};

const sectionIconBoxStyle = {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: COLORS.card,
  alignItems: "center",
  justifyContent: "center",
  marginRight: 10,
};

const sectionTitleStyle = {
  fontSize: 16,
  fontWeight: "600",
  color: COLORS.text,
};

const sectionSubtitleStyle = {
  fontSize: 12,
  color: COLORS.muted,
  marginTop: 2,
};

const rowBetweenStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: 8,
};

const rowLabelStyle = {
  fontSize: 13,
  color: COLORS.muted,
};

const rowValueStyle = {
  fontSize: 13,
  fontWeight: "600",
  color: COLORS.text,
};

const badgeRowStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  marginTop: 10,
};

const badgeStyle = {
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 999,
  marginRight: 8,
  marginBottom: 8,
};

const badgeTextStyle = {
  fontSize: 12,
  fontWeight: "700",
  color: "#ffffff",
};

const spoilageBarBgStyle = {
  height: 9,
  borderRadius: 999,
  backgroundColor: COLORS.border,
  overflow: "hidden",
  marginTop: 6,
};

const spoilageBarFillStyle = (score = 0) => {
  const safeScore = Math.max(0, Math.min(1, Number(score) || 0));

  return {
    height: "100%",
    width: `${safeScore * 100}%`,
    borderRadius: 999,
    backgroundColor:
      safeScore >= 0.7
        ? COLORS.danger
        : safeScore >= 0.4
          ? COLORS.warning
          : COLORS.success,
  };
};

const indicatorPillStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 999,
  backgroundColor: "#F9E9E5",
  borderWidth: 1,
  borderColor: "#E7C4BA",
  marginRight: 8,
  marginBottom: 8,
};

const indicatorTextStyle = {
  fontSize: 11,
  fontWeight: "600",
  color: COLORS.danger,
  marginLeft: 4,
};

const noIndicatorsBoxStyle = {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#EEF4EA",
  borderWidth: 1,
  borderColor: "#C9DEC8",
  borderRadius: 12,
  padding: 10,
};

const ttiCardStyle = {
  backgroundColor: COLORS.card,
  borderRadius: 16,
  padding: 14,
  marginBottom: 16,
};

const ttiHeaderStyle = {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: 10,
};

const ttiIconBoxStyle = {
  width: 32,
  height: 32,
  borderRadius: 16,
  backgroundColor: BRAND,
  alignItems: "center",
  justifyContent: "center",
  marginRight: 8,
};

const ttiTitleStyle = {
  fontSize: 14,
  fontWeight: "600",
  color: COLORS.text,
};

const ttiSubtitleStyle = {
  fontSize: 11,
  color: COLORS.muted,
  marginTop: 1,
};

const ttiSubCardStyle = {
  backgroundColor: COLORS.white,
  borderRadius: 12,
  padding: 10,
  marginBottom: 8,
};

const urgencyTextStyle = (urgency) => ({
  fontSize: 14,
  fontWeight: "700",
  color:
    urgency === "critical"
      ? "#dc2626"
      : urgency === "high"
        ? "#ea580c"
        : urgency === "moderate"
          ? "#ca8a04"
          : "#16a34a",
});

const primaryActionBoxStyle = {
  backgroundColor: "#F3E4D5",
  borderRadius: 12,
  padding: 10,
};

const primaryActionTitleStyle = {
  fontSize: 13,
  fontWeight: "700",
  color: BRAND,
  marginBottom: 4,
};

const primaryActionLabelStyle = {
  fontSize: 13,
  fontWeight: "600",
  color: COLORS.text,
};

const primaryActionDescStyle = {
  fontSize: 11,
  color: COLORS.muted,
  marginTop: 2,
  lineHeight: 16,
};

// Icon and colour per storage location, so the storage recommendation reads
// at a glance (freezer vs. fridge vs. pantry vs. counter) instead of as plain text.
const STORAGE_ICONS = {
  freezer: { icon: "snow-outline", bg: "#E0F2FE", color: "#0284c7" },
  fridge_top: { icon: "thermometer-outline", bg: "#EFF6FF", color: "#2563eb" },
  fridge_bottom: {
    icon: "thermometer-outline",
    bg: "#EFF6FF",
    color: "#2563eb",
  },
  pantry: {
    icon: "file-tray-stacked-outline",
    bg: "#FDF4E3",
    color: "#b45309",
  },
  counter: { icon: "home-outline", bg: "#F0FDF4", color: "#16a34a" },
};
const DEFAULT_STORAGE_ICON = {
  icon: "cube-outline",
  bg: "#F3E4D5",
  color: BRAND,
};
function storageIconFor(storageId) {
  return STORAGE_ICONS[storageId] || DEFAULT_STORAGE_ICON;
}

const recsSectionTitleStyle = {
  fontSize: 14,
  fontWeight: "700",
  color: COLORS.text,
  marginBottom: 10,
  marginTop: 6,
};

const recCardStyle = {
  backgroundColor: COLORS.card,
  borderRadius: 12,
  padding: 12,
  marginBottom: 10,
};

const recRowStyle = {
  flexDirection: "row",
  alignItems: "flex-start",
};

const recIconBoxStyle = {
  width: 28,
  height: 28,
  borderRadius: 14,
  backgroundColor: "#F3E4D5",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 8,
};

const recLabelStyle = {
  fontSize: 13,
  fontWeight: "600",
  color: COLORS.text,
  flex: 1,
};

const recDescStyle = {
  fontSize: 11,
  color: COLORS.muted,
  marginTop: 2,
  lineHeight: 16,
  flex: 1,
};

const usageIdeaRowStyle = {
  flexDirection: "row",
  alignItems: "flex-start",
  marginBottom: 10,
};

const usageIconBoxStyle = {
  width: 26,
  height: 26,
  borderRadius: 13,
  backgroundColor: "#EEF4EA",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 8,
};

const usageTextStyle = {
  fontSize: 12,
  color: COLORS.text,
  lineHeight: 18,
  flex: 1,
};

const actionButtonStyle = {
  minHeight: 58,
  paddingVertical: 15,
  paddingHorizontal: 20,
  borderRadius: 17,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  marginBottom: 12,
};

const addToShelfButtonStyle = {
  ...actionButtonStyle,
  backgroundColor: BRAND_GREEN,
};

const scanAgainButtonStyle = {
  ...actionButtonStyle,
  backgroundColor: COLORS.white,
  borderWidth: 1,
  borderColor: COLORS.border,
};

const actionButtonTextStyle = {
  color: COLORS.white,
  fontSize: 16,
  fontWeight: "600",
  marginLeft: 9,
};

const scanAgainButtonTextStyle = {
  color: COLORS.text,
  fontSize: 16,
  fontWeight: "600",
  marginLeft: 9,
};

// Capture / Review styles

const previewContainerStyle = {
  height: 220,
  borderRadius: 16,
  overflow: "hidden",
  backgroundColor: COLORS.primary,
  marginBottom: 16,
};

const previewImageStyle = {
  width: "100%",
  height: "100%",
};

const previewEmptyStyle = {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
};

const previewEmptyIconContainerStyle = {
  width: 64,
  height: 64,
  borderRadius: 32,
  backgroundColor: "rgba(255,255,255,0.12)",
  alignItems: "center",
  justifyContent: "center",
};

const previewEmptyTitleStyle = {
  color: "#ffffff",
  fontSize: 15,
  fontWeight: "700",
  marginTop: 12,
};

const previewEmptySubtitleStyle = {
  color: "#D8C9BC",
  fontSize: 12,
  marginTop: 4,
  textAlign: "center",
  paddingHorizontal: 20,
};

const captureButtonStyle = {
  height: 54,
  borderRadius: 10,
  borderWidth: 15,
  backgroundColor: COLORS.border,
  borderColor: COLORS.border,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  marginBottom: 8,
};

const galleryButtonStyle = {
  height: 50,
  borderRadius: 10,
  borderWidth: 15,
  borderColor: COLORS.border,
  backgroundColor: COLORS.border,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
};

const galleryButtonTextStyle = {
  color: BRAND,
  fontSize: 15,
  fontWeight: "700",
  marginLeft: 8,
};

const retakeButtonStyle = {
  minHeight: 54,
  paddingVertical: 14,
  paddingHorizontal: 16,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 16,
  marginBottom: 14,
};

const retakeButtonTextStyle = {
  color: BRAND,
  fontSize: 15,
  fontWeight: "700",
  marginLeft: 8,
};

const fieldLabelStyle = {
  fontSize: 13,
  fontWeight: "700",
  color: COLORS.text,
  marginBottom: 8,
  marginTop: 4,
};

const textInputStyle = {
  height: 44,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: COLORS.border,
  backgroundColor: COLORS.white,
  paddingHorizontal: 12,
  fontSize: 14,
  color: COLORS.text,
  marginBottom: 12,
};

const horizontalScrollContentStyle = {
  paddingVertical: 4,
  paddingRight: 8,
  marginBottom: 14,
};

const categoryPillStyle = (active) => ({
  minHeight: 46,
  paddingHorizontal: 18,
  paddingVertical: 11,
  marginRight: 10,
  marginBottom: 4,
  borderRadius: 23,
  borderWidth: 1,
  borderColor: active ? BRAND : COLORS.border,
  backgroundColor: active ? BRAND : COLORS.white,
  alignItems: "center",
  justifyContent: "center",
});

const categoryPillTextStyle = (active) => ({
  fontSize: 14,
  fontWeight: "600",
  color: active ? COLORS.white : COLORS.text,
});

const storagePillStyle = (active) => ({
  minHeight: 46,
  paddingHorizontal: 18,
  paddingVertical: 11,
  marginRight: 10,
  marginBottom: 4,
  borderRadius: 23,
  borderWidth: 1,
  borderColor: active ? BRAND : COLORS.border,
  backgroundColor: active ? "#F3E4D5" : COLORS.white,
  alignItems: "center",
  justifyContent: "center",
});

const storagePillTextStyle = (active) => ({
  fontSize: 13,
  fontWeight: "600",
  color: active ? BRAND : COLORS.muted,
});

const flagsContainerStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  marginBottom: 18,
};

const flagPillStyle = (active) => ({
  minHeight: 46,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 10,
  marginBottom: 10,
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: 23,
  backgroundColor: active ? "#F9E9E5" : COLORS.white,
  borderWidth: 1,
  borderColor: active ? COLORS.danger : COLORS.border,
});

const flagPillTextStyle = (active) => ({
  fontSize: 13,
  fontWeight: active ? "600" : "400",
  color: active ? COLORS.danger : COLORS.muted,
  marginLeft: 7,
});

const analyzeButtonStyle = {
  minHeight: 58,
  paddingVertical: 15,
  paddingHorizontal: 20,
  borderRadius: 17,
  backgroundColor: BRAND,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  marginBottom: 12,
};

const analyzeButtonTextStyle = {
  color: COLORS.white,
  fontSize: 16,
  fontWeight: "700",
  marginLeft: 9,
};

const cancelButtonStyle = {
  minHeight: 58,
  paddingVertical: 15,
  paddingHorizontal: 20,
  borderRadius: 17,
  borderWidth: 1,
  borderColor: COLORS.border,
  backgroundColor: COLORS.white,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
};

const cancelButtonTextStyle = {
  color: COLORS.muted,
  fontSize: 15,
  fontWeight: "600",
};

const buttonTextStyle = {
  color: BRAND,
  fontSize: 16,
  fontWeight: "600",
  marginLeft: 8,
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function CameraScreen() {
  const navigation = useNavigation();
  const { addItem } = useInventory();

  const [step, setStep] = useState("capture"); // capture | review | result
  const [imageUri, setImageUri] = useState(null);
  const [category, setCategory] = useState("Dairy");
  const [storageId, setStorageId] = useState("fridge_top");
  const [labelText, setLabelText] = useState("");
  const [foodNameOverride, setFoodNameOverride] = useState("");
  const [flags, setFlags] = useState([]);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [preview, setPreview] = useState(null);
  const [labelBusy, setLabelBusy] = useState(false);
  const [labelInfo, setLabelInfo] = useState(null);
  // When the models are unsure the user confirms or corrects the food before saving.
  const [choice, setChoice] = useState(null); // food id picked for the whole-photo result
  const [confirmed, setConfirmed] = useState(false);
  const [picker, setPicker] = useState(null); // null | "single" | a detected object's id
  const [objectChoice, setObjectChoice] = useState({}); // detected object id -> food id
  const [excluded, setExcluded] = useState({}); // detected object id -> true when unticked
  const [manualOpen, setManualOpen] = useState(false); // the add-by-hand form
  const [extraImageUris, setExtraImageUris] = useState([]); // other angles of the same item

  // ---- what the models found, and what the user has decided about it
  const detected = (analysis?.cnn?.objects || []).filter((object) => object.source === "detector");
  const multi = detected.length >= 2;
  const review = analysis?.cnn?.review || null;
  const choices = foodChoicesFromTopK(analysis?.cnn?.identity?.topK);
  const settledFoodId = choice || (confirmed ? analysis?.draftItem?.foodId : null);
  const settledName = settledFoodId ? getFoodById(settledFoodId).name : null;
  const activeDraft = analysis?.draftItem
    ? settledFoodId
      ? applyFoodChoice(analysis.draftItem, settledFoodId, { from: analysis.cnn.identity.foodName })
      : analysis.draftItem
    : null;

  const objectFoodId = (object) => objectChoice[object.id] || object.foodId;
  const includedObjects = detected.filter((object) => !excluded[object.id]);
  const unresolved = includedObjects.filter((object) => objectFoodId(object) === "unknown");
  const blocked = multi
    ? includedObjects.length === 0 || unresolved.length > 0
    : review?.level === "low" && !settledFoodId;

  const toggleFlag = (key) => {
    setFlags((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key],
    );
  };

  const safeNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const formatPercentage = (value) => {
    return `${Math.round(Math.max(0, Math.min(1, safeNumber(value))) * 100)}%`;
  };

  const formatDate = (value) => {
    if (!value) return "Not found";

    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Not found"
      : date.toLocaleDateString();
  };

  const pickImage = async (fromCamera) => {
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          fromCamera
            ? "Allow camera access to take a food photo."
            : "Allow photo access to choose a food image.",
        );
        return;
      }

      const pickerOptions = {
        quality: 0.7,
        allowsEditing: true,
        aspect: [3, 4],
        mediaTypes: ["images"],
      };

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      setImageUri(result.assets[0].uri);
      setExtraImageUris([]);
      setStep("review");
      setAnalysis(null);
      setPreview(null);
    } catch (error) {
      Alert.alert(
        "Unable to select image",
        error?.message || "Please try again.",
      );
    }
  };

  // A photo of the same item from another angle (its back, underside, and so on): a
  // single side can look fresh while the rest is not, so the worst angle checked
  // decides the freshness verdict, not just the first photo taken.
  const addAngle = async (fromCamera) => {
    if (extraImageUris.length >= MAX_EXTRA_ANGLES) return;
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          fromCamera
            ? "Allow camera access to photograph another angle."
            : "Allow photo access to choose another angle.",
        );
        return;
      }

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [3, 4], mediaTypes: ["images"] })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [3, 4], mediaTypes: ["images"] });

      if (result.canceled || !result.assets?.[0]?.uri) return;
      setExtraImageUris((prev) => [...prev, result.assets[0].uri]);
    } catch (error) {
      Alert.alert("Unable to select image", error?.message || "Please try again.");
    }
  };

  const removeAngle = (uri) => {
    setExtraImageUris((prev) => prev.filter((u) => u !== uri));
  };

  const choosePhoto = async (fromCamera) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        fromCamera
          ? "Allow camera access to photograph the label."
          : "Allow photo access to choose a label photo.",
      );
      return null;
    }

    const options = { quality: 0.9, allowsEditing: false, mediaTypes: ["images"] };
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    return result.canceled || !result.assets?.[0]?.uri ? null : result.assets[0].uri;
  };

  const describeLabel = (info) => {
    const expiry = formatLabelDate(info.expiryDate);
    const made = formatLabelDate(info.manufacturingDate);
    if (!expiry && !made) {
      return "No dates found on that photo. Try again in better light, or type the date below.";
    }
    const parts = [];
    if (expiry) parts.push(`Expires ${expiry}`);
    if (made) parts.push(`Made ${made}`);
    return `${parts.join(" · ")}${info.warnings?.length ? `
${info.warnings[0]}` : ""}`;
  };

  const scanLabel = async (fromCamera) => {
    try {
      const uri = await choosePhoto(fromCamera);
      if (!uri) return;

      setLabelBusy(true);
      setLabelInfo(null);
      const info = await scanLabelImage(uri);
      setLabelInfo(info);
      if (info.rawText) setLabelText(info.rawText);
    } catch (error) {
      Alert.alert(
        "Could not read the label",
        error?.message || "Type the dates in the box below instead.",
      );
    } finally {
      setLabelBusy(false);
    }
  };

  const runAnalysis = async () => {
    if (!imageUri) {
      Alert.alert("No image", "Capture or choose a food package photo first.");
      return;
    }

    setBusy(true);

    try {
      const result = await analyzeScan({
        imageUri,
        extraImageUris,
        labelText: labelText.trim(),
        category,
        storageId,
        userFlags: flags,
        packagingDamaged: flags.includes("packaging_damage"),
        foodNameOverride: foodNameOverride.trim() || undefined,
      });

      if (!result?.draftItem) {
        throw new Error("The scan did not return a valid food item.");
      }

      const now = new Date().toISOString();

      const enriched = enrichItem({
        ...result.draftItem,
        imageUri,
        category,
        storageId,
        scannedAt: now,
        createdAt: now,
      });

      setAnalysis(result);
      setPreview(enriched);
      setChoice(null);
      setConfirmed(false);
      setObjectChoice({});
      setExcluded({});
      setStep("result");
    } catch (error) {
      Alert.alert(
        "Scan failed",
        error?.message || "Unable to analyze the image.",
      );
    } finally {
      setBusy(false);
    }
  };

  const saveToShelf = async () => {
    if (!activeDraft) {
      Alert.alert("Nothing to save", "Run an analysis before saving the item.");
      return;
    }
    if (blocked) {
      Alert.alert("Confirm the food", "The models are not sure what this is. Pick the right food first.");
      return;
    }

    setBusy(true);

    try {
      // Save the lean draft; derived fields (risk, TTI, recommendations) are
      // recomputed from it every time the shelf loads.
      await addItem(activeDraft);

      Alert.alert(
        "Saved to shelf",
        `${activeDraft.title || "This item"} was added to your shelf.`,
        [
          {
            text: "View Shelf",
            onPress: () => navigation.navigate("Shelf"),
          },
          {
            text: "Scan Another",
            onPress: reset,
          },
        ],
      );

      // Clear the result so the same item can't be added twice.
      reset();
    } catch (error) {
      Alert.alert("Save failed", error?.message || "Could not save the item.");
    } finally {
      setBusy(false);
    }
  };

  // A photo of several foods: add each ticked food as its own shelf item.
  const saveObjects = async () => {
    if (blocked) {
      Alert.alert(
        "Check the foods",
        unresolved.length
          ? "Choose what the unrecognised food is, or untick it."
          : "Tick at least one food to add.",
      );
      return;
    }

    setBusy(true);
    try {
      for (const object of includedObjects) {
        await addItem(draftFromObject(object, { imageUri, foodId: objectChoice[object.id] }));
      }
      Alert.alert(
        "Saved to shelf",
        `${includedObjects.length} item${includedObjects.length === 1 ? " was" : "s were"} added to your shelf.`,
        [
          { text: "View Shelf", onPress: () => navigation.navigate("Shelf") },
          { text: "Scan Another", onPress: reset },
        ],
      );
      reset();
    } catch (error) {
      Alert.alert("Save failed", error?.message || "Could not save the items.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setChoice(null);
    setConfirmed(false);
    setPicker(null);
    setObjectChoice({});
    setExcluded({});
    setStep("capture");
    setImageUri(null);
    setExtraImageUris([]);
    setCategory("Dairy");
    setStorageId("fridge_top");
    setLabelText("");
    setFoodNameOverride("");
    setFlags([]);
    setAnalysis(null);
    setPreview(null);
    setBusy(false);
    setLabelBusy(false);
    setLabelInfo(null);
  };

  // ───────────────────────────────────────────────────────────
  // Result View
  // ───────────────────────────────────────────────────────────

  if (step === "result" && preview) {
    // A corrected food changes shelf life and advice, so the preview is worked out again.
    const view = choice
      ? enrichItem({
          ...activeDraft,
          imageUri: preview.imageUri,
          storageId: preview.storageId,
          scannedAt: preview.scannedAt,
          createdAt: preview.createdAt,
        })
      : preview;

    return (
      <AnimatedScreen direction="center">
        <ScrollView
          style={screenScrollStyle}
          contentContainerStyle={resultScrollContentStyle}
        >
          {/* Header */}
          <View style={{ marginBottom: 18 }}>
            <Text style={headerTitleStyle}>Scan Result</Text>
            <Text style={headerSubtitleStyle}>Here's what we found</Text>
          </View>

          {/* Food image, with a box around every food the detector found */}
          <DetectionImage
            uri={view.imageUri}
            imageSize={analysis.cnn.imageSize}
            objects={detected}
          />

          {multi ? (
            <>
              <View style={cardStyle}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: COLORS.text }}>
                  {detected.length} foods found
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.muted, marginTop: 4, lineHeight: 17 }}>
                  Each box is a food we found. Untick anything you don't want to add.
                  Amber means we're not sure, so check the name.
                </Text>
              </View>

              {detected.map((object, index) => (
                <ObjectRow
                  key={object.id}
                  index={index}
                  object={object}
                  foodName={objectFoodId(object) === "unknown" ? null : getFoodById(objectFoodId(object)).name}
                  included={!excluded[object.id]}
                  onToggle={() => setExcluded((prev) => ({ ...prev, [object.id]: !prev[object.id] }))}
                  onChange={() => setPicker(object.id)}
                />
              ))}
            </>
          ) : null}

          {!multi ? (
            <>
          {/* Food name + freshness verdict */}
          <View style={cardStyle}>
            <Text
              style={{ fontSize: 18, fontWeight: "800", color: COLORS.text }}
            >
              {view.title}
            </Text>
            {analysis.cnn.identity.confidence > 0 ? (
              <Text style={{ fontSize: 12, color: COLORS.muted, marginTop: 3 }}>
                {Math.round(analysis.cnn.identity.confidence * 100)}% sure of the food
              </Text>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 14,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: freshnessTierColor(analysis.cnn.freshness.tier),
                }}
              >
                <Ionicons
                  name={freshnessTierIcon(analysis.cnn.freshness.tier)}
                  size={26}
                  color="#ffffff"
                />
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: "800",
                    color: freshnessTierTextColor(analysis.cnn.freshness.tier),
                  }}
                >
                  {analysis.cnn.freshness.tierLabel}
                </Text>
                <Text
                  style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}
                >
                  {analysis.cnn.freshness.percent.toFixed(0)}% freshness
                </Text>
              </View>
            </View>

            {analysis.cnn.freshness.agreement === false ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 12,
                  backgroundColor: "#fffbeb",
                  borderWidth: 1,
                  borderColor: "#fde68a",
                  borderRadius: 10,
                  padding: 9,
                }}
              >
                <Ionicons name="alert-circle-outline" size={14} color="#b45309" />
                <Text
                  style={{
                    fontSize: 11,
                    color: "#92400e",
                    marginLeft: 6,
                    flex: 1,
                    lineHeight: 15,
                  }}
                >
                  Uncertain result — inspect this item by hand before deciding.
                </Text>
              </View>
            ) : null}

            {analysis.cnn.anglesChecked > 1 ? (
              <View style={{ marginTop: 12 }}>
                <Text style={{ fontSize: 11, color: COLORS.muted, marginBottom: 6 }}>
                  Checked {analysis.cnn.anglesChecked} angles · showing the least fresh one
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {analysis.cnn.angles.map((angle) => (
                    <View
                      key={angle.index}
                      style={{
                        alignItems: "center",
                        marginRight: 12,
                        opacity: angle.freshnessPercent === analysis.cnn.freshness.percent ? 1 : 0.6,
                      }}
                    >
                      <Image
                        source={{ uri: angle.imageUri }}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 10,
                          borderWidth: angle.freshnessPercent === analysis.cnn.freshness.percent ? 2 : 0,
                          borderColor: freshnessTierColor(angle.freshnessTier),
                        }}
                      />
                      <Text style={{ fontSize: 10, color: COLORS.muted, marginTop: 3 }}>
                        {Math.round(angle.freshnessPercent)}%
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <ReviewBanner
              review={review}
              foodName={analysis.cnn.identity.foodName}
              choices={choices}
              resolved={settledName}
              onConfirm={() => setConfirmed(true)}
              onChoose={(foodId) => setChoice(foodId)}
              onOther={() => setPicker("single")}
            />
          </View>

          {/* Expiry & manufactured dates */}
          {analysis?.ocr?.expiryDate || analysis?.ocr?.manufacturingDate ? (
            <View style={cardStyle}>
              <View style={sectionTitleRowStyle}>
                <View style={sectionIconBoxStyle}>
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={BRAND}
                  />
                </View>
                <Text style={sectionTitleStyle}>Dates</Text>
              </View>

              {analysis?.ocr?.expiryDate ? (
                <View style={rowBetweenStyle}>
                  <Text style={rowLabelStyle}>Expiry</Text>
                  <Text style={rowValueStyle}>
                    {formatDate(analysis.ocr.expiryDate)}
                  </Text>
                </View>
              ) : null}

              {analysis?.ocr?.manufacturingDate ? (
                <View style={rowBetweenStyle}>
                  <Text style={rowLabelStyle}>Manufactured</Text>
                  <Text style={rowValueStyle}>
                    {formatDate(analysis.ocr.manufacturingDate)}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Visible Indicators */}
          <View style={cardStyle}>
            <View style={sectionTitleRowStyle}>
              <View
                style={[sectionIconBoxStyle, { backgroundColor: "#F9E9E5" }]}
              >
                <Ionicons name="eye-outline" size={18} color={COLORS.danger} />
              </View>
              <Text style={sectionTitleStyle}>Visible Indicators</Text>
            </View>

            {analysis?.cnn?.spoilage?.detectedIndicators?.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {analysis.cnn.spoilage.detectedIndicators.map((key) => (
                  <View key={key} style={indicatorPillStyle}>
                    <Ionicons
                      name={FLAG_ICONS[key]}
                      size={18}
                      color={COLORS.danger}
                    />
                    <Text style={indicatorTextStyle}>
                      {FLAG_LABELS[key] || key}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={noIndicatorsBoxStyle}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={COLORS.success}
                />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: COLORS.success,
                    marginLeft: 6,
                    flex: 1,
                  }}
                >
                  No significant spoilage indicators detected
                </Text>
              </View>
            )}

            {Object.keys(analysis?.cnn?.spoilage?.indicators || {}).length >
            0 ? (
              <View style={{ marginTop: 12 }}>
                {FLAG_LIST.map((key) => {
                  const score = analysis.cnn.spoilage.indicators[key] ?? 0;
                  return (
                    <View key={key} style={{ marginBottom: 8 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          marginBottom: 3,
                        }}
                      >
                        <Text style={{ fontSize: 11, color: COLORS.text }}>
                          {FLAG_LABELS[key]}
                        </Text>
                        <Text style={{ fontSize: 11, color: COLORS.muted }}>
                          {(score * 100).toFixed(0)}%
                        </Text>
                      </View>
                      <View
                        style={{
                          height: 5,
                          borderRadius: 3,
                          backgroundColor: COLORS.border,
                          overflow: "hidden",
                        }}
                      >
                        <View
                          style={{
                            height: "100%",
                            width: `${Math.min(100, score * 100)}%`,
                            backgroundColor:
                              score >= 0.5 ? "#ef4444" : COLORS.muted,
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>

          {/* Remaining food life */}
          <View style={ttiCardStyle}>
            <View style={ttiHeaderStyle}>
              <View style={ttiIconBoxStyle}>
                <Ionicons name="time-outline" size={16} color="#ffffff" />
              </View>
              <Text style={ttiTitleStyle}>Remaining Food Life</Text>
            </View>

            <View style={ttiSubCardStyle}>
              <Text
                style={{ fontSize: 18, fontWeight: "800", color: COLORS.text }}
              >
                {view.daysLabel}
              </Text>
            </View>
          </View>

          {/* Recommendations */}
          <View style={cardStyle}>
            <View style={sectionTitleRowStyle}>
              <View
                style={[sectionIconBoxStyle, { backgroundColor: "#fef3c7" }]}
              >
                <Ionicons name="bulb-outline" size={18} color="#d97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sectionTitleStyle}>Recommendations</Text>
                <Text style={sectionSubtitleStyle}>
                  Suggested actions based on food condition
                </Text>
              </View>
            </View>

            <Text style={recsSectionTitleStyle}>Recommended Actions</Text>

            {view.recommendations.ruleBased?.length > 0 ? (
              view.recommendations.ruleBased.map((action) => (
                <View key={action.id} style={recCardStyle}>
                  <View style={recRowStyle}>
                    <View style={recIconBoxStyle}>
                      <Ionicons
                        name="checkmark-outline"
                        size={14}
                        color={BRAND}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={recLabelStyle}>{action.label}</Text>
                      <Text style={recDescStyle}>{action.description}</Text>
                    </View>
                  </View>
                </View>
              ))
            ) : (
              <View style={recCardStyle}>
                <Text style={{ fontSize: 12, color: "#64748b" }}>
                  No additional actions available.
                </Text>
              </View>
            )}

            <Text style={recsSectionTitleStyle}>Storage & Preservation</Text>

            {view.recommendations.bestPractice ? (
              <View style={recCardStyle}>
                <View style={recRowStyle}>
                  <View
                    style={[
                      recIconBoxStyle,
                      {
                        backgroundColor: storageIconFor(
                          view.recommendations.bestPractice.storageId,
                        ).bg,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        storageIconFor(
                          view.recommendations.bestPractice.storageId,
                        ).icon
                      }
                      size={14}
                      color={
                        storageIconFor(
                          view.recommendations.bestPractice.storageId,
                        ).color
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={recLabelStyle}>
                      {view.recommendations.bestPractice.storageLabel}
                    </Text>
                    <Text style={recDescStyle}>
                      Best place to keep this item, around{" "}
                      {view.recommendations.bestPractice.storageTempC}
                      °C.
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}

            {view.recommendations.contentBased?.storageSuggestions
              ?.slice(1)
              .map((tip, index) => (
                <View key={`storage-${index}`} style={usageIdeaRowStyle}>
                  <View
                    style={[
                      usageIconBoxStyle,
                      { backgroundColor: "#E7F0FA" },
                    ]}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={13}
                      color="#2563eb"
                    />
                  </View>
                  <Text style={usageTextStyle}>{tip}</Text>
                </View>
              ))}

            <View style={recCardStyle}>
              <View style={recRowStyle}>
                <View
                  style={[recIconBoxStyle, { backgroundColor: "#E0F2FE" }]}
                >
                  <Ionicons name="snow-outline" size={14} color="#0284c7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={recLabelStyle}>
                    {view.recommendations.bestPractice?.freezeable
                      ? "Can be frozen"
                      : "Do not freeze"}
                  </Text>
                  <Text style={recDescStyle}>
                    {view.recommendations.bestPractice?.freezeBy}
                  </Text>
                </View>
              </View>
            </View>

            {view.recommendations.contentBased?.preservationSuggestions?.map(
              (tip, index) => (
                <View key={`preserve-${index}`} style={usageIdeaRowStyle}>
                  <View
                    style={[
                      usageIconBoxStyle,
                      { backgroundColor: "#E0F2FE" },
                    ]}
                  >
                    <Ionicons
                      name="snow-outline"
                      size={13}
                      color="#0284c7"
                    />
                  </View>
                  <Text style={usageTextStyle}>{tip}</Text>
                </View>
              ),
            )}

            <Text style={recsSectionTitleStyle}>Usage Ideas</Text>

            {view.recommendations.contentBased?.usageSuggestions?.length >
            0 ? (
              view.recommendations.contentBased.usageSuggestions.map(
                (tip, index) => (
                  <View key={`${tip}-${index}`} style={usageIdeaRowStyle}>
                    <View style={usageIconBoxStyle}>
                      <Ionicons
                        name="restaurant-outline"
                        size={13}
                        color="#16a34a"
                      />
                    </View>
                    <Text style={usageTextStyle}>{tip}</Text>
                  </View>
                ),
              )
            ) : (
              <Text style={{ fontSize: 12, color: "#64748b" }}>
                No usage suggestions available.
              </Text>
            )}
          </View>

            </>
          ) : null}

          {/* Final Actions */}
          <View style={{ marginTop: 4, marginBottom: 4 }}>
            <AnimatedTouchableOpacity
              activeOpacity={0.85}
              style={addToShelfButtonStyle}
              onPress={multi ? saveObjects : saveToShelf}
              disabled={busy || blocked}
            >
              {busy ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <ActivityIndicator color={COLORS.white} />
                  <Text style={actionButtonTextStyle}>Saving...</Text>
                </View>
              ) : (
                <>
                  <Ionicons
                    name="add-circle-outline"
                    size={23}
                    color={COLORS.white}
                  />
                  <Text style={actionButtonTextStyle}>
                    {blocked
                      ? multi && !unresolved.length
                        ? "Tick a food to add"
                        : "Confirm the food to add it"
                      : multi
                        ? `Add ${includedObjects.length} to Shelf`
                        : "Add to Shelf"}
                  </Text>
                </>
              )}
            </AnimatedTouchableOpacity>

            <AnimatedTouchableOpacity
              activeOpacity={0.8}
              style={scanAgainButtonStyle}
              onPress={reset}
              disabled={busy}
            >
              <Ionicons name="camera-outline" size={21} color={COLORS.text} />
              <Text style={scanAgainButtonTextStyle}>Scan Again</Text>
            </AnimatedTouchableOpacity>
          </View>
        </ScrollView>

        <FoodPickerModal
          visible={picker !== null}
          onClose={() => setPicker(null)}
          onPick={(foodId) => {
            if (picker === "single") setChoice(foodId);
            else setObjectChoice((prev) => ({ ...prev, [picker]: foodId }));
            setPicker(null);
          }}
        />
      </AnimatedScreen>
    );
  }

  // ───────────────────────────────────────────────────────────
  // Capture / Review UI
  // ───────────────────────────────────────────────────────────

  return (
    <AnimatedScreen>
      <ScrollView
        style={screenScrollStyle}
        contentContainerStyle={captureScrollContentStyle}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ marginBottom: 18 }}>
          <Text style={headerTitleStyle}>Scan</Text>
          <Text style={headerSubtitleStyle}>
            {step === "review"
              ? "Review the details below, then run the analysis to detect freshness and spoilage."
              : "Capture food packaging to analyze its freshness, expiry information, and spoilage indicators."}
          </Text>
        </View>

        {/* Camera Preview: a fixed-colour placeholder box, so its white-on-brand
            text and icon stay readable no matter what the brand colour is set to
            or which theme is active. */}
        <View themed={false} style={previewContainerStyle}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={previewImageStyle}
              resizeMode="cover"
            />
          ) : (
            <View themed={false} style={previewEmptyStyle}>
              <View themed={false} style={previewEmptyIconContainerStyle}>
                <Ionicons themed={false} name="camera-outline" size={32} color="#ffffff" />
              </View>

              <Text themed={false} style={previewEmptyTitleStyle}>No image selected</Text>

              <Text themed={false} style={previewEmptySubtitleStyle}>
                Take a photo or choose one from your gallery
              </Text>
            </View>
          )}
        </View>

        {/* Capture buttons shown only on the capture step */}
        {step === "capture" && (
          <>
            <AnimatedTouchableOpacity
              activeOpacity={0.85}
              onPress={() => pickImage(true)}
              style={captureButtonStyle}
            >
              <Ionicons name="camera" size={20} color={BRAND} />
              <Text style={buttonTextStyle}>Open Camera</Text>
            </AnimatedTouchableOpacity>

            <AnimatedTouchableOpacity
              activeOpacity={0.85}
              onPress={() => pickImage(false)}
              style={galleryButtonStyle}
            >
              <Ionicons name="images-outline" size={20} color={BRAND} />
              <Text style={galleryButtonTextStyle}>Choose from Gallery</Text>
            </AnimatedTouchableOpacity>

            <AnimatedTouchableOpacity
              activeOpacity={0.85}
              onPress={() => setManualOpen(true)}
              style={galleryButtonStyle}
            >
              <Ionicons name="create-outline" size={20} color={BRAND} />
              <Text style={galleryButtonTextStyle}>Add food by hand</Text>
            </AnimatedTouchableOpacity>
          </>
        )}

        {/* Review Section */}
        {step === "review" && (
          <>
            {/* Change photo */}
            <View
              style={{
                flexDirection: "row",
                marginBottom: 14,
              }}
            >
              <AnimatedTouchableOpacity
                activeOpacity={0.85}
                onPress={() => pickImage(true)}
                style={[
                  retakeButtonStyle,
                  {
                    flex: 1,
                    marginRight: 6,
                    marginBottom: 0,
                    borderRadius: 14,
                    backgroundColor: "#F3E4D5",
                  },
                ]}
              >
                <Ionicons
                  name="camera-reverse-outline"
                  size={16}
                  color={BRAND}
                />
                <Text style={retakeButtonTextStyle}>Retake</Text>
              </AnimatedTouchableOpacity>

              <AnimatedTouchableOpacity
                activeOpacity={0.85}
                onPress={() => pickImage(false)}
                style={[
                  retakeButtonStyle,
                  {
                    flex: 1,
                    marginLeft: 6,
                    marginBottom: 0,
                    borderRadius: 14,
                    backgroundColor: COLORS.card,
                  },
                ]}
              >
                <Ionicons name="images-outline" size={16} color={BRAND} />
                <Text style={retakeButtonTextStyle}>Gallery</Text>
              </AnimatedTouchableOpacity>
            </View>

            {/* Food name override */}
            <Text style={fieldLabelStyle}>Food Name</Text>
            <TextInput
              value={foodNameOverride}
              onChangeText={setFoodNameOverride}
              placeholder="Leave blank to auto-detect"
              placeholderTextColor={COLORS.muted}
              style={textInputStyle}
            />

            {/* Category selector */}
            <Text style={fieldLabelStyle}>Category</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={horizontalScrollContentStyle}
            >
              {CATEGORIES.filter((c) => c !== "All").map((cat) => {
                const active = category === cat;
                return (
                  <AnimatedTouchableOpacity
                    key={cat}
                    onPress={() => setCategory(cat)}
                    activeOpacity={0.8}
                    style={categoryPillStyle(active)}
                  >
                    <Text style={categoryPillTextStyle(active)}>{cat}</Text>
                  </AnimatedTouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Storage selector */}
            <Text style={fieldLabelStyle}>Storage</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={horizontalScrollContentStyle}
            >
              {STORAGE_LOCATIONS.map((loc) => {
                const active = storageId === loc.id;
                return (
                  <AnimatedTouchableOpacity
                    key={loc.id}
                    onPress={() => setStorageId(loc.id)}
                    activeOpacity={0.8}
                    style={storagePillStyle(active)}
                  >
                    <Text style={storagePillTextStyle(active)}>
                      {loc.label}
                    </Text>
                  </AnimatedTouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Package label: scan it, or type it */}
            <Text style={fieldLabelStyle}>Package Label (optional)</Text>
            <View style={{ flexDirection: "row", marginBottom: 10 }}>
              <AnimatedTouchableOpacity
                activeOpacity={0.85}
                onPress={() => scanLabel(true)}
                disabled={labelBusy}
                style={[
                  retakeButtonStyle,
                  {
                    flex: 1,
                    marginRight: 6,
                    marginBottom: 0,
                    borderRadius: 14,
                    backgroundColor: "#F3E4D5",
                  },
                ]}
              >
                {labelBusy ? (
                  <ActivityIndicator color={BRAND} />
                ) : (
                  <Ionicons name="scan-outline" size={16} color={BRAND} />
                )}
                <Text style={retakeButtonTextStyle}>
                  {labelBusy ? "Reading..." : "Scan label"}
                </Text>
              </AnimatedTouchableOpacity>

              <AnimatedTouchableOpacity
                activeOpacity={0.85}
                onPress={() => scanLabel(false)}
                disabled={labelBusy}
                style={[
                  retakeButtonStyle,
                  {
                    flex: 1,
                    marginLeft: 6,
                    marginBottom: 0,
                    borderRadius: 14,
                    backgroundColor: COLORS.card,
                  },
                ]}
              >
                <Ionicons name="images-outline" size={16} color={BRAND} />
                <Text style={retakeButtonTextStyle}>From gallery</Text>
              </AnimatedTouchableOpacity>
            </View>

            {labelInfo ? (
              <Text
                style={{
                  color: labelInfo.fieldsFound?.expiry ? COLORS.success : COLORS.muted,
                  fontSize: 13,
                  fontWeight: "600",
                  marginBottom: 8,
                }}
              >
                {describeLabel(labelInfo)}
              </Text>
            ) : null}

            <TextInput
              value={labelText}
              onChangeText={(text) => {
                setLabelText(text);
                setLabelInfo(null);
              }}
              multiline
              placeholder="Or type the label, e.g. EXP: 15/09/2026"
              placeholderTextColor={COLORS.muted}
              style={textInputStyle}
            />

            {/* Other angles */}
            <Text style={fieldLabelStyle}>Other Angles (optional)</Text>
            <Text style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10, lineHeight: 17 }}>
              One photo only shows one side. Add the back or underside and the least
              fresh angle sets the result.
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 4 }}
            >
              {extraImageUris.map((uri) => (
                <View key={uri} style={{ marginRight: 10 }}>
                  <Image
                    source={{ uri }}
                    style={{ width: 64, height: 64, borderRadius: 12 }}
                  />
                  <AnimatedTouchableOpacity
                    onPress={() => removeAngle(uri)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove this angle"
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: COLORS.danger,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="close" size={13} color="#ffffff" />
                  </AnimatedTouchableOpacity>
                </View>
              ))}

              {extraImageUris.length < MAX_EXTRA_ANGLES ? (
                <AnimatedTouchableOpacity
                  onPress={() =>
                    Alert.alert("Add another angle", "Photograph another side of this same item.", [
                      { text: "Camera", onPress: () => addAngle(true) },
                      { text: "Gallery", onPress: () => addAngle(false) },
                      { text: "Cancel", style: "cancel" },
                    ])
                  }
                  activeOpacity={0.8}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    borderColor: COLORS.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="add" size={22} color={BRAND} />
                </AnimatedTouchableOpacity>
              ) : null}
            </ScrollView>

            {/* Spoilage flags */}
            <Text style={fieldLabelStyle}>Spoilage Indicators</Text>
            <View style={flagsContainerStyle}>
              {FLAG_LIST.map((key) => {
                const active = flags.includes(key);
                return (
                  <AnimatedTouchableOpacity
                    key={key}
                    onPress={() => toggleFlag(key)}
                    activeOpacity={0.8}
                    style={flagPillStyle(active)}
                  >
                    <Ionicons
                      name={FLAG_ICONS[key]}
                      size={14}
                      color={active ? "#ef4444" : "#64748b"}
                    />
                    <Text style={flagPillTextStyle(active)}>
                      {FLAG_LABELS[key]}
                    </Text>
                  </AnimatedTouchableOpacity>
                );
              })}
            </View>

            {/* Analyze button */}
            <AnimatedTouchableOpacity
              activeOpacity={0.85}
              onPress={runAnalysis}
              disabled={busy}
              style={analyzeButtonStyle}
            >
              {busy ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <ActivityIndicator color={COLORS.white} />
                  <Text style={buttonTextStyle}>Analyzing...</Text>
                </View>
              ) : (
                <>
                  <Ionicons
                    name="scan-outline"
                    size={21}
                    color={COLORS.white}
                  />
                  <Text style={analyzeButtonTextStyle}>Analyze</Text>
                </>
              )}
            </AnimatedTouchableOpacity>

            <AnimatedTouchableOpacity
              activeOpacity={0.85}
              onPress={reset}
              style={cancelButtonStyle}
            >
              <Text style={cancelButtonTextStyle}>Cancel</Text>
            </AnimatedTouchableOpacity>
          </>
        )}
      </ScrollView>

      <ManualAddModal
        visible={manualOpen}
        onClose={() => setManualOpen(false)}
        onSave={async (draft) => {
          await addItem(draft);
          Alert.alert("Saved to shelf", `${draft.title} was added to your shelf.`);
        }}
      />
    </AnimatedScreen>
  );
}
