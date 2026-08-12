import { useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { analyzeScan } from "../services/scanPipeline";
import { enrichItem } from "../services/enrich";
import { STORAGE_LOCATIONS, CATEGORIES } from "../data/foodCatalog";
import { useInventory } from "../context/InventoryContext";

const BRAND = "#16567b";
const BRAND_GREEN = "#44ae5f";

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
  backgroundColor: "#ffffff",
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
  fontWeight: "800",
  color: "#0f172a",
  marginBottom: 6,
};

const headerSubtitleStyle = {
  fontSize: 14,
  color: "#64748b",
  lineHeight: 20,
  marginBottom: 18,
};

const cardStyle = {
  backgroundColor: "#ffffff",
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "#e2e8f0",
  padding: 16,
  marginBottom: 16,
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
  backgroundColor: "#eef2ff",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 10,
};

const sectionTitleStyle = {
  fontSize: 16,
  fontWeight: "700",
  color: "#0f172a",
};

const sectionSubtitleStyle = {
  fontSize: 12,
  color: "#64748b",
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
  color: "#475569",
};

const rowValueStyle = {
  fontSize: 13,
  fontWeight: "600",
  color: "#0f172a",
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
  height: 8,
  borderRadius: 999,
  backgroundColor: "#e2e8f0",
  overflow: "hidden",
  marginTop: 6,
};

const spoilageBarFillStyle = (score) => ({
  height: "100%",
  width: `${Math.min(100, score * 100)}%`,
  backgroundColor:
    score >= 0.7 ? "#ef4444" : score >= 0.4 ? "#f59e0b" : "#22c55e",
});

const indicatorPillStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 999,
  backgroundColor: "#fef2f2",
  borderWidth: 1,
  borderColor: "#fecaca",
  marginRight: 8,
  marginBottom: 8,
};

const indicatorTextStyle = {
  fontSize: 11,
  fontWeight: "600",
  color: "#dc2626",
  marginLeft: 4,
};

const noIndicatorsBoxStyle = {
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "#f0fdf4",
  borderWidth: 1,
  borderColor: "#bbf7d0",
  borderRadius: 12,
  padding: 10,
};

const ttiCardStyle = {
  backgroundColor: "#f1f5f9",
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
  fontWeight: "700",
  color: "#0f172a",
};

const ttiSubtitleStyle = {
  fontSize: 11,
  color: "#64748b",
  marginTop: 1,
};

const ttiSubCardStyle = {
  backgroundColor: "#ffffff",
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
  backgroundColor: "#e0f2fe",
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
  color: "#0f172a",
};

const primaryActionDescStyle = {
  fontSize: 11,
  color: "#475569",
  marginTop: 2,
  lineHeight: 16,
};

const recsSectionTitleStyle = {
  fontSize: 14,
  fontWeight: "700",
  color: "#0f172a",
  marginBottom: 10,
  marginTop: 6,
};

const recCardStyle = {
  backgroundColor: "#f8fafc",
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
  backgroundColor: "#e0f2fe",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 8,
};

const recLabelStyle = {
  fontSize: 13,
  fontWeight: "600",
  color: "#0f172a",
  flex: 1,
};

const recDescStyle = {
  fontSize: 11,
  color: "#475569",
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
  backgroundColor: "#f0fdf4",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 8,
};

const usageTextStyle = {
  fontSize: 12,
  color: "#334155",
  lineHeight: 18,
  flex: 1,
};

const actionButtonStyle = {
  height: 52,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  marginBottom: 10,
};

const addToShelfButtonStyle = {
  ...actionButtonStyle,
  backgroundColor: BRAND_GREEN,
};

const scanAgainButtonStyle = {
  ...actionButtonStyle,
  backgroundColor: "#ffffff",
  borderWidth: 1,
  borderColor: "#cbd5e1",
};

const actionButtonTextStyle = {
  color: "#ffffff",
  fontSize: 15,
  fontWeight: "800",
  marginLeft: 8,
};

const scanAgainButtonTextStyle = {
  color: "#334155",
  fontSize: 15,
  fontWeight: "700",
  marginLeft: 8,
};

// Capture / Review styles

const previewContainerStyle = {
  height: 220,
  borderRadius: 16,
  overflow: "hidden",
  backgroundColor: "#0f172a",
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
  color: "#cbd5e1",
  fontSize: 12,
  marginTop: 4,
  textAlign: "center",
  paddingHorizontal: 20,
};

const captureButtonStyle = {
  height: 50,
  borderRadius: 12,
  backgroundColor: BRAND_GREEN,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  marginBottom: 10,
};

