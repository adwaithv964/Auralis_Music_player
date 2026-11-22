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

// Default DSP Settings (Auralis Reference baseline - Dynamic, Punchy & 3D Spatial)
export const DEFAULT_DSP_SETTINGS = {
  engineEnabled: false,           // Main Auralis Sound Engine ON/OFF
  activeProfile: 'reference',     // Profile id
  intensity: 'balanced',          // natural | balanced | powerful | extreme
  deviceProfile: 'universal',     // device profile id
  loudnessMatch: false,           // Loudness-matched comparison (false for full dynamic authority)

  // Bass Engine (True Bass - Visceral, punchy, uncompressed low-end)
  deepBass: 3.2,                  // dB (-6 to +12)
  bassPunch: 3.8,                 // dB (-6 to +10)
  bassTexture: 2.2,               // Warmth & harmonic saturation (0 to 10)
  bassIntensity: 1.15,            // Bass scaling (0 to 2)
  psychoacousticBass: true,       // Harmonic missing-fundamental synthesis
  subSonicFilter: true,           // Infrasonic rumble high-pass at 22 Hz

  // Vocal & Midrange (Centered, articulate, non-fatiguing)
  vocalClarity: 2.2,              // dB (-6 to +8)
  vocalPresence: 1.6,             // dB (-6 to +8)
  nasalReduction: 0.8,            // dB (0 to 6 reduction)
  harshnessControl: 1.0,          // dB (0 to 8 reduction)
  vocalWarmth: 1.0,               // dB (-4 to +6)

  // Crystal-Clear Treble (Silky air, crisp cymbals, non-harsh)
  crystalTreble: 2.4,             // dB (-6 to +8)
  airSparkle: 2.0,                // dB (-6 to +8)
  sibilanceControl: 1.2,          // De-esser level (0 to 8)
  trebleDetail: 1.8,              // dB (-4 to +6)

  // Spatial Audio (Immersive 3D Soundstage, Dolby-style out-of-head separation)
  spatialMode: 'wide',            // wide | headphone_spatial | stereo | crossfeed | cinematic | speaker
  stereoWidth: 1.30,              // 0.0 (mono) to 2.0 (super-wide)
  crossfeedAmount: 0.15,          // 0.0 to 1.0
  spatialDepth: 0.35,             // 0.0 to 1.0

  // Multiband Dynamics (Mastering Headroom & Dynamic Preservation)
  multibandEnabled: true,
  dynamicRangePreservation: true, // Gentle transparent ratio vs heavy squash
  bassCompression: 1.8,           // Low-band peak containment (gentle)
  masterPunch: 1.25,              // Transient impact multiplier

  // Output & Limiter
  inputGain: 0.0,                 // dB (-12 to +6)
  outputCeiling: -0.5,            // dBTP (-3.0 to -0.1)
  softLimiterEnabled: true,

  // Speaker Protection & Auto-Headroom Guards
  speakerProtection: true,        // Hardware excursion & thermal protection for speakers
  autoHeadroomProtection: true,   // Anti-clip auto headroom scaling for custom user boosts
  badFrequencyFilter: true,       // Real-time bad resonance & noise suppression
};

// Default Equalizer Settings (Independent from Sound Engine)
export const DEFAULT_EQ_SETTINGS = {
  eqEnabled: false,               // Equalizer ON/OFF
  activePreset: 'flat',           // Preset id
  // 10 bands gains in dB (-12 to +12)
  bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
