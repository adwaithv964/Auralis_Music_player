/**
 * audio/AudioEngineContext.jsx
 * React Context provider for the Auralis DSP Audio Engine.
 * Gives components real-time access to DSP/EQ states, telemetry, and control actions.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { audioEngine } from './AudioEngine';
import { MASTER_PROFILES } from './presets';
import { DEVICE_PROFILES } from './deviceProfiles';

export const AudioEngineContext = createContext(null);

export function AudioEngineProvider({ children }) {
  const [snapshot, setSnapshot] = useState(() => audioEngine.store.getSnapshot());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab,   setActiveTab]   = useState('engine'); // engine | equalizer | spatial | devices | advanced | quality | validation

  // Subscribe to internal AudioEngine state updates
  useEffect(() => {
    const unsubscribe = audioEngine.subscribe(() => {
      setSnapshot(audioEngine.store.getSnapshot());
    });
    return unsubscribe;
  }, []);

  const dspSettings = {
    ...snapshot.prefs,
    engineEnabled: snapshot.prefs.soundEngineEnabled,
  };

  const eqSettings = {
    eqEnabled: snapshot.prefs.eqEnabled,
    activePreset: snapshot.prefs.activeEqPreset,
    bands: snapshot.prefs.eqBands,
  };

  const customPresets = Array.isArray(snapshot.prefs.customEqPresets) ? snapshot.prefs.customEqPresets : [];
  const adaptiveState = snapshot.adaptive;
  const runtimeState = snapshot.runtime;

  // Control Actions
  const toggleOverallProcessing = useCallback((forced) => {
    audioEngine.toggleOverallProcessing(forced);
    audioEngine.resume();
  }, []);

  const toggleEngine = useCallback((forced) => {
    audioEngine.toggleEngine(forced);
    audioEngine.resume();
  }, []);

  const toggleAdaptiveIntelligence = useCallback((forced) => {
    audioEngine.toggleAdaptiveIntelligence(forced);
    audioEngine.resume();
  }, []);

  const setAdaptiveIntensity = useCallback((intensityKey) => {
    audioEngine.setAdaptiveIntensity(intensityKey);
    audioEngine.resume();
  }, []);

  const toggleEqualizer = useCallback((forced) => {
    audioEngine.toggleEqualizer(forced);
    audioEngine.resume();
  }, []);

  const toggleSpatialAudio = useCallback((forced) => {
    audioEngine.toggleSpatialAudio(forced);
    audioEngine.resume();
  }, []);

  const selectMasterProfile = useCallback((profileId) => {
    audioEngine.selectMasterProfile(profileId);
    audioEngine.resume();
  }, []);

  const setIntensity = useCallback((intensityKey) => {
    audioEngine.setIntensity(intensityKey);
    audioEngine.resume();
  }, []);

  const setDeviceProfile = useCallback((deviceKey) => {
    audioEngine.setDeviceProfile(deviceKey);
    audioEngine.resume();
  }, []);

  const toggleLoudnessMatch = useCallback(() => {
    audioEngine.toggleLoudnessMatch();
  }, []);

  const updateDsp = useCallback((updater) => {
    audioEngine.updateDspSettings(updater);
    audioEngine.resume();
  }, []);

  const updateEq = useCallback((updater) => {
    audioEngine.updateEqSettings(updater);
    audioEngine.resume();
  }, []);

  const setEqBand = useCallback((index, gain) => {
    audioEngine.setEqBand(index, gain);
    audioEngine.resume();
  }, []);

  const applyEqPreset = useCallback((presetId) => {
    audioEngine.applyEqPreset(presetId);
    audioEngine.resume();
  }, []);

  const saveCustomEqPreset = useCallback((name) => {
    audioEngine.saveCustomEqPreset(name);
  }, []);

  const resetDsp = useCallback(() => {
    audioEngine.resetDspToDefault();
  }, []);

  const resetEq = useCallback(() => {
    audioEngine.resetEqToFlat();
  }, []);

  const openAudioExperience = useCallback((tab = 'engine') => {
    setActiveTab(tab);
    setIsModalOpen(true);
    audioEngine.resume();
  }, []);

  const closeAudioExperience = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const activeProfileData = MASTER_PROFILES.find(p => p.id === dspSettings.activeProfile) || MASTER_PROFILES[0];
  const activeDeviceData  = DEVICE_PROFILES.find(d => d.id === dspSettings.deviceProfile) || DEVICE_PROFILES[0];

  const value = {
    audioEngine,
    dspSettings,
    eqSettings,
    customPresets,
    adaptiveState,
    runtimeState,
    activeProfileData,
    activeDeviceData,
    isModalOpen,
    activeTab,
    setActiveTab,
    openAudioExperience,
    closeAudioExperience,
    toggleOverallProcessing,
    toggleEngine,
    toggleAdaptiveIntelligence,
    setAdaptiveIntensity,
    toggleEqualizer,
    toggleSpatialAudio,
    selectMasterProfile,
    setIntensity,
    setDeviceProfile,
    toggleLoudnessMatch,
    updateDsp,
    updateEq,
    setEqBand,
    applyEqPreset,
    saveCustomEqPreset,
    resetDsp,
    resetEq,
    getTelemetry: () => audioEngine.getTelemetry(),
    getAcousticHealthAnalysis: () => audioEngine.getAcousticHealthAnalysis(),
    getSourceQuality: (track) => audioEngine.getSourceQuality(track),
    getStreamDiagnostics: () => audioEngine.getStreamDiagnostics(),
  };

  return (
    <AudioEngineContext.Provider value={value}>
      {children}
    </AudioEngineContext.Provider>
  );
}

export const useAudioEngineContext = () => {
  const ctx = useContext(AudioEngineContext);
  if (!ctx) throw new Error('useAudioEngineContext must be used within <AudioEngineProvider>');
  return ctx;
};
