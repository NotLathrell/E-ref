import { View, Text, Image, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useInventory } from '../context/InventoryContext';

const BRAND = '#16567b';

function SectionPill({ label }) {
  return (
    <View className="self-start rounded-full px-4 py-1.5 mb-3" style={{ backgroundColor: BRAND }}>
      <Text className="text-white text-sm font-semibold">{label}</Text>
    </View>
  );
}

export function HomeScreen() {
  const navigation = useNavigation();
  const { user, soonToSpoil, prioritized, items, unreadAlertCount } = useInventory();

  const topRisk = soonToSpoil[0] || prioritized[0];
  const riskPct = topRisk ? Math.round(topRisk.riskScore * 100) : 0;
  const displayName = user?.name || 'Food Saver';

  const categoryCounts = ['Produce', 'Dairy', 'Meat', 'Pantry'].map((cat) => ({
    label: cat,
    count: items.filter((i) => i.category === cat).length
  }));

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 120 }}
    >
      <View className="flex-row items-center justify-between mb-5">
        <Text className="text-2xl font-bold text-slate-900">Home</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Alerts')} hitSlop={12} className="relative">
          <Ionicons name="notifications-outline" size={24} color="#0f172a" />
          {unreadAlertCount > 0 ? (
            <View className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-red-500 items-center justify-center">
              <Text className="text-white text-[10px] font-bold">{unreadAlertCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <Text className="text-4xl font-bold text-slate-950 mb-5 leading-tight">Hello {displayName}</Text>

      <View className="rounded-3xl overflow-hidden mb-6 h-48">
        <Image
          source={{
            uri: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80'
          }}
          className="absolute inset-0 h-full w-full"
        />
        <View className="absolute inset-0 bg-black/45 items-center justify-center px-7">
          <Text className="text-center text-white text-lg font-bold leading-6">
            &quot;Freeze excess food to extend its shelf life for future use.&quot;
          </Text>
        </View>
      </View>

      <SectionPill label="Overview" />

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => (topRisk ? navigation.navigate('Shelf') : navigation.navigate('Scan'))}
        className="rounded-3xl bg-slate-100 px-5 py-5 mb-6"
      >
        <View className="flex-row items-start justify-between mb-4">
          <View className="flex-1 pr-3">
            <Text className="text-slate-900 font-bold text-lg">Soon to Spoil</Text>
            <Text className="text-slate-500 mt-1">
              {topRisk
                ? `${topRisk.title} — ${topRisk.daysLabel}`
                : 'No urgent items. Scan food to start monitoring.'}
            </Text>
          </View>
          <View className="h-14 w-14 rounded-full overflow-hidden bg-white border border-slate-200 items-center justify-center">
            {topRisk?.imageUri ? (
              <Image source={{ uri: topRisk.imageUri }} className="h-full w-full" />
            ) : (
              <Ionicons name="nutrition-outline" size={28} color={BRAND} />
            )}
          </View>
        </View>

        <View className="flex-row items-center justify-between mb-1">
          <View className="flex-1 h-2.5 rounded-full bg-slate-300 overflow-hidden mr-3">
            <View
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, riskPct)}%`, backgroundColor: riskPct >= 55 ? '#ef4444' : '#0f172a' }}
            />
          </View>
          <Text className="text-sm font-bold text-slate-900">{riskPct}%</Text>
        </View>
        <Text className="text-xs text-slate-500 mt-1">
          Weighted risk · {soonToSpoil.length} item(s) within 72 hours
        </Text>
      </TouchableOpacity>

      <SectionPill label="Priority Queue" />
      <View className="mb-6">
        {prioritized.slice(0, 3).map((item) => (
          <View key={item.id} className="rounded-2xl border border-slate-200 px-4 py-3 mb-2 flex-row items-center">
            <View className="h-8 w-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: BRAND }}>
              <Text className="text-white font-bold text-xs">#{item.priorityRank}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-slate-900">{item.title}</Text>
              <Text className="text-xs text-slate-500">
                {item.daysLabel} · {item.recommendations.primaryAction.label}
              </Text>
            </View>
            <Text className="text-xs font-bold text-red-500">{item.freshnessPercent}%</Text>
          </View>
        ))}
        {prioritized.length === 0 ? (
          <Text className="text-slate-400">Inventory empty — use Scan to add items.</Text>
        ) : null}
      </View>

      <SectionPill label="Categories" />
      <View className="flex-row flex-wrap -mx-1.5">
        {categoryCounts.map((item) => (
          <TouchableOpacity
            key={item.label}
            className="w-1/2 px-1.5 mb-3"
            onPress={() => navigation.navigate('Shelf')}
          >
            <View className="rounded-3xl bg-slate-100 aspect-square items-center justify-center">
              <Text className="text-slate-800 font-semibold">{item.label}</Text>
              <Text className="text-slate-400 mt-1">{item.count} items</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
