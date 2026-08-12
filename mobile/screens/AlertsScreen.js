import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useInventory } from '../context/InventoryContext';

const BRAND = '#16567b';

const URGENCY_COLOR = {
  critical: '#ef4444',
  high: '#f97316',
  moderate: '#eab308',
  low: '#22c55e'
};

export function AlertsScreen() {
  const navigation = useNavigation();
  const { alerts, unreadAlertCount, markAlertRead, markAllAlertsRead, getItemById } = useInventory();

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 120 }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-2xl font-bold text-slate-900">Alerts</Text>
        {unreadAlertCount > 0 ? (
          <TouchableOpacity onPress={markAllAlertsRead}>
            <Text className="font-semibold" style={{ color: BRAND }}>
              Mark all read
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text className="text-slate-500 mb-5">
        High-risk and near-expiry items from weighted risk scoring
      </Text>

      {alerts.length === 0 ? (
        <View className="items-center mt-20 px-6">
          <Ionicons name="checkmark-circle-outline" size={56} color="#86efac" />
          <Text className="text-slate-700 font-semibold mt-3 text-center">No active alerts</Text>
          <Text className="text-slate-400 text-center mt-1">
            You will be notified when items become high risk or near expiry.
          </Text>
        </View>
      ) : (
        alerts.map((alert) => (
          <TouchableOpacity
            key={alert.id}
            activeOpacity={0.85}
            onPress={() => {
              markAlertRead(alert.itemId);
              const item = getItemById(alert.itemId);
              if (item) navigation.navigate('Shelf');
            }}
            className="rounded-2xl border border-slate-200 bg-white p-4 mb-3"
            style={{ opacity: alert.read ? 0.65 : 1 }}
          >
            <View className="flex-row items-start">
              <View
                className="h-10 w-10 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: URGENCY_COLOR[alert.urgency] || BRAND }}
              >
                <Ionicons name="warning" size={20} color="#fff" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="font-bold text-slate-900 text-base">{alert.title}</Text>
                  {!alert.read ? <View className="h-2.5 w-2.5 rounded-full bg-red-500" /> : null}
                </View>
                <Text className="text-sm text-slate-600 mt-1 leading-5">{alert.message}</Text>
                <Text className="text-xs text-slate-400 mt-2 uppercase tracking-wide">
                  {alert.urgency} · risk {Math.round(alert.riskScore * 100)}%
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}