const galleryButtonStyle = {
  height: 50,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: BRAND,
  backgroundColor: "#ffffff",
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
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 14,
};

const retakeButtonTextStyle = {
  color: BRAND,
  fontSize: 13,
  fontWeight: "600",
};

const fieldLabelStyle = {
  fontSize: 13,
  fontWeight: "700",
  color: "#0f172a",
  marginBottom: 8,
  marginTop: 4,
};

const textInputStyle = {
  height: 44,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: "#e2e8f0",
  backgroundColor: "#ffffff",
  paddingHorizontal: 12,
  fontSize: 14,
  color: "#0f172a",
  marginBottom: 12,
};

const horizontalScrollContentStyle = {
  marginBottom: 12,
};

const categoryPillStyle = (active) => ({
  marginRight: 8,
  height: 32,
  paddingHorizontal: 14,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: BRAND,
  backgroundColor: active ? BRAND : "#ffffff",
  alignItems: "center",
  justifyContent: "center",
});

const categoryPillTextStyle = (active) => ({
  fontSize: 12,
  fontWeight: "600",
  color: active ? "#ffffff" : "#0f172a",
});

const storagePillStyle = (active) => ({
  marginRight: 8,
  height: 32,
  paddingHorizontal: 12,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: active ? BRAND : "#e2e8f0",
  backgroundColor: active ? "#eef4fb" : "#ffffff",
  alignItems: "center",
  justifyContent: "center",
});

const storagePillTextStyle = (active) => ({
  fontSize: 11,
  fontWeight: "600",
  color: active ? BRAND : "#475569",
});

const flagsContainerStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  marginBottom: 16,
};

const flagPillStyle = (active) => ({
  flexDirection: "row",
  alignItems: "center",
  marginRight: 8,
  marginBottom: 8,
  height: 34,
  paddingHorizontal: 10,
  borderRadius: 17,
  backgroundColor: active ? "#fee2e2" : "#f1f5f9",
  borderWidth: 1,
  borderColor: active ? "#ef4444" : "#e2e8f0",
});

const flagPillTextStyle = (active) => ({
  fontSize: 11,
  fontWeight: active ? "700" : "500",
  color: active ? "#b91c1c" : "#475569",
  marginLeft: 4,
});

const analyzeButtonStyle = {
  height: 50,
  borderRadius: 12,
  backgroundColor: BRAND,
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "row",
  marginBottom: 10,
};

const cancelButtonStyle = {
  height: 46,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "#e2e8f0",
  backgroundColor: "#ffffff",
  alignItems: "center",
  justifyContent: "center",
};

const cancelButtonTextStyle = {
  color: "#475569",
  fontSize: 14,
  fontWeight: "600",
};

