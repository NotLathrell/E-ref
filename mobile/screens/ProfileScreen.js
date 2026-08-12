import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { getLocalIpAddress } from '../utils/network';
import { API_HOST, API_URL } from '../config';
import { useInventory } from '../context/InventoryContext';

const BRAND = '#16567b';

export function ProfileScreen() {
  const navigation = useNavigation();
  const { user, signOut, items, soonToSpoil, alerts } = useInventory();
  const [deviceIp, setDeviceIp] = useState('Detecting...');
  const [override, setOverride] = useState('');
  const [pushEnabled, setPushEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    getLocalIpAddress().then((ip) => {
      if (ip) {
        setDeviceIp(ip);
      } else {
        setDeviceIp('Unavailable');
      }
    });
  }, []);

  const apiUrl = useMemo(() => {
    if (override.trim().length > 0) {
      return `http://${override.trim()}`;
    }
    return API_URL;
  }, [override]);

  const onLogout = () => {
    Alert.alert('Log out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          const parent = navigation.getParent()?.getParent() || navigation.getParent() || navigation;
          parent.dispatch(
            CommonActions.reset({
              index: 0,
              routes: [{ name: 'Auth' }]
            })
          );
        }
      }
    ]);
  };

  const menuItems = [
    {
      id: 'password',
      title: 'Change Password',
      onPress: () => Alert.alert('Change Password', 'Password update will be available with full auth backend.')
    },
    {
      id: 'privacy',
      title: 'Privacy & Terms',
      onPress: () =>
        Alert.alert(
          'Privacy & Terms',
          'E-Ref processes food images locally for OCR/CNN demo analysis and stores inventory on this device.'
        )
    },
    {
      id: 'about',
      title: 'About',
      onPress: () =>
        Alert.alert(
          'E-REF',
          'Food spoilage monitoring & prioritization system using OCR, CNN, TTI, Weighted Risk Scoring, Greedy prioritization, and hybrid recommendations.'
        )
    },
    { id: 'logout', title: 'Log Out', onPress: onLogout }
  ];

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 120 }}
    >
      <Text className="text-2xl font-bold text-slate-900 mb-5">Profile</Text>

      <View className="rounded-2xl border border-slate-200 bg-white py-8 px-5 mb-4 items-center">
        <View className="h-24 w-24 rounded-full bg-slate-200 items-center justify-center mb-4">
          <Ionicons name="person" size={48} color="#94a3b8" />
        </View>
        <Text className="text-xl font-bold text-slate-900">{user?.name || 'Guest'}</Text>
        <Text className="text-sm text-slate-400 mt-1">{user?.email || 'Not signed in'}</Text>
        <Text className="text-xs text-slate-400 mt-3">
          {items.length} shelf items · {soonToSpoil.length} soon to spoil · {alerts.length} alerts
        </Text>
      </View>

      <View className="rounded-2xl border border-slate-200 bg-white px-5 py-4 mb-3 flex-row items-center justify-between">
        <View className="flex-1 pr-4">
          <Text className="text-base font-bold text-slate-900">Push Notifications</Text>
          <Text className="text-sm text-slate-400 mt-1 leading-5">
            Allow notification for high-risk and near-expiry items
          </Text>
        </View>
        <Switch
          value={pushEnabled}
          onValueChange={setPushEnabled}
          trackColor={{ false: '#cbd5e1', true: BRAND }}
          thumbColor="#ffffff"
        />
      </View>

      <View className="rounded-2xl border border-slate-200 bg-white px-5 py-4 mb-3 flex-row items-center justify-between">
        <View className="flex-1 pr-4">
          <Text className="text-base font-bold text-slate-900">Dark Mode</Text>
          <Text className="text-sm text-slate-400 mt-1 leading-5">Allow theme preference dark mode</Text>
        </View>
        <Switch
          value={darkMode}
          onValueChange={setDarkMode}
          trackColor={{ false: '#cbd5e1', true: BRAND }}
          thumbColor="#ffffff"
        />
      </View>

      {menuItems.map((item) => (
        <TouchableOpacity
          key={item.id}
          className="rounded-2xl border border-slate-200 bg-white px-5 py-4 mb-3"
          activeOpacity={0.7}
          onPress={item.onPress}
        >
          <Text className="text-base font-bold text-slate-900">{item.title}</Text>
        </TouchableOpacity>
      ))}

      <View className="rounded-2xl border border-slate-200 bg-white p-5 mt-2">
        <Text className="text-slate-900 font-bold mb-2">Current Wi-Fi IP</Text>
        <Text className="text-slate-500 mb-4">{deviceIp}</Text>
        <Text className="text-slate-900 font-bold mb-2">API Host Override</Text>
        <TextInput
          value={override}
          onChangeText={setOverride}
          placeholder="e.g. 192.168.254.109:3000"
          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 mb-3"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          keyboardType="default"
        />
        <TouchableOpacity
          className="rounded-2xl py-3 items-center mb-3"
          style={{ backgroundColor: BRAND }}
          onPress={() => {
            if (deviceIp && deviceIp !== 'Detecting...' && deviceIp !== 'Unavailable') {
              setOverride(`${deviceIp}:3000`);
            }
          }}
        >
          <Text className="text-white font-semibold">Use device IP</Text>
        </TouchableOpacity>
        <Text className="text-slate-900 font-bold mb-2">Configured Host</Text>
        <Text className="text-slate-500 mb-2">{API_HOST}</Text>
        <Text className="text-slate-400 text-sm">API URL: {apiUrl}</Text>
        <Text className="text-slate-400 text-xs mt-3">
          Core OCR/CNN/TTI/risk features currently run on-device. Host is reserved for future model API.
        </Text>
      </View>
    </ScrollView>
  );
}
