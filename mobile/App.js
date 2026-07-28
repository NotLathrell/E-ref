import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { View, Pressable, Text } from 'react-native';
import { HomeScreen } from './screens/HomeScreen';
import { ShelfScreen } from './screens/ShelfScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AuthScreen } from './screens/AuthScreen';
import { CameraScreen } from './screens/CameraScreen';
import { AlertsScreen } from './screens/AlertsScreen';
import { Ionicons } from '@expo/vector-icons';
import { InventoryProvider, useInventory } from './context/InventoryContext';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { unreadAlertCount } = useInventory();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.7)',
        tabBarStyle: {
          backgroundColor: '#16567b',
          borderTopWidth: 0,
          height: 68,
          paddingBottom: 8,
          paddingTop: 8
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => {
          let iconName = 'home';
          if (route.name === 'Shelf') iconName = 'file-tray-stacked';
          if (route.name === 'Scan') iconName = 'camera';
          if (route.name === 'Alerts') iconName = 'notifications';
          if (route.name === 'Profile') iconName = 'person-circle';
          return (
            <View>
              <Ionicons name={iconName} size={size} color={color} />
              {route.name === 'Alerts' && unreadAlertCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -10,
                    backgroundColor: '#ef4444',
                    borderRadius: 8,
                    minWidth: 16,
                    height: 16,
                    paddingHorizontal: 3,
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                    {unreadAlertCount > 9 ? '9+' : unreadAlertCount}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        }
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Shelf" component={ShelfScreen} />
      <Tab.Screen
        name="Scan"
        component={CameraScreen}
        options={{
          tabBarButton: (props) => (
            <Pressable {...props} style={{ alignItems: 'center', justifyContent: 'center', top: -16 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: '#44ae5f',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.15,
                  shadowRadius: 8,
                  elevation: 5
                }}
              >
                <Ionicons name="camera" size={28} color="white" />
              </View>
            </Pressable>
          ),
          tabBarLabel: () => null
        }}
      />
      <Tab.Screen name="Alerts" component={AlertsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <InventoryProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Auth" component={AuthScreen} />
          <Stack.Screen name="Main" component={MainTabs} />
        </Stack.Navigator>
      </NavigationContainer>
    </InventoryProvider>
  );
}