const buttonTextStyle = {
  color: "#ffffff",
  fontSize: 15,
  fontWeight: "800",
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

  const toggleFlag = (key) => {
    setFlags((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key],
    );
  };

  const pickImage = async (fromCamera) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Allow camera/photo access to scan food packaging.",
      );
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          quality: 0.7,
          allowsEditing: true,
          aspect:,[3][4]
        })
      : await ImagePicker.launchImageLibraryAsync({
          quality: 0.7,
          allowsEditing: true,
          aspect:,[3][4]
        });

    if (!result.canceled && result.assets?.?.uri) {
      setImageUri(result.assets.uri);
      setStep("review");
      setAnalysis(null);
      setPreview(null);
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
        labelText,
        category,
        storageId,
        userFlags: flags,
        packagingDamaged: flags.includes("packaging_damage"),
        foodNameOverride: foodNameOverride.trim() || undefined,
      });
      const enriched = enrichItem({
        ...result.draftItem,
        scannedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      setAnalysis(result);
      setPreview(enriched);
      setStep("result");
    } catch (err) {
      Alert.alert("Scan failed", err.message || "Unable to analyze image.");
    } finally {
      setBusy(false);
    }
  };

  const saveToShelf = async () => {
    if (!analysis?.draftItem) return;
    setBusy(true);
    try {
      await addItem(analysis.draftItem);
      Alert.alert(
        "Saved",
        `${analysis.draftItem.title} was added to your shelf.`,
        [
          { text: "View Shelf", onPress: () => navigation.navigate("Shelf") },
          { text: "Scan Another", onPress: reset },
        ],
      );
      reset();
    } catch (err) {
      Alert.alert("Error", err.message || "Could not save item.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep("capture");
    setImageUri(null);
    setLabelText("");
    setFoodNameOverride("");
    setFlags([]);
    setAnalysis(null);
    setPreview(null);
  };

  // ───────────────────────────────────────────────────────────
  // Result View
  // ───────────────────────────────────────────────────────────

  if (step === "result" && preview) {
    return (
      <ScrollView
        style={screenScrollStyle}
        contentContainerStyle={resultScrollContentStyle}
      >
        {/* Header */}
        <View style={{ marginBottom: 18 }}>
          <Text style={headerTitleStyle}>Scan Result</Text>
          <Text style={headerSubtitleStyle}>
            OCR + CNN + TTI + risk scoring complete
          </Text>
        </View>

        {/* Food Image */}
        <View
          style={{
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: "#e2e8f0",
            marginBottom: 16,
          }}
        >
          {preview.imageUri ? (
            <Image
              source={{ uri: preview.imageUri }}
              style={{ width: "100%", height: 200 }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: "100%",
                height: 200,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="image-outline" size={40} color="#94a3b8" />
              <Text
                style={{ color: "#94a3b8", fontSize: 13, marginTop: 6 }}
              >
                No image available
              </Text>
            </View>
          )}
        </View>

        {/* Food Summary */}
        <View style={cardStyle}>
          <Text
            style={{ fontSize: 18, fontWeight: "800", color: "#0f172a" }}
          >
            {preview.title}
          </Text>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 4,
            }}
          >
            <Text style={{ fontSize: 12, color: "#64748b" }}>
              {preview.category}
            </Text>
            <Text style={{ color: "#e2e8f0", marginHorizontal: 6 }}>- </Text>
            <Text style={{ fontSize: 12, color: "#64748b" }}>
              {preview.subtitle}
            </Text>
          </View>

          <View style={badgeRowStyle}>
            <View
              style={[
                badgeStyle,
                {
                  backgroundColor: preview.freshnessLabel
                    ?.toLowerCase()
                    .includes("fresh")
                    ? "#22c55e"
                    : "#ef4444",
                },
              ]}
            >
              <Text style={badgeTextStyle}>{preview.freshnessLabel}</Text>
            </View>

            <View style={[badgeStyle, { backgroundColor: BRAND }]}>
              <Text style={badgeTextStyle}>
                Risk {(preview.riskScore * 100).toFixed(0)}%
              </Text>
            </View>

            <View
              style={[badgeStyle, { backgroundColor: "#e2e8f0" }]}
            >
              <Text
                style={{ fontSize: 12, fontWeight: "700", color: "#334155" }}
              >
                {preview.daysLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* OCR Extraction */}
        <View style={cardStyle}>
          <View style={sectionTitleRowStyle}>
            <View style={sectionIconBoxStyle}>
              <Ionicons name="document-text-outline" size={18} color={BRAND} />
            </View>
            <View>
              <Text style={sectionTitleStyle}>OCR Extraction</Text>
              <Text style={sectionSubtitleStyle}>
                Information extracted from the food label
              </Text>
            </View>
          </View>

          <View style={rowBetweenStyle}>
            <Text style={rowLabelStyle}>Expiry</Text>
            <Text style={rowValueStyle}>
              {analysis.ocr.expiryDate
                ? new Date(analysis.ocr.expiryDate).toLocaleDateString()
                : "Not found"}
            </Text>
          </View>

          <View style={rowBetweenStyle}>
            <Text style={rowLabelStyle}>Manufactured</Text>
            <Text style={rowValueStyle}>
              {analysis.ocr.manufacturingDate
                ? new Date(analysis.ocr.manufacturingDate).toLocaleDateString()
                : "Not found"}
            </Text>
          </View>

          <View style={rowBetweenStyle}>
            <Text style={rowLabelStyle}>Confidence</Text>
            <Text style={rowValueStyle}>
              {(analysis.ocr.confidence * 100).toFixed(0)}%
            </Text>
          </View>

          <View
            style={{
              marginTop: 6,
              backgroundColor: "#f8fafc",
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ fontSize: 11, color: "#64748b" }}>
              Detection source
            </Text>
            <Text
              style={{ fontSize: 12, fontWeight: "600", color: "#0f172a", marginTop: 2 }}
            >
              {analysis.ocr.source || "Unknown"}
            </Text>
          </View>
        </View>

        {/* CNN Analysis */}
        <View style={cardStyle}>
          <View style={sectionTitleRowStyle}>
            <View
              style={[
                sectionIconBoxStyle,
                { backgroundColor: "#ecfdf5" },
              ]}
            >
              <Ionicons
                name="scan-outline"
                size={18}
                color={BRAND_GREEN}
              />
            </View>
            <View>
              <Text style={sectionTitleStyle}>CNN Analysis</Text>
              <Text style={sectionSubtitleStyle}>
                Food identity and visible spoilage detection
              </Text>
            </View>
          </View>

          <View style={rowBetweenStyle}>
            <View>
              <Text style={rowLabelStyle}>Food Identity</Text>
              <Text
                style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}
              >
                Detected by CNN
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={rowValueStyle}>
                {analysis.cnn.identity.foodName}
              </Text>
              <Text
                style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}
              >
                {(analysis.cnn.identity.confidence * 100).toFixed(0)}% confidence
              </Text>
            </View>
          </View>

          <View style={{ paddingTop: 6 }}>
            <View style={rowBetweenStyle}>
              <Text style={rowLabelStyle}>Spoilage Score</Text>
              <Text style={rowValueStyle}>
                {(analysis.cnn.spoilage.spoilageScore * 100).toFixed(0)}%
              </Text>
            </View>

            <View style={spoilageBarBgStyle}>
              <View
                style={spoilageBarFillStyle(
                  analysis.cnn.spoilage.spoilageScore,
                )}
              />
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor:
                    analysis.cnn.spoilage.spoilageScore >= 0.7
                      ? "#ef4444"
                      : analysis.cnn.spoilage.spoilageScore >= 0.4
                        ? "#f59e0b"
                        : "#22c55e",
                  marginRight: 6,
                }}
              />
              <Text
                style={{ fontSize: 12, fontWeight: "600", color: "#334155" }}
              >
                Status: {analysis.cnn.spoilage.status}
              </Text>
            </View>
          </View>

          <View style={{ paddingTop: 10 }}>
            <Text
              style={{ fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 8 }}
            >
              Detected Indicators
            </Text>

            {analysis.cnn.spoilage.detectedIndicators.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {analysis.cnn.spoilage.detectedIndicators.map((key) => (
                  <View key={key} style={indicatorPillStyle}>
                    <Ionicons
                      name="warning-outline"
                      size={12}
                      color="#dc2626"
                    />
                    <Text style={indicatorTextStyle}>
                      {FLAG_LABELS[key] || key}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={noIndicatorsBoxStyle}>
                <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: "#16a34a",
                    marginLeft: 6,
                  }}
                >
                  No significant spoilage indicators detected
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* TTI & Risk */}
        <View style={ttiCardStyle}>
          <View style={ttiHeaderStyle}>
            <View style={ttiIconBoxStyle}>
              <Ionicons name="time-outline" size={16} color="#ffffff" />
            </View>
            <View>
              <Text style={ttiTitleStyle}>TTI & Risk</Text>
              <Text style={ttiSubtitleStyle}>
                Remaining shelf life and recommended action
              </Text>
            </View>
          </View>

          <View style={ttiSubCardStyle}>
            <Text style={{ fontSize: 11, color: "#64748b" }}>
              Remaining Life
            </Text>
            <Text
              style={{ fontSize: 15, fontWeight: "700", color: "#0f172a", marginTop: 2 }}
            >
              {preview.tti.remainingLifeDays} days
            </Text>
            <Text
              style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}
            >
              Temperature-Time Indicator (TTI)
            </Text>
          </View>

          <View style={ttiSubCardStyle}>
            <Text style={{ fontSize: 11, color: "#64748b" }}>Urgency</Text>
            <Text
              style={[
                { fontSize: 14, fontWeight: "700", marginTop: 2 },
                urgencyTextStyle(preview.urgency),
              ]}
            >
              {preview.urgency}
            </Text>
          </View>

          <View style={primaryActionBoxStyle}>
            <View
              style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}
            >
              <Ionicons name="bulb-outline" size={14} color={BRAND} />
              <Text style={[primaryActionTitleStyle, { marginLeft: 6 }]}>
                Recommended Action
              </Text>
            </View>

            <Text style={primaryActionLabelStyle}>
              {preview.recommendations.primaryAction.label}
            </Text>
            <Text style={primaryActionDescStyle}>
              {preview.recommendations.primaryAction.description}
            </Text>
          </View>
        </View>

        {/* Recommendations */}
        <View style={cardStyle}>
          <View style={sectionTitleRowStyle}>
            <View
              style={[
                sectionIconBoxStyle,
                { backgroundColor: "#fef3c7" },
              ]}
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

          {preview.recommendations.ruleBased?.length > 0 ? (
            preview.recommendations.ruleBased.map((action) => (
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
              <Text
                style={{ fontSize: 12, color: "#64748b" }}
              >
                No additional actions available.
              </Text>
            </View>
          )}

          <Text style={recsSectionTitleStyle}>Usage Ideas</Text>

          {preview.recommendations.contentBased?.usageSuggestions?.length >
          0 ? (
            preview.recommendations.contentBased.usageSuggestions.map(
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

        {/* Final Actions */}
        <View style={{ marginTop: 4, marginBottom: 4 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={addToShelfButtonStyle}
            onPress={saveToShelf}
            disabled={busy}
          >
            {busy ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <ActivityIndicator color="#ffffff" />
                <Text
                  style={{ color: "#ffffff", fontSize: 15, fontWeight: "700", marginLeft: 8 }}
                >
                  Saving...
                </Text>
              </View>
            ) : (
              <>
                <Ionicons
                  name="add-circle-outline"
                  size={20}
                  color="#ffffff"
                />
                <Text style={actionButtonTextStyle}>Add to Shelf</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={scanAgainButtonStyle}
            onPress={reset}
            disabled={busy}
          >
            <Ionicons name="camera-outline" size={18} color="#334155" />
            <Text style={scanAgainButtonTextStyle}>Scan Again</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ───────────────────────────────────────────────────────────
  // Capture / Review UI
  // ───────────────────────────────────────────────────────────

  return (
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

      {/* Camera Preview */}
      <View style={previewContainerStyle}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={previewImageStyle}
            resizeMode="cover"
          />
        ) : (
          <View style={previewEmptyStyle}>
            <View style={previewEmptyIconContainerStyle}>
              <Ionicons name="camera-outline" size={32} color="#ffffff" />
            </View>

            <Text style={previewEmptyTitleStyle}>No image selected</Text>

            <Text style={previewEmptySubtitleStyle}>
              Take a photo or choose one from your gallery
            </Text>
          </View>
        )}
      </View>

      {/* Capture buttons shown only on the capture step */}
      {step === "capture" && (
        <>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => pickImage(true)}
            style={captureButtonStyle}
          >
            <Ionicons name="camera" size={20} color="#ffffff" />
            <Text style={buttonTextStyle}>Open Camera</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => pickImage(false)}
            style={galleryButtonStyle}
          >
            <Ionicons name="images-outline" size={20} color={BRAND} />
            <Text style={galleryButtonTextStyle}>Choose from Gallery</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Review Section */}
      {step === "review" && (
        <>
          {/* Change photo */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => pickImage(true)}
            style={retakeButtonStyle}
          >
            <Ionicons
              name="camera-reverse-outline"
              size={16}
              color={BRAND}
            />
            <Text style={retakeButtonTextStyle}>Retake / Change Photo</Text>
          </TouchableOpacity>

          {/* Food name override */}
          <Text style={fieldLabelStyle}>Food Name</Text>
          <TextInput
            value={foodNameOverride}
            onChangeText={setFoodNameOverride}
            placeholder="Leave blank to auto-detect"
            placeholderTextColor="#94a3b8"
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
                <TouchableOpacity
                  key={cat}
                  onPress={() => setCategory(cat)}
                  activeOpacity={0.8}
                  style={categoryPillStyle(active)}
                >
                  <Text style={categoryPillTextStyle(active)}>{cat}</Text>
                </TouchableOpacity>
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
                <TouchableOpacity
                  key={loc.id}
                  onPress={() => setStorageId(loc.id)}
                  activeOpacity={0.8}
                  style={storagePillStyle(active)}
                >
                  <Text style={storagePillTextStyle(active)}>{loc.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Label text */}
          <Text style={fieldLabelStyle}>Label Text (optional)</Text>
          <TextInput
            value={labelText}
            onChangeText={setLabelText}
            placeholder="Expiry date or text on the label"
            placeholderTextColor="#94a3b8"
            style={textInputStyle}
          />

          {/* Spoilage flags */}
          <Text style={fieldLabelStyle}>Spoilage Indicators</Text>
          <View style={flagsContainerStyle}>
            {FLAG_LIST.map((key) => {
              const active = flags.includes(key);
              return (
                <TouchableOpacity
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
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Analyze button */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={runAnalysis}
            disabled={busy}
            style={analyzeButtonStyle}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Ionicons name="scan-outline" size={18} color="#ffffff" />
                <Text style={buttonTextStyle}>Analyze</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={reset}
            style={cancelButtonStyle}
          >
            <Text style={cancelButtonTextStyle}>Cancel</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}
