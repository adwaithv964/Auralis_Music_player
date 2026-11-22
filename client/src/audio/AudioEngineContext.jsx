/**
 * audio/AudioEngineContext.jsx
 * React Context provider for the Auralis DSP Audio Engine.
 * Gives components real-time access to DSP/EQ states, telemetry, and control actions.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { audioEngine } from './AudioEngine';
import { MASTER_PROFILES, EQ_PRESETS } from './presets';
import { DEVICE_PROFILES } from './deviceProfiles';

export const AudioEngineContext = createContext(null);

export function AudioEngineProvider({ children }) {
  const [dspSettings, setDspSettings] = useState(() => audioEngine.dspSettings);
  const [eqSettings,  setEqSettings]  = useState(() => audioEngine.eqSettings);
  const [customPresets, setCustomPresets] = useState(() => audioEngine.customEqPresets);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab,   setActiveTab]   = useState('engine'); // engine | equalizer | spatial | devices | advanced | quality | validation

  // Subscribe to internal AudioEngine state updates
  useEffect(() => {
    const unsubscribe = audioEngine.subscribe(({ dsp, eq }) => {
      setDspSettings({ ...dsp });
      setEqSettings({ ...eq });
      setCustomPresets([...audioEngine.customEqPresets]);
    });
    return unsubscribe;
  }, []);

  // Control Actions
  const toggleEngine = useCallback((forced) => {
    audioEngine.toggleEngine(forced);
    audioEngine.resume();
  }, []);

  const toggleEqualizer = useCallback((forced) => {
    audioEngine.toggleEqualizer(forced);
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
    activeProfileData,
    activeDeviceData,
    isModalOpen,
    activeTab,
    setActiveTab,
    openAudioExperience,
    closeAudioExperience,
    toggleEngine,
    toggleEqualizer,
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
    getSourceQuality: (track) => audioEngine.getSourceQuality(track),
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
