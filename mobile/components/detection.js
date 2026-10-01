/**
 * Pieces of the scan result screen that deal with what the models found:
 *  - DetectionImage   the photo with a box drawn around every food YOLOv8 detected
 *  - ReviewBanner     asks the user to confirm or correct a result the models are unsure of
 *  - FoodPickerModal  choose any food in the catalog
 *  - ObjectRow        one detected food in a photo of several
 */

import { useMemo, useState } from 'react';
import { Modal } from 'react-native';
import { Image, Ionicons, ScrollView, Text, TextInput, TouchableOpacity, View } from './themed';
import { getFoods } from '../data/foodCatalog';
import { LIGHT_COLORS as C } from '../src/theme/ThemeContext';

const FRESH = '#22a55b';
const SUBFRESH = '#d89b3d';
const ROTTEN = '#dc4a43';
const UNSURE = '#d89b3d';

/** Colour for the CNN's Fresh (70-100%) / Sub Fresh (30-69%) / Rotten (0-29%) tier. */
export function tierColor(tier) {
  if (tier === 'fresh') return FRESH;
  if (tier === 'subfresh') return SUBFRESH;
  return ROTTEN;
}

/** Box colour: the freshness tier's colour, or amber when the models are unsure what it is. */
export function boxColor(object) {
  if (object.review?.level === 'low') return UNSURE;
  return tierColor(object.freshnessTier);
}

/**
 * Where an image of `image` size lands when it is shown "contain"ed in `frame`, and the
 * scale from image pixels to screen points. Exported so the maths can be tested.
 */
export function fitContain(image, frame) {
  const [width, height] = image || [0, 0];
  if (!width || !height || !frame.width || !frame.height) return { scale: 0, left: 0, top: 0 };
  const scale = Math.min(frame.width / width, frame.height / height);
  return {
    scale,
    left: (frame.width - width * scale) / 2,
    top: (frame.height - height * scale) / 2
  };
}

export function DetectionImage({ uri, imageSize, objects = [], height = 260 }) {
  const [width, setWidth] = useState(0);
  const fit = fitContain(imageSize, { width, height });
  const boxes = objects.filter((object) => object.source === 'detector' && Array.isArray(object.box));

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{ height, borderRadius: 16, overflow: 'hidden', backgroundColor: C.border, marginBottom: 16 }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height }} resizeMode="contain" />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="image-outline" size={40} color={C.muted} />
        </View>
      )}

      {fit.scale > 0
        ? boxes.map((object, index) => {
            const [x1, y1, x2, y2] = object.box;
            const color = boxColor(object);
            return (
              <View
                key={object.id}
                themed={false}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: fit.left + x1 * fit.scale,
                  top: fit.top + y1 * fit.scale,
                  width: (x2 - x1) * fit.scale,
                  height: (y2 - y1) * fit.scale,
                  borderWidth: 2,
                  borderColor: color,
                  borderStyle: object.review?.needsConfirmation ? 'dashed' : 'solid',
                  borderRadius: 6
                }}
              >
                <View
                  themed={false}
                  style={{
                    position: 'absolute',
                    top: -1,
                    left: -1,
                    backgroundColor: color,
                    borderTopLeftRadius: 4,
                    borderBottomRightRadius: 6,
                    paddingHorizontal: 6,
                    paddingVertical: 1
                  }}
                >
                  <Text themed={false} style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>
                    {index + 1} {object.foodName || 'Unknown'}
                  </Text>
                </View>
              </View>
            );
          })
        : null}
    </View>
  );
}

