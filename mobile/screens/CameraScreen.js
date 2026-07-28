import { useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { analyzeScan } from '../services/scanPipeline';
import { enrichItem } from '../services/enrich';
import { FOOD_CATALOG, STORAGE_LOCATIONS, CATEGORIES } from '../data/foodCatalog';
import { SPOILAGE_INDICATORS } from '../services/cnn';
import { useInventory } from '../context/InventoryContext';

const BRAND = '#16567b';
const BRAND_GREEN = '#44ae5f';

const FLAG_LABELS = {
  discoloration: 'Discoloration',
  texture_abnormality: 'Texture issues',
  packaging_damage: 'Packaging damage',
  mold_spots: 'Mold spots',
  excess_moisture: 'Excess moisture'
};

export function CameraScreen() {
  const navigation = useNavigation();
  const { addItem } = useInventory();

  const [step, setStep] = useState('capture'); // capture | review | result
  const [imageUri, setImageUri] = useState(null);
  const [category, setCategory] = useState('Dairy');
  const [storageId, setStorageId] = useState('fridge_top');
  const [labelText, setLabelText] = useState('');
  const [foodNameOverride, setFoodNameOverride] = useState('');
  const [flags, setFlags] = useState([]);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [preview, setPreview] = useState(null);

  const toggleFlag = (key) => {
    setFlags((prev) => (prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]));
  };

  const pickImage = async (fromCamera) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow camera/photo access to scan food packaging.');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [4, 3] })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [4, 3] });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setImageUri(result.assets[0].uri);
      setStep('review');
      setAnalysis(null);
      setPreview(null);
    }
  };

  const runAnalysis = async () => {
    if (!imageUri) {
      Alert.alert('No image', 'Capture or choose a food package photo first.');
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
        packagingDamaged: flags.includes('packaging_damage'),
        foodNameOverride: foodNameOverride.trim() || undefined
      });
      const enriched = enrichItem({
        ...result.draftItem,
        scannedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });
      setAnalysis(result);
      setPreview(enriched);
      setStep('result');
    } catch (err) {
      Alert.alert('Scan failed', err.message || 'Unable to analyze image.');
    } finally {
      setBusy(false);
    }
  };

  const saveToShelf = async () => {
    if (!analysis?.draftItem) return;
    setBusy(true);
    try {
      await addItem(analysis.draftItem);
      Alert.alert('Saved', `${analysis.draftItem.title} was added to your shelf.`, [
        { text: 'View Shelf', onPress: () => navigation.navigate('Shelf') },
        { text: 'Scan Another', onPress: reset }
      ]);
      reset();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save item.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep('capture');
    setImageUri(null);
    setLabelText('');
    setFoodNameOverride('');
    setFlags([]);
    setAnalysis(null);
    setPreview(null);
  };

  const catalogNames = useMemo(
    () => FOOD_CATALOG.filter((f) => f.id !== 'unknown').map((f) => f.name),
    []
  );

  if (step === 'result' && preview) {
    return (
      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 20, paddingBottom: 120, paddingTop: 52 }}>
        <Text className="text-2xl font-bold text-slate-900 mb-1">Scan Result</Text>
        <Text className="text-slate-500 mb-4">OCR + CNN + TTI + risk scoring complete</Text>

        {preview.imageUri ? (
          <Image source={{ uri: preview.imageUri }} className="h-44 w-full rounded-2xl mb-4" />
        ) : null}

        <View className="rounded-2xl border border-slate-200 p-4 mb-3">
          <Text className="text-2xl font-bold text-slate-900">{preview.title}</Text>
          <Text className="text-slate-500 mt-1">{preview.category} · {preview.subtitle}</Text>
          <View className="flex-row flex-wrap mt-3">
            <Badge color="#ef4444" text={preview.freshnessLabel} />
            <Badge color={BRAND} text={`Risk ${(preview.riskScore * 100).toFixed(0)}%`} />
            <Badge color="#64748b" text={preview.daysLabel} />
          </View>
        </View>

        <View className="rounded-2xl bg-slate-100 p-4 mb-3">
          <Text className="font-bold text-slate-900 mb-2">OCR Extraction</Text>
          <Text className="text-sm text-slate-600">
            Expiry: {preview.expiryDate ? new Date(preview.expiryDate).toLocaleDateString() : 'Not found'}
          </Text>
          <Text className="text-sm text-slate-600 mt-1">
            Manufactured:{' '}
            {analysis.ocr.manufacturingDate
              ? new Date(analysis.ocr.manufacturingDate).toLocaleDateString()
              : 'Not found'}
          </Text>
          <Text className="text-sm text-slate-600 mt-1">
            Confidence: {(analysis.ocr.confidence * 100).toFixed(0)}% ({analysis.ocr.source})
          </Text>
        </View>

        <View className="rounded-2xl bg-slate-100 p-4 mb-3">
          <Text className="font-bold text-slate-900 mb-2">CNN Analysis</Text>
          <Text className="text-sm text-slate-600">
            Identity: {analysis.cnn.identity.foodName} ({(analysis.cnn.identity.confidence * 100).toFixed(0)}%)
          </Text>
          <Text className="text-sm text-slate-600 mt-1">
            Spoilage score: {(analysis.cnn.spoilage.spoilageScore * 100).toFixed(0)}% ({analysis.cnn.spoilage.status})
          </Text>
          <Text className="text-sm text-slate-600 mt-1">
            Indicators:{' '}
            {analysis.cnn.spoilage.detectedIndicators.length
              ? analysis.cnn.spoilage.detectedIndicators.map((k) => FLAG_LABELS[k] || k).join(', ')
              : 'None significant'}
          </Text>
        </View>

        <View className="rounded-2xl bg-slate-100 p-4 mb-3">
          <Text className="font-bold text-slate-900 mb-2">TTI & Risk</Text>
          <Text className="text-sm text-slate-600">
            Remaining life (TTI): {preview.tti.remainingLifeDays} days
          </Text>
          <Text className="text-sm text-slate-600 mt-1">Urgency: {preview.urgency}</Text>
          <Text className="text-sm text-slate-600 mt-1">
            Primary action: {preview.recommendations.primaryAction.label}
          </Text>
          <Text className="text-sm text-slate-500 mt-2">
            {preview.recommendations.primaryAction.description}
          </Text>
        </View>

        <View className="rounded-2xl border border-slate-200 p-4 mb-4">
          <Text className="font-bold text-slate-900 mb-2">Recommendations</Text>
          {preview.recommendations.ruleBased.map((a) => (
            <Text key={a.id} className="text-sm text-slate-700 mb-1">
              • {a.label}: {a.description}
            </Text>
          ))}
          <Text className="font-semibold text-slate-800 mt-3 mb-1">Usage ideas</Text>
          {preview.recommendations.contentBased.usageSuggestions.map((tip) => (
            <Text key={tip} className="text-sm text-slate-600 mb-1">
              • {tip}
            </Text>
          ))}
        </View>

        <TouchableOpacity
          className="rounded-2xl py-4 items-center mb-3"
          style={{ backgroundColor: BRAND_GREEN }}
          onPress={saveToShelf}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-lg">Add to Shelf</Text>}
        </TouchableOpacity>
        <TouchableOpacity className="rounded-2xl py-4 items-center border border-slate-300" onPress={reset}>
          <Text className="text-slate-800 font-semibold">Scan Again</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 20, paddingBottom: 120, paddingTop: 52 }}>
      <Text className="text-2xl font-bold text-slate-900 mb-1">Scan</Text>
      <Text className="text-slate-500 mb-5">Capture packaging for OCR + spoilage analysis</Text>

      <View className="rounded-3xl overflow-hidden border border-slate-200 bg-slate-900 h-56 items-center justify-center mb-4">
        {imageUri ? (
          <Image source={{ uri: imageUri }} className="h-full w-full" />
        ) : (
          <>
            <Ionicons name="camera" size={42} color="#ffffff" />
            <Text className="text-white mt-3 font-semibold">No image selected</Text>
          </>
        )}
      </View>

      <View className="flex-row mb-4">
        <TouchableOpacity
          className="flex-1 rounded-2xl py-3.5 items-center mr-2"
          style={{ backgroundColor: BRAND_GREEN }}
          onPress={() => pickImage(true)}
        >
          <Text className="text-white font-bold">Open Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-1 rounded-2xl py-3.5 items-center ml-2 border border-slate-300"
          onPress={() => pickImage(false)}
        >
          <Text className="text-slate-800 font-bold">Gallery</Text>
        </TouchableOpacity>
      </View>

      {step === 'review' && (
        <>
          <Text className="text-slate-500 mb-2">Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            {CATEGORIES.filter((c) => c !== 'All').map((c) => (
              <TouchableOpacity
                key={c}
                onPress={() => setCategory(c)}
                className="mr-2 rounded-xl px-4 py-2 border"
                style={{
                  backgroundColor: category === c ? BRAND : '#fff',
                  borderColor: category === c ? BRAND : '#cbd5e1'
                }}
              >
                <Text className={category === c ? 'text-white font-semibold' : 'text-slate-800 font-semibold'}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text className="text-slate-500 mb-2">Storage location</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            {STORAGE_LOCATIONS.map((s) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => setStorageId(s.id)}
                className="mr-2 rounded-xl px-4 py-2 border"
                style={{
                  backgroundColor: storageId === s.id ? BRAND : '#fff',
                  borderColor: storageId === s.id ? BRAND : '#cbd5e1'
                }}
              >
                <Text className={storageId === s.id ? 'text-white font-semibold text-xs' : 'text-slate-800 font-semibold text-xs'}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text className="text-slate-500 mb-2">Food name (optional override)</Text>
          <TextInput
            value={foodNameOverride}
            onChangeText={setFoodNameOverride}
            placeholder={`e.g. ${catalogNames[0]}`}
            placeholderTextColor="#94a3b8"
            className="rounded-2xl border border-slate-200 px-4 py-3 mb-4 text-slate-900"
          />

          <Text className="text-slate-500 mb-2">Paste label text (optional OCR input)</Text>
          <TextInput
            value={labelText}
            onChangeText={setLabelText}
            placeholder="EXP: 08/15/2026&#10;PRODUCT: YOGURT"
            placeholderTextColor="#94a3b8"
            multiline
            className="rounded-2xl border border-slate-200 px-4 py-3 mb-4 text-slate-900 min-h-[80px]"
          />

          <Text className="text-slate-500 mb-2">Visible spoilage indicators</Text>
          <View className="flex-row flex-wrap mb-5">
            {SPOILAGE_INDICATORS.map((key) => {
              const on = flags.includes(key);
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => toggleFlag(key)}
                  className="mr-2 mb-2 rounded-full px-3 py-2 border"
                  style={{
                    backgroundColor: on ? '#fef2f2' : '#fff',
                    borderColor: on ? '#ef4444' : '#cbd5e1'
                  }}
                >
                  <Text className={on ? 'text-red-600 text-xs font-semibold' : 'text-slate-700 text-xs font-semibold'}>
                    {FLAG_LABELS[key]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            className="rounded-2xl py-4 items-center"
            style={{ backgroundColor: BRAND }}
            onPress={runAnalysis}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-lg">Run OCR + CNN Analysis</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

function Badge({ color, text }) {
  return (
    <View className="rounded-full px-3 py-1 mr-2 mb-2" style={{ backgroundColor: color }}>
      <Text className="text-white text-xs font-bold">{text}</Text>
    </View>
  );
}
