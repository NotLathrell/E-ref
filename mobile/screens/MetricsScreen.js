import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { fetchMetrics, fetchHealth, formatPercent } from "../services/metrics";

const COLORS = {
  background: "#FFF9F0",
  card: "#FFFDF7",
  cardAlt: "#F8F0E3",
  primary: "#5C4033",
  border: "#E6D8C8",
  text: "#2F241F",
  muted: "#7A6A60",
  white: "#FFFFFF",
  good: "#6F9B72",
  warn: "#D89B3D",
  bad: "#C95C54",
};

const METRIC_TILES = [
  { key: "accuracy", label: "Accuracy", icon: "checkmark-done-outline" },
  { key: "precision", label: "Precision", icon: "locate-outline" },
  { key: "recall", label: "Recall", icon: "search-outline" },
  { key: "f1", label: "F1 Score", icon: "git-compare-outline" },
];

function scoreColor(value) {
  if (value >= 0.9) return COLORS.good;
  if (value >= 0.75) return COLORS.warn;
  return COLORS.bad;
}

function MetricTile({ label, value, icon }) {
  return (
    <View
      style={{
        width: "50%",
        paddingHorizontal: 5,
        marginBottom: 10,
      }}
    >
      <View
        style={{
          backgroundColor: COLORS.cardAlt,
          borderRadius: 16,
          padding: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name={icon} size={14} color={COLORS.muted} />
          <Text
            style={{
              fontSize: 12,
              color: COLORS.muted,
              fontWeight: "700",
              marginLeft: 5,
            }}
          >
            {label}
          </Text>
        </View>

        <Text
          style={{
            fontSize: 24,
            fontWeight: "800",
            color: scoreColor(value),
            marginTop: 6,
          }}
        >
          {formatPercent(value)}
        </Text>

        <View
          style={{
            height: 5,
            borderRadius: 3,
            backgroundColor: COLORS.border,
            overflow: "hidden",
            marginTop: 8,
          }}
        >
          <View
            style={{
              height: "100%",
              width: `${Math.max(2, Math.min(100, value * 100))}%`,
              backgroundColor: scoreColor(value),
            }}
          />
        </View>
      </View>
    </View>
  );
}

function PerClassTable({ rows }) {
  return (
    <View style={{ marginTop: 10 }}>
      <View
        style={{
          flexDirection: "row",
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <Text style={{ flex: 2.4, fontSize: 11, fontWeight: "800", color: COLORS.muted }}>
          CLASS
        </Text>
        <Text style={{ flex: 1, fontSize: 11, fontWeight: "800", color: COLORS.muted, textAlign: "right" }}>
          PREC
        </Text>
        <Text style={{ flex: 1, fontSize: 11, fontWeight: "800", color: COLORS.muted, textAlign: "right" }}>
          REC
        </Text>
        <Text style={{ flex: 1, fontSize: 11, fontWeight: "800", color: COLORS.muted, textAlign: "right" }}>
          F1
        </Text>
        <Text style={{ flex: 0.9, fontSize: 11, fontWeight: "800", color: COLORS.muted, textAlign: "right" }}>
          N
        </Text>
      </View>

      {rows.map((row) => (
        <View
          key={row.label}
          style={{
            flexDirection: "row",
            paddingVertical: 7,
            borderBottomWidth: 1,
            borderBottomColor: "#F2EADE",
            opacity: row.support === 0 ? 0.4 : 1,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ flex: 2.4, fontSize: 12, color: COLORS.text, fontWeight: "600" }}
          >
            {row.label.replace(/_/g, " ")}
          </Text>
          <Text style={{ flex: 1, fontSize: 12, color: COLORS.muted, textAlign: "right" }}>
            {row.support === 0 ? "—" : formatPercent(row.precision, 1)}
          </Text>
          <Text style={{ flex: 1, fontSize: 12, color: COLORS.muted, textAlign: "right" }}>
            {row.support === 0 ? "—" : formatPercent(row.recall, 1)}
          </Text>
          <Text
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: "700",
              textAlign: "right",
              color: row.support === 0 ? COLORS.muted : scoreColor(row.f1),
            }}
          >
            {row.support === 0 ? "—" : formatPercent(row.f1, 1)}
          </Text>
          <Text style={{ flex: 0.9, fontSize: 12, color: COLORS.muted, textAlign: "right" }}>
            {row.support}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ConfusionSummary({ binary }) {
  const cells = [
    { label: "Correctly rotten", value: binary.truePositive, color: COLORS.good },
    { label: "Correctly fresh", value: binary.trueNegative, color: COLORS.good },
    { label: "Fresh called rotten", value: binary.falsePositive, color: COLORS.warn },
    { label: "Rotten missed", value: binary.falseNegative, color: COLORS.bad },
  ];

  return (
    <View style={{ marginTop: 12 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "800",
          color: COLORS.muted,
          marginBottom: 8,
          letterSpacing: 0.6,
        }}
      >
        OUTCOME BREAKDOWN
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
        {cells.map((cell) => (
          <View key={cell.label} style={{ width: "50%", paddingHorizontal: 4, marginBottom: 8 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 12,
                padding: 10,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "800", color: cell.color }}>
                {cell.value}
              </Text>
              <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
                {cell.label}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={{ fontSize: 11, color: COLORS.muted, lineHeight: 16 }}>
        A missed rotten item is the costly error, so recall on the rotten class is
        the safety-critical score.
      </Text>
    </View>
  );
}

function TaskCard({ task }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View
      style={{
        backgroundColor: COLORS.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <Text style={{ fontSize: 17, fontWeight: "800", color: COLORS.text }}>
        {task.title}
      </Text>
      <Text style={{ fontSize: 12, color: COLORS.muted, marginTop: 3, lineHeight: 17 }}>
        {task.description}
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 8,
          marginBottom: 12,
        }}
      >
        <Ionicons name="hardware-chip-outline" size={13} color={COLORS.primary} />
        <Text
          style={{
            fontSize: 11,
            color: COLORS.primary,
            fontWeight: "700",
            marginLeft: 5,
            flex: 1,
          }}
        >
          {task.model}
        </Text>
        <Text style={{ fontSize: 11, color: COLORS.muted }}>
          {task.correct}/{task.samples} correct
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 }}>
        {METRIC_TILES.map((tile) => (
          <MetricTile
            key={tile.key}
            label={tile.label}
            value={task[tile.key]}
            icon={tile.icon}
          />
        ))}
      </View>

      <Text style={{ fontSize: 11, color: COLORS.muted, lineHeight: 16, marginTop: 2 }}>
        Macro-averaged across classes. Weighted by class size:{" "}
        {formatPercent(task.weighted.precision, 1)} precision,{" "}
        {formatPercent(task.weighted.recall, 1)} recall,{" "}
        {formatPercent(task.weighted.f1, 1)} F1.
      </Text>

      {task.binary ? <ConfusionSummary binary={task.binary} /> : null}

      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => setExpanded((prev) => !prev)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 12,
          paddingVertical: 10,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: COLORS.border,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.primary }}>
          {expanded ? "Hide per-class scores" : `Per-class scores (${task.perClass.length})`}
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={COLORS.primary}
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>

      {expanded ? <PerClassTable rows={task.perClass} /> : null}
    </View>
  );
}

export function MetricsScreen() {
  const navigation = useNavigation();
  const [report, setReport] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [metrics, status] = await Promise.all([
        fetchMetrics(),
        fetchHealth().catch(() => null),
      ]);
      setReport(metrics);
      setHealth(status);
    } catch (err) {
      setError(err.message || "Could not load model metrics.");
      setReport(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 52,
        paddingBottom: 60,
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
      }
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={{ marginRight: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={COLORS.primary} />
        </TouchableOpacity>

        <Text style={{ fontSize: 26, fontWeight: "800", color: COLORS.text, flex: 1 }}>
          Model Performance
        </Text>
      </View>

      <Text style={{ fontSize: 13, color: COLORS.muted, lineHeight: 19, marginBottom: 18 }}>
        Accuracy, precision, recall and F1 measured on validation images the
        models have not trained on. Pull down to refresh.
      </Text>

      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 60 }}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={{ color: COLORS.muted, marginTop: 12, fontSize: 13 }}>
            Loading evaluation report…
          </Text>
        </View>
      ) : null}

      {error ? (
        <View
          style={{
            backgroundColor: "#FDF1EF",
            borderWidth: 1,
            borderColor: "#F0CFC9",
            borderRadius: 18,
            padding: 18,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <Ionicons name="alert-circle-outline" size={20} color={COLORS.bad} />
            <Text
              style={{
                fontSize: 15,
                fontWeight: "800",
                color: COLORS.bad,
                marginLeft: 8,
              }}
            >
              Metrics unavailable
            </Text>
          </View>

          <Text style={{ fontSize: 13, color: "#8A5A55", lineHeight: 19 }}>{error}</Text>

          <Text style={{ fontSize: 12, color: COLORS.muted, lineHeight: 18, marginTop: 10 }}>
            Start the API with{" "}
            <Text style={{ fontWeight: "700" }}>uvicorn backend.server:app --host 0.0.0.0 --port 8000</Text>
            , then generate the report with{" "}
            <Text style={{ fontWeight: "700" }}>python backend/evaluate.py</Text>.
          </Text>

          <TouchableOpacity
            onPress={onRefresh}
            activeOpacity={0.8}
            style={{
              marginTop: 14,
              backgroundColor: COLORS.primary,
              borderRadius: 12,
              paddingVertical: 11,
              alignItems: "center",
            }}
          >
            <Text style={{ color: COLORS.white, fontWeight: "800", fontSize: 14 }}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {report ? (
        <>
          {/* Evaluation run summary */}
          <View
            style={{
              backgroundColor: COLORS.primary,
              borderRadius: 20,
              padding: 18,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: "#EADFD0", fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>
              EVALUATION RUN
            </Text>

            <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: "800", marginTop: 6 }}>
              {report.dataset.images?.toLocaleString?.() ?? report.dataset.images} images
            </Text>

            <Text style={{ color: "#DCCDBA", fontSize: 12, marginTop: 4 }}>
              {report.dataset.split}
            </Text>

            {report.generatedAt ? (
              <Text style={{ color: "#C9B8A3", fontSize: 11, marginTop: 8 }}>
                Generated {new Date(report.generatedAt).toLocaleString()}
                {report.dataset.durationSeconds
                  ? ` · ${report.dataset.durationSeconds}s`
                  : ""}
              </Text>
            ) : null}

            {report.dataset.limitPerClass ? (
              <Text style={{ color: "#C9B8A3", fontSize: 11, marginTop: 3 }}>
                Sampled {report.dataset.limitPerClass} images per class
              </Text>
            ) : null}
          </View>

          {report.dataset.foodsWithoutIndependentImages?.length > 0 ? (
            <View
              style={{
                backgroundColor: "#FBEFD8",
                borderWidth: 1,
                borderColor: "#EBD3A2",
                borderRadius: 18,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Ionicons name="alert-circle-outline" size={18} color="#8A5D14" />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "800",
                    color: "#8A5D14",
                    marginLeft: 7,
                  }}
                >
                  Some foods are not measured
                </Text>
              </View>

              <Text style={{ fontSize: 12, color: "#6B4A10", lineHeight: 18 }}>
                These scores cover only{" "}
                <Text style={{ fontWeight: "800" }}>
                  {(report.dataset.foodsEvaluated || []).join(", ")}
                </Text>
                . The validation images for{" "}
                <Text style={{ fontWeight: "800" }}>
                  {report.dataset.foodsWithoutIndependentImages.join(", ")}
                </Text>{" "}
                also appear in the training data, so there is no independent way to
                measure how well the app handles them.
              </Text>

              {report.dataset.excludedTrainDuplicates > 0 ? (
                <Text style={{ fontSize: 11, color: "#8A6A30", lineHeight: 16, marginTop: 8 }}>
                  {report.dataset.excludedTrainDuplicates} of{" "}
                  {report.dataset.imagesFound} validation images were excluded because
                  they are identical to training images.
                </Text>
              ) : null}
            </View>
          ) : null}

          {report.tasks.map((task) => (
            <TaskCard key={task.key} task={task} />
          ))}

          {/* Loaded models */}
          {health?.models ? (
            <View
              style={{
                backgroundColor: COLORS.card,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: COLORS.border,
                padding: 16,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "800", color: COLORS.text, marginBottom: 10 }}>
                Pipeline
              </Text>

              {[
                { key: "detector", stage: "1. Detection", note: "Locates the food in the frame" },
                { key: "identity", stage: "2. Identification", note: "CNN classifies the food type" },
                { key: "freshness", stage: "3. Freshness", note: "CNN classifies fresh vs rotten" },
              ].map((row) => {
                const model = health.models[row.key] || {};
                return (
                  <View
                    key={row.key}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 9,
                      borderBottomWidth: 1,
                      borderBottomColor: "#F2EADE",
                    }}
                  >
                    <Ionicons
                      name={model.loaded ? "checkmark-circle" : "close-circle"}
                      size={18}
                      color={model.loaded ? COLORS.good : COLORS.bad}
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: COLORS.text }}>
                        {row.stage}
                      </Text>
                      <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>
                        {model.name || "not loaded"} — {row.note}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
