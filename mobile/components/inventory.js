/**
 * Two small forms for editing the shelf by hand:
 *  - ManualAddModal   add a food without a photo
 *  - EditDateModal    correct (or clear) an item's expiry date
 */

import { useEffect, useState } from 'react';
import { Modal } from 'react-native';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from './themed';
import { Chip, PillButton, ScreenHeader } from './screen';
import { ErrorText } from './auth';
import { FoodPickerModal } from './detection';
import { STORAGE_LOCATIONS, getFoodById } from '../data/foodCatalog';
import { formatLabelDate } from '../services/ocr';
import { draftFromManual, parseTypedDate } from '../services/manual';
import { LIGHT_COLORS as C } from '../src/theme/ThemeContext';

const inputStyle = {
  backgroundColor: C.card,
  borderWidth: 1,
  borderColor: C.border,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: C.text,
};

const labelStyle = { fontSize: 12, fontWeight: '800', color: C.muted, marginBottom: 6, marginTop: 6 };

export function ManualAddModal({ visible, onClose, onSave }) {
  const [foodId, setFoodId] = useState(null);
  const [storageId, setStorageId] = useState(null);
  const [expiryText, setExpiryText] = useState('');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setFoodId(null);
      setStorageId(null);
      setExpiryText('');
      setError(null);
    }
  }, [visible]);

  const food = foodId ? getFoodById(foodId) : null;
  const storage = storageId || food?.bestStorageId || 'fridge_top';

  const save = async () => {
    const result = draftFromManual({ foodId, storageId: storage, expiryText });
    if (result.error) return setError(result.error);
    setBusy(true);
    try {
      await onSave(result.draft);
      onClose();
    } catch (failure) {
      setError(failure.message || 'Could not save the item.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={{ flex: 1, backgroundColor: C.background }}
        contentContainerStyle={{ padding: 20, paddingTop: 52, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="Add food by hand"
          subtitle="For food without a photo. Its shelf life is worked out from its type, where you keep it and the date, if you know it."
          onBack={onClose}
        />

        <Text style={labelStyle}>Food</Text>
        <TouchableOpacity onPress={() => setPicking(true)} activeOpacity={0.85} accessibilityRole="button" style={[inputStyle, { flexDirection: 'row', justifyContent: 'space-between' }]}>
          <Text style={{ fontSize: 15, color: food ? C.text : C.muted }}>{food ? food.name : 'Choose a food'}</Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.primary }}>{food ? 'Change' : 'Choose'}</Text>
        </TouchableOpacity>

        <Text style={labelStyle}>Where you keep it</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {STORAGE_LOCATIONS.map((place) => (
            <Chip key={place.id} label={place.label.split(' (')[0]} selected={storage === place.id} onPress={() => setStorageId(place.id)} />
          ))}
        </View>

        <Text style={labelStyle}>Expiry date (optional)</Text>
        <TextInput
          value={expiryText}
          onChangeText={setExpiryText}
          placeholder="e.g. 15/09/2026"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          style={inputStyle}
        />

        <View style={{ marginTop: 14 }}>
          <ErrorText>{error}</ErrorText>
        </View>
        <PillButton label={busy ? 'Saving…' : 'Add to Shelf'} icon="add-circle-outline" onPress={save} disabled={busy} />
      </ScrollView>

      <FoodPickerModal
        visible={picking}
        title="Choose a food"
        onClose={() => setPicking(false)}
        onPick={(id) => {
          setFoodId(id);
          setStorageId(null);
          setPicking(false);
        }}
      />
    </Modal>
  );
}

export function EditDateModal({ visible, item, onClose, onSave }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setText(item?.expiryDate ? formatLabelDate(item.expiryDate) || '' : '');
      setError(null);
    }
  }, [visible, item?.id]);

  const save = async (clear) => {
    const iso = clear ? null : parseTypedDate(text);
    if (!clear && !iso) return setError('That date was not understood. Try 15/09/2026 or 15 Sep 2026.');
    try {
      await onSave(iso);
      onClose();
    } catch (failure) {
      setError(failure.message || 'Could not save the date.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: C.background, borderRadius: 20, padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>Expiry date</Text>
          <Text style={{ fontSize: 13, color: C.muted, marginTop: 4, marginBottom: 12 }}>
            {item?.title ? `Correct the date for ${item.title}.` : 'Correct the date.'}
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="e.g. 15/09/2026"
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            style={inputStyle}
          />
          <View style={{ marginTop: 10 }}>
            <ErrorText>{error}</ErrorText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <PillButton label="Save" icon="checkmark" onPress={() => save(false)} style={{ marginRight: 8, marginBottom: 8 }} />
            <PillButton label="No date" kind="ghost" onPress={() => save(true)} style={{ marginRight: 8, marginBottom: 8 }} />
            <PillButton label="Cancel" kind="ghost" onPress={onClose} style={{ marginBottom: 8 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
