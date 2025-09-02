import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, TextInputProps } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface PasswordInputProps extends TextInputProps {
  value: string | undefined;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: any;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChangeText,
  placeholder = 'Password',
  style,
  ...props
}) => {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
  };

  return (
    <View style={[styles.container, style]}>
      <TextInput
        style={styles.input}
        value={value || ''}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#999"
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
          color="#666"
        />
      </TouchableOpacity>
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
  input: {
    flex: 1,
    padding: 12,
    color: '#000',
  },
  iconContainer: {
    padding: 10,
  },
});
