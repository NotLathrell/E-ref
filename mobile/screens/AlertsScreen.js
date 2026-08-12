import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useInventory } from '../context/InventoryContext';

const BRAND = '#16567b';

const scrollContentStyle = {
  paddingHorizontal: 20,
  paddingTop: 52,
  paddingBottom: 120,
};

const headerContainerStyle = {
  marginBottom: 12,
};

const headerTitleStyle = {
  fontSize: 21,
  fontWeight: '800',
  color: '#111111',
};

const alertCardStyle = (read) => ({
  minHeight: 60,
  backgroundColor: BRAND,
  borderRadius: 10,
  paddingHorizontal: 13,
  paddingVertical: 10,
  marginBottom: 6,
  justifyContent: 'center',
  opacity: read ? 0.65 : 1,
});

const alertTitleStyle = {
  color: '#FFFFFF',
  fontSize: 20,
  fontWeight: '800',
};

const alertMessageStyle = {
  color: '#DCE9F2',
  fontSize: 12,
  marginTop: 2,
};

export function AlertsScreen() {
  const navigation = useNavigation();
  const { alerts, markAlertRead, getItemById } = useInventory();

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={scrollContentStyle}
    >
      <View style={headerContainerStyle}>
        <Text style={headerTitleStyle}>Alerts</Text>
      </View>

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

              if (item) {
                navigation.navigate('Shelf');
              }
            }}
            style={alertCardStyle(alert.read)}
          >
            <Text
              style={alertTitleStyle}
              numberOfLines={1}
            >
              {alert.title}
            </Text>

            <Text
              style={alertMessageStyle}
              numberOfLines={2}
            >
              {alert.message}
            </Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}
