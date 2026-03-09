import { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { styled } from "nativewind";

const StyledView = styled(View);
const StyledTextInput = styled(TextInput);
const StyledText = styled(Text);
const StyledTouchableOpacity = styled(TouchableOpacity);

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      // TODO: Call GraphQL mutation to authenticate
      // For now, store a mock token
      const mockToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock.token";
      await SecureStore.setItemAsync("auth_token", mockToken);

      router.replace("/(tabs)/dashboard");
    } catch (error) {
      Alert.alert("Login Failed", "Please check your credentials and try again");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StyledView className="flex-1 justify-center px-6 py-8">
        <StyledText className="text-3xl font-bold text-center mb-8 text-black">
          AgentCenter
        </StyledText>

        <StyledTextInput
          className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base"
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
          placeholderTextColor="#999"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <StyledTextInput
          className="border border-gray-300 rounded-lg px-4 py-3 mb-6 text-base"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
          placeholderTextColor="#999"
        />

        <StyledTouchableOpacity
          className="bg-blue-600 rounded-lg py-3 mb-4 flex-row justify-center items-center"
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <StyledText className="text-white font-semibold text-lg">
              Login
            </StyledText>
          )}
        </StyledTouchableOpacity>

        <StyledText className="text-center text-gray-600 mb-4">
          Don't have an account?{" "}
          <Text
            className="text-blue-600 font-semibold"
            onPress={() => router.push("/auth/register")}
          >
            Register
          </Text>
        </StyledText>
      </StyledView>
    </SafeAreaView>
  );
}
