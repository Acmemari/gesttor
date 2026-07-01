import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { insertRecord } from '../database/db';
import { Tag, Scale, Activity, FileText, ChevronLeft } from 'lucide-react-native';

interface CollectScreenProps {
  onBack: () => void;
  onSaveSuccess: () => void;
}

export default function CollectScreen({ onBack, onSaveSuccess }: CollectScreenProps) {
  const [animalId, setAnimalId] = useState('');
  const [weight, setWeight] = useState('');
  const [vaccination, setVaccination] = useState('');
  const [observations, setObservations] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!animalId.trim()) {
      Alert.alert('Erro', 'Por favor, digite a identificação do animal (Brinco).');
      return;
    }

    const parsedWeight = parseFloat(weight.replace(',', '.'));
    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      Alert.alert('Erro', 'Por favor, digite um peso válido maior que zero.');
      return;
    }

    setSaving(true);

    try {
      await insertRecord({
        animal_id: animalId.trim().toUpperCase(),
        weight: parsedWeight,
        vaccination: vaccination.trim(),
        observations: observations.trim(),
        created_at: new Date().toISOString(),
      });

      Alert.alert('Sucesso', 'Registro salvo localmente com sucesso!', [
        {
          text: 'OK',
          onPress: () => {
            onSaveSuccess();
            onBack();
          },
        },
      ]);
    } catch (error) {
      Alert.alert('Erro', 'Falha ao salvar registro no banco local.');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ChevronLeft size={24} color="#ffffff" />
          <Text style={styles.backText}>Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nova Coleta</Text>
        <View style={{ width: 60 }} /> {/* Spacer */}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.form}>
          {/* Animal ID */}
          <Text style={styles.label}>Brinco / Identificador do Animal</Text>
          <View style={styles.inputContainer}>
            <Tag size={20} color="#a0a0a2" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Ex: BR1052"
              placeholderTextColor="#606062"
              autoCapitalize="characters"
              value={animalId}
              onChangeText={setAnimalId}
              editable={!saving}
            />
          </View>

          {/* Weight */}
          <Text style={styles.label}>Peso (kg)</Text>
          <View style={styles.inputContainer}>
            <Scale size={20} color="#a0a0a2" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Ex: 450.5"
              placeholderTextColor="#606062"
              keyboardType="numeric"
              value={weight}
              onChangeText={setWeight}
              editable={!saving}
            />
          </View>

          {/* Vaccination */}
          <Text style={styles.label}>Vacina Aplicada (Opcional)</Text>
          <View style={styles.inputContainer}>
            <Activity size={20} color="#a0a0a2" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Ex: Febre Aftosa"
              placeholderTextColor="#606062"
              value={vaccination}
              onChangeText={setVaccination}
              editable={!saving}
            />
          </View>

          {/* Observations */}
          <Text style={styles.label}>Observações (Opcional)</Text>
          <View style={[styles.inputContainer, styles.textAreaContainer]}>
            <FileText size={20} color="#a0a0a2" style={[styles.inputIcon, { marginTop: 12 }]} />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ex: Animal calmo, sem sintomas visíveis"
              placeholderTextColor="#606062"
              multiline
              numberOfLines={4}
              value={observations}
              onChangeText={setObservations}
              editable={!saving}
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>Salvar Offline</Text>
          </TouchableOpacity>

          {/* Cancel Button */}
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onBack}
            disabled={saving}
          >
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121214',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e24',
    backgroundColor: '#1e1e24',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    color: '#ffffff',
    fontSize: 16,
    marginLeft: 4,
    fontWeight: '500',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollContainer: {
    padding: 24,
  },
  form: {
    backgroundColor: '#1e1e24',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a30',
  },
  label: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a30',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a40',
    paddingHorizontal: 12,
    height: 50,
  },
  textAreaContainer: {
    height: 100,
    alignItems: 'flex-start',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    height: '100%',
  },
  textArea: {
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  saveButton: {
    backgroundColor: '#2e7d32',
    height: 50,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    height: 50,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#3a3a40',
  },
  cancelButtonText: {
    color: '#a0a0a2',
    fontSize: 16,
    fontWeight: '500',
  },
});
