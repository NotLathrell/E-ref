import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useInventory } from '../context/InventoryContext';

const BRAND = '#16567b';
const BRAND_GREEN = '#44ae5f';

function BrandLogo() {
  return (
    <View className="items-center mb-2">
      <View
        className="h-24 w-24 rounded-full overflow-hidden items-center justify-center"
        style={{ backgroundColor: '#f3f4f6' }}
      >
        <View className="flex-row h-full w-full">
          <View
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: BRAND_GREEN }}
          >
            <Ionicons name="leaf" size={36} color="#ffffff" />
          </View>
          <View
            className="flex-1 items-center justify-center"
            style={{ backgroundColor: BRAND }}
          >
            <Ionicons name="time" size={34} color="#ffffff" />
            <Text className="text-white text-[10px] font-bold -mt-1">:00</Text>
          </View>
        </View>
      </View>
      <Text
        className="mt-4 text-4xl font-bold tracking-wide"
        style={{ color: BRAND }}
      >
        E-REF
      </Text>
      <Text
        className="mt-1 text-xs font-semibold tracking-widest"
        style={{ color: BRAND }}
      >
        FOOD SPOILAGE PREDICTION
      </Text>
      <Text className="mt-2 text-sm text-slate-600">
        Scan, predict, and reduce food waste.
      </Text>
    </View>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const navigation = useNavigation();
  const { signIn } = useInventory();

  const handleSubmit = async () => {
    if (mode === 'signup' && name.trim().length === 0) {
      setError('Please enter your name');
      return;
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError('');

    try {
      // Replace with your backend API call
      console.log('Signing in with:', email, password);

      await signIn({
        name: name.trim() || email.split('@')[0],
        email: email.trim(),
      });

      navigation.replace('Main');
    } catch (err) {
      setError('Authentication failed. Please try again.');
    }
  };

  const handleResetPassword = () => {
    if (!email) {
      setError('Please enter your email to reset password.');
      return;
    }
    // Replace with backend reset password API
    console.log('Reset password for:', email);
    Alert.alert('Password reset link sent to your email (demo).');
  };

  const isSignIn = mode === 'signin';

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        className="flex-1 bg-white"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 28,
          paddingTop: 56,
          paddingBottom: 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <BrandLogo />

        <View className="mt-10 mb-8">
          <Text className="text-2xl font-bold text-slate-900">
            Hi, Welcome back!
          </Text>
          <Text className="mt-1 text-base text-slate-400">
            hope your doing fine.
          </Text>
        </View>

        {mode === 'signup' && (
          <View className="mb-4">
            <Text className="text-slate-400 mb-2">Name:</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900"
              placeholder="Please enter your name"
              placeholderTextColor="#94a3b8"
            />
          </View>
        )}

        <View className="mb-4">
          <Text className="text-slate-400 mb-2">Email:</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900"
            placeholder={isSignIn ? '' : 'Please enter your email address'}
            placeholderTextColor="#94a3b8"
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View className="mb-4">
          <Text className="text-slate-400 mb-2">Password:</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900"
            placeholder={isSignIn ? '' : 'Please enter your password'}
            placeholderTextColor="#94a3b8"
            secureTextEntry
          />
        </View>

        {mode === 'signup' && (
          <View className="mb-4">
            <Text className="text-slate-400 mb-2">Password:</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-slate-900"
              placeholder="Please enter your password again"
              placeholderTextColor="#94a3b8"
              secureTextEntry
            />
          </View>
        )}

        {error ? <Text className="text-red-600 mb-3">{error}</Text> : null}

        {isSignIn ? (
          <TouchableOpacity
            onPress={() => setMode('signup')}
            className="self-end mb-5"
          >
            <Text className="text-slate-500">
              Don&apos;t have an account yet?{' '}
              <Text className="font-bold" style={{ color: BRAND }}>
                Sign Up
              </Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => setMode('signin')}
            className="self-end mb-5"
          >
            <Text className="text-slate-500">
              Already have an account?{' '}
              <Text className="font-bold" style={{ color: BRAND }}>
                Sign In Instead
              </Text>
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          className="rounded-2xl py-4 items-center mb-5"
          style={{ backgroundColor: BRAND }}
          onPress={handleSubmit}
        >
          <Text className="text-white text-lg font-bold">
            {isSignIn ? 'Sign In' : 'Sign Up'}
          </Text>
        </TouchableOpacity>

        {isSignIn && (
          <TouchableOpacity
            onPress={handleResetPassword}
            className="self-end"
          >
            <Text className="text-slate-500">
              You don&apos;t have access?{' '}
              <Text className="font-bold" style={{ color: BRAND }}>
                Reset Password
              </Text>
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
