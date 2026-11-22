/**
 * audio/constants.js
 * Default settings, frequency bands, limits, and localStorage keys for Auralis DSP Audio Engine.
 */

export const STORAGE_KEYS = {
  DSP_SETTINGS:     'auralis:dsp_settings',
  EQ_SETTINGS:      'auralis:eq_settings',
  CUSTOM_EQ_PRESETS:'auralis:custom_eq_presets',
  DEVICE_PROFILE:   'auralis:device_profile',
  ACTIVE_PROFILE:   'auralis:active_profile',
  INTENSITY:        'auralis:engine_intensity',
  LOUDNESS_MATCH:   'auralis:loudness_match',
};

// 10-Band ISO Center Frequencies (Hz)
export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_BAND_LABELS = [
  '31 Hz',
  '62 Hz',
  '125 Hz',
  '250 Hz',
  '500 Hz',
  '1 kHz',
  '2 kHz',
  '4 kHz',
  '8 kHz',
  '16 kHz',
];

// Engine Intensity Multipliers
export const INTENSITY_MODES = {
  natural:  { id: 'natural',  label: 'Natural',  multiplier: 0.70, desc: 'Subtle enhancement, maximum acoustic transparency' },
  balanced: { id: 'balanced', label: 'Balanced', multiplier: 1.00, desc: 'Optimized balance of punch, clarity and space (Default)' },
  powerful: { id: 'powerful', label: 'Powerful', multiplier: 1.35, desc: 'More energetic bass, forward vocals and wider stereo' },
  extreme:  { id: 'extreme',  label: 'Extreme',  multiplier: 1.70, desc: 'Maximum bass weight and sparkle with dynamic protection' },
};

// Spatial Modes
export const SPATIAL_MODES = {
  stereo:           { id: 'stereo',           label: 'Original Stereo',   desc: 'Pristine stereo bypass without virtualization' },
  wide:             { id: 'wide',             label: 'Wide Stereo',       desc: 'Mid-Side stereo expansion with mono-centered bass' },
  headphone_spatial:{ id: 'headphone_spatial',label: 'Headphone Spatial', desc: 'Binaural crossfeed & subtle diffuse early reflections' },
  crossfeed:        { id: 'crossfeed',        label: 'Crossfeed',         desc: 'Bauer-style crossfeed to reduce headphone ear fatigue' },
  cinematic:        { id: 'cinematic',        label: 'Cinematic Spatial', desc: 'Immersive soundstage with dialogue preservation' },
  speaker:          { id: 'speaker',          label: 'Speaker Mode',      desc: 'Crosstalk acoustic compensation for desktop & portable speakers' },
};

// Default DSP Settings (Auralis Reference baseline)
export const DEFAULT_DSP_SETTINGS = {
  engineEnabled: false,           // Main Auralis Sound Engine ON/OFF
  activeProfile: 'reference',     // Profile id
  intensity: 'balanced',          // natural | balanced | powerful | extreme
  deviceProfile: 'universal',     // device profile id
  loudnessMatch: false,           // Loudness-matched A/B comparison

  // Bass Engine (True Bass)
  deepBass: 2.0,                  // dB (-6 to +12)
  bassPunch: 2.5,                 // dB (-6 to +10)
  bassTexture: 1.5,               // Warmth & harmonic saturation (0 to 10)
  bassIntensity: 1.0,             // Bass scaling (0 to 2)
  psychoacousticBass: true,       // Harmonic missing-fundamental synthesis
  subSonicFilter: true,           // Infrasonic rumble high-pass at 22 Hz

  // Vocal & Midrange
  vocalClarity: 2.0,              // dB (-6 to +8)
  vocalPresence: 1.5,             // dB (-6 to +8)
  nasalReduction: 1.0,            // dB (0 to 6 reduction)
  harshnessControl: 1.5,          // dB (0 to 8 reduction)
  vocalWarmth: 1.0,               // dB (-4 to +6)

  // Crystal-Clear Treble
  crystalTreble: 2.0,             // dB (-6 to +8)
  airSparkle: 1.5,                // dB (-6 to +8)
  sibilanceControl: 1.5,          // De-esser level (0 to 8)
  trebleDetail: 1.5,              // dB (-4 to +6)

  // Spatial Audio
  spatialMode: 'stereo',          // stereo | wide | headphone_spatial | crossfeed | cinematic | speaker
  stereoWidth: 1.0,               // 0.0 (mono) to 2.0 (super-wide), 1.0 = normal
  crossfeedAmount: 0.35,          // 0.0 to 1.0
  spatialDepth: 0.40,             // 0.0 to 1.0

  // Multiband Dynamics
  multibandEnabled: true,
  dynamicRangePreservation: true, // Gentle transparent ratio vs heavy squash
  bassCompression: 2.5,           // Low-band peak containment (1 to 6)
  masterPunch: 1.2,               // Transient impact multiplier

  // Output & Limiter
  inputGain: 0.0,                 // dB (-12 to +6)
  outputCeiling: -1.0,            // dBTP (-3.0 to -0.1)
  softLimiterEnabled: true,
};

// Default Equalizer Settings (Independent from Sound Engine)
export const DEFAULT_EQ_SETTINGS = {
  eqEnabled: false,               // Equalizer ON/OFF
  activePreset: 'flat',           // Preset id
  // 10 bands gains in dB (-12 to +12)
  bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
