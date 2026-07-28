import { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES } from '../data/foodCatalog';
import { useInventory } from '../context/InventoryContext';

const BRAND = '#16567b';
const ACCENT_BLUE = '#2563eb';

export function ShelfScreen() {
  const { prioritized, freezeItem, discardItem, removeItem } = useInventory();
  const [activeTab, setActiveTab] = useState('All');
  const [selected, setSelected] = useState(null);

  const items = prioritized.filter((item) => activeTab === 'All' || item.category === activeTab);

  const openItem = (item) => setSelected(item);

  const onFreeze = async () => {
    if (!selected) return;
    await freezeItem(selected.id);
    Alert.alert('Frozen', `${selected.title} countdown paused (TTI reduced).`);
    setSelected(null);
  };

  const onDiscard = async () => {
    if (!selected) return;
    Alert.alert('Discard item?', `Remove ${selected.title} from inventory?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardItem(selected.id);
          setSelected(null);
        }
      }
    ]);
  };

  return (
    <View className="flex-1 bg-white">
      <View className="px-5 pt-12 pb-2">
        <View className="flex-row items-center justify-between mb-5">
          <Text className="text-2xl font-bold text-slate-900">Shelf</Text>
          <Text className="text-slate-500 text-sm">{items.length} items</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
          <View className="flex-row">
            {CATEGORIES.map((category) => {
              const active = activeTab === category;
              return (
                <TouchableOpacity key={category} onPress={() => setActiveTab(category)} className="mr-2">
                  <View
                    className="rounded-xl px-5 py-2.5 border"
                    style={{
                      backgroundColor: active ? BRAND : '#ffffff',
                      borderColor: active ? BRAND : '#cbd5e1'
                    }}
                  >
                    <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-slate-800'}`}>
                      {category}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => openItem(item)}
            activeOpacity={0.85}
            className="rounded-2xl border border-slate-200 bg-white mb-4 overflow-hidden"
          >
            <View className="flex-row p-3">
              {item.imageUri ? (
                <Image source={{ uri: item.imageUri }} className="h-28 w-28 rounded-xl" />
              ) : (
                <View className="h-28 w-28 rounded-xl bg-slate-100 items-center justify-center">
                  <Ionicons name="image-outline" size={28} color="#94a3b8" />
                </View>
              )}
              <View className="flex-1 ml-3 justify-between py-0.5">
                <View className="flex-row justify-between items-start">
                  <View className="flex-1 pr-2">
                    <Text className="text-lg font-bold text-slate-900">
                      {item.title}
                      {item.frozen ? ' ❄️' : ''}
                    </Text>
                    <Text className="text-sm text-slate-500 mt-0.5">{item.subtitle}</Text>
                    <Text className="text-xs text-slate-400 mt-1">Priority #{item.priorityRank}</Text>
                  </View>
                  <View className="items-end">
                    <View className="rounded-full bg-red-100 px-2.5 py-1 mb-1">
                      <Text className="text-xs font-semibold text-red-600">{item.freshnessLabel}</Text>
                    </View>
                    <Text className="text-sm font-semibold text-red-600">{item.daysLabel}</Text>
                  </View>
                </View>

                <View className="flex-row items-center justify-between mt-2">
                  <Text className="text-xs text-slate-400">{item.scannedLabel}</Text>
                  <View className="flex-row items-center">
                    <Text className="text-sm font-semibold text-slate-900 mr-1">Edit</Text>
                    <Ionicons name="create-outline" size={16} color="#0f172a" />
                  </View>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {items.length === 0 ? (
          <View className="items-center mt-16 px-6">
            <Ionicons name="file-tray-outline" size={48} color="#cbd5e1" />
            <Text className="text-slate-500 mt-3 text-center">No items in this category. Scan packaging to add food.</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View className="flex-1 bg-black/45 justify-center px-4">
          <Pressable className="absolute inset-0" onPress={() => setSelected(null)} />
          <View className="bg-white rounded-3xl p-5 max-h-[90%]">
            {selected && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View className="items-end mb-2">
                  <TouchableOpacity
                    onPress={() => setSelected(null)}
                    className="h-9 w-9 rounded-full items-center justify-center"
                    style={{ backgroundColor: BRAND }}
                  >
                    <Ionicons name="close" size={20} color="#ffffff" />
                  </TouchableOpacity>
                </View>

                <View className="rounded-2xl overflow-hidden mb-4 h-44 bg-slate-100">
                  {selected.imageUri ? (
                    <Image source={{ uri: selected.imageUri }} className="h-full w-full" />
                  ) : null}
                </View>

                <View className="flex-row items-start justify-between mb-2">
                  <View className="flex-1 pr-3">
                    <Text className="text-3xl font-bold text-slate-900">{selected.title}</Text>
                    <Text className="text-base text-slate-500 mt-1">{selected.subtitle}</Text>
                  </View>
                  <TouchableOpacity hitSlop={10} onPress={onDiscard}>
                    <Ionicons name="trash-outline" size={24} color="#0f172a" />
                  </TouchableOpacity>
                </View>

                <View className="rounded-full bg-red-500 self-start px-3 py-1.5 mb-2">
                  <Text className="text-xs font-bold text-white">{selected.freshnessLabel}</Text>
                </View>
                <Text className="text-sm text-slate-500 mb-4">
                  Risk {(selected.riskScore * 100).toFixed(0)}% · {selected.urgency} · {selected.daysLabel}
                </Text>

                {!selected.frozen ? (
                  <TouchableOpacity
                    className="rounded-2xl py-4 px-4 mb-4 flex-row items-center"
                    style={{ backgroundColor: ACCENT_BLUE }}
                    onPress={onFreeze}
                  >
                    <View className="h-10 w-10 rounded-full bg-white/20 items-center justify-center mr-3">
                      <Ionicons name="snow" size={22} color="#ffffff" />
                    </View>
                    <View>
                      <Text className="text-white text-lg font-bold">FREEZE NOW</Text>
                      <Text className="text-white/90 text-sm">Pause countdown (Freeze)</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View className="rounded-2xl py-4 px-4 mb-4 bg-sky-100">
                    <Text className="text-sky-900 font-bold">Frozen — TTI countdown paused</Text>
                  </View>
                )}

                <View className="rounded-2xl bg-slate-100 border border-slate-200 p-4 mb-4">
                  <Text className="text-base font-bold text-slate-900 mb-2">
                    {selected.recommendations.bestPractice.title}
                  </Text>
                  <Text className="text-sm text-slate-600 leading-5">
                    {selected.recommendations.bestPractice.storage}
                  </Text>
                  <Text className="text-sm text-slate-600 mt-1">
                    {selected.recommendations.bestPractice.freezeBy}
                  </Text>
                </View>

                <View className="rounded-2xl border border-slate-200 p-4 mb-4">
                  <Text className="font-bold text-slate-900 mb-2">Recommended actions</Text>
                  {selected.recommendations.ruleBased.map((a) => (
                    <Text key={a.id} className="text-sm text-slate-700 mb-1">
                      • {a.label} — {a.description}
                    </Text>
                  ))}
                  <Text className="font-semibold text-slate-800 mt-3 mb-1">Usage suggestions</Text>
                  {selected.recommendations.contentBased.usageSuggestions.map((tip) => (
                    <Text key={tip} className="text-sm text-slate-600 mb-1">
                      • {tip}
                    </Text>
                  ))}
                </View>

                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-base font-bold text-slate-900">
                    Expected Expiry:{' '}
                    {selected.expiryDate
                      ? new Date(selected.expiryDate).toLocaleDateString(undefined, {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      : 'Estimated only'}
                  </Text>
                  {(selected.urgency === 'critical' || selected.urgency === 'high') && (
                    <View className="h-7 w-7 rounded-full bg-red-500 items-center justify-center">
                      <Text className="text-white font-bold">!</Text>
                    </View>
                  )}
                </View>

                <View className="rounded-2xl bg-slate-100 border border-slate-200 p-4 mb-2">
                  <View className="flex-row items-center justify-between mb-3">
                    <Text className="text-base font-bold text-slate-900">Tracking History</Text>
                    <Text className="text-sm text-slate-500">{selected.scannedLabel}</Text>
                  </View>
                  {(selected.history || []).map((h, idx) => (
                    <Text key={`${h.at}-${idx}`} className="text-sm text-slate-600 mb-1">
                      • {h.event} — {new Date(h.at).toLocaleString()}
                    </Text>
                  ))}
                  <Text className="text-sm text-slate-600 mt-2">
                    TTI remaining: {selected.tti.remainingLifeDays} days → Risk {(selected.riskScore * 100).toFixed(0)}%
                  </Text>
                </View>

                <TouchableOpacity
                  className="mt-2 py-3 items-center"
                  onPress={() => {
                    removeItem(selected.id);
                    setSelected(null);
                  }}
                >
                  <Text className="text-red-500 font-semibold">Remove permanently</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
