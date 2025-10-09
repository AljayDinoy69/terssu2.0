import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, TextInputProps } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface PasswordInputProps extends TextInputProps {
  value: string | undefined;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: any;
  inputStyle?: any;
  darkMode?: boolean;
  showSuccess?: boolean;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChangeText,
  placeholder = 'Password',
  style,
  inputStyle,
  darkMode = false,
  showSuccess = false,
  ...props
}) => {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  return (
    <View
      style={[
        styles.container,
        darkMode && styles.containerDark,
        style,
      ]}
    >
      <TextInput
        style={[styles.input, darkMode && styles.inputDark, inputStyle]}
        value={value || ''}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={darkMode ? '#777' : '#999'}
        secureTextEntry={!isPasswordVisible}
        {...props}
      />
      <TouchableOpacity
        style={styles.iconContainer}
        onPress={togglePasswordVisibility}
      >
        <MaterialIcons
          name={isPasswordVisible ? 'visibility-off' : 'visibility'}
          size={24}
          color={darkMode ? '#bbb' : '#666'}
        />
      </TouchableOpacity>
      {showSuccess && (
        <View style={styles.successContainer}>
          <MaterialIcons name="check" size={18} color="#000" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  containerDark: {
    borderColor: '#333',
    backgroundColor: '#1a1a2e',
  },
  input: {
    flex: 1,
    padding: 12,
    color: '#000',
  },
  inputDark: {
    color: '#fff',
  },
  iconContainer: {
    padding: 10,
    marginRight: 4,
  },
  successContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#00ff88',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
});
