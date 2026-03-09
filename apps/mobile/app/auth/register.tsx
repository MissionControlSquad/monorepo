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
import { styled } from "nativewind";

const StyledView = styled(View);
const StyledTextInput = styled(TextInput);
const StyledText = styled(Text);
const StyledTouchableOpacity = styled(TouchableOpacity);

export default function RegisterScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      // TODO: Call GraphQL mutation to register
      Alert.alert("Success", "Account created. Please log in.");
      router.replace("/auth/login");
    } catch (error) {
      Alert.alert("Registration Failed", "Please try again");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StyledView className="flex-1 justify-center px-6 py-8">
        <StyledText className="text-3xl font-bold text-center mb-8 text-black">
          Create Account
        </StyledText>

        <StyledTextInput
          className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base"
          placeholder="Full Name"
          value={name}
          onChangeText={setName}
          editable={!loading}
          placeholderTextColor="#999"
        />

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
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <StyledText className="text-white font-semibold text-lg">
              Register
            </StyledText>
          )}
        </StyledTouchableOpacity>

        <StyledText className="text-center text-gray-600">
          Already have an account?{" "}
          <Text
            className="text-blue-600 font-semibold"
            onPress={() => router.push("/auth/login")}
          >
            Login
          </Text>
        </StyledText>
      </StyledView>
    </SafeAreaView>
  );
}