export function FoodPickerModal({ visible, onPick, onClose, title = 'What is it?' }) {
  const [query, setQuery] = useState('');
  const foods = useMemo(
    () =>
      getFoods()
        .filter((food) => food.id !== 'unknown')
        .filter((food) => !query.trim() || food.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [query, visible]
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.background, paddingTop: 52, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, flex: 1 }}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={C.primary} />
          </TouchableOpacity>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search foods"
          placeholderTextColor={C.muted}
          autoCapitalize="none"
          style={{
            backgroundColor: C.card,
            borderWidth: 1,
            borderColor: C.border,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 11,
            fontSize: 15,
            color: C.text,
            marginBottom: 10
          }}
        />

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
          {foods.map((food) => (
            <TouchableOpacity
              key={food.id}
              activeOpacity={0.8}
              onPress={() => {
                setQuery('');
                onPick(food.id);
              }}
              style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>{food.name}</Text>
              <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{food.category}</Text>
            </TouchableOpacity>
          ))}
          {foods.length === 0 ? (
            <Text style={{ color: C.muted, textAlign: 'center', marginTop: 24 }}>No food matches “{query}”.</Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * Shown when the models are not sure. The user can accept the best guess, pick one of the
 * runner-up guesses, or choose any food, so a wrong answer never has to be saved.
 */
export function ReviewBanner({ review, foodName, choices = [], resolved, onConfirm, onChoose, onOther }) {
  if (!review) return null;

  if (resolved) {
    return (
      <View
        style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: '#ecf7f0', borderRadius: 10, padding: 9 }}
      >
        <Ionicons name="checkmark-circle" size={16} color="#15803d" />
        <Text style={{ fontSize: 12, color: '#166534', marginLeft: 6, flex: 1 }}>
          You confirmed this is {resolved}.
        </Text>
      </View>
    );
  }
  if (!review.needsConfirmation) return null;

  const low = review.level === 'low';
  return (
    <View
      accessibilityRole="alert"
      style={{
        marginTop: 12,
        backgroundColor: '#fffbeb',
        borderWidth: 1,
        borderColor: '#fde68a',
        borderRadius: 12,
        padding: 12
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name="alert-circle-outline" size={18} color="#b45309" />
        <Text style={{ fontSize: 14, fontWeight: '800', color: '#92400e', marginLeft: 6, flex: 1 }}>
          {low ? 'Not sure what this is' : 'Please check this result'}
        </Text>
      </View>

      {review.reasons.map((reason) => (
        <Text key={reason} style={{ fontSize: 12, color: '#92400e', marginTop: 4, lineHeight: 17 }}>
          • {reason}
        </Text>
      ))}

      <Text style={{ fontSize: 12, fontWeight: '800', color: '#92400e', marginTop: 10, marginBottom: 6 }}>
        What is it?
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {choices.map((choice) => (
          <TouchableOpacity
            key={choice.foodId}
            onPress={() => onChoose(choice.foodId)}
            activeOpacity={0.8}
            accessibilityRole="button"
            style={{
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 18,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#f0c36d',
              marginRight: 8,
              marginBottom: 8
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#78350f' }}>
              {choice.name} {Math.round(choice.confidence * 100)}%
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={onOther}
          activeOpacity={0.8}
          accessibilityRole="button"
          style={{
            paddingVertical: 7,
            paddingHorizontal: 12,
            borderRadius: 18,
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#f0c36d',
            marginBottom: 8
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#78350f' }}>Something else…</Text>
        </TouchableOpacity>
      </View>

      {foodName && !low ? (
        <TouchableOpacity
          onPress={onConfirm}
          activeOpacity={0.85}
          accessibilityRole="button"
          style={{ marginTop: 4, alignSelf: 'flex-start', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.primary }}
        >
          <Text style={{ color: C.onPrimary, fontSize: 13, fontWeight: '800' }}>Yes, it is {foodName}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** One food found in a photo of several. */
export function ObjectRow({ index, object, foodName, included, onToggle, onChange }) {
  const color = boxColor(object);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.card,
        borderRadius: 14,
        padding: 12,
        marginBottom: 8,
        opacity: included ? 1 : 0.55
      }}
    >
      <TouchableOpacity onPress={onToggle} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: included }}>
        <Ionicons name={included ? 'checkbox' : 'square-outline'} size={24} color={C.primary} />
      </TouchableOpacity>

      <View themed={false} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center', marginLeft: 10 }}>
        <Text themed={false} style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>{index + 1}</Text>
      </View>

      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>{foodName || 'Unknown food'}</Text>
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          {object.freshnessTierLabel} · {Math.round(object.freshnessPercent || 0)}% freshness ·{' '}
          {Math.round((object.confidence || 0) * 100)}% food match
        </Text>
        {object.review?.needsConfirmation ? (
          <Text style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>{object.review.reasons[0]}</Text>
        ) : null}
      </View>

      <TouchableOpacity onPress={onChange} hitSlop={8} accessibilityRole="button" accessibilityLabel="Change food">
        <Text style={{ fontSize: 12, fontWeight: '800', color: C.primary }}>Change</Text>
      </TouchableOpacity>
    </View>
  );
}
