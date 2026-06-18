import { useState } from 'react';

/* ── Toggle switch ────────────────────────────────────────── */
function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`pref-toggle${checked ? ' pref-toggle--on' : ''}`}
    >
      <span className="pref-toggle-knob" />
    </button>
  );
}

/* ── Radio option ─────────────────────────────────────────── */
function RadioOption({ label, desc, value, selected, onChange, premium }) {
  return (
    <button
      className={`pref-radio-row${selected ? ' pref-radio-row--selected' : ''}`}
      onClick={() => onChange(value)}
    >
      <div className="pref-radio-text">
        <span className="pref-radio-label">{label}</span>
        {desc && <span className="pref-radio-desc">{desc}</span>}
      </div>
      {premium && <span className="pref-premium-badge">✦ Premium</span>}
      <div className={`pref-radio-dot${selected ? ' pref-radio-dot--on' : ''}`} />
    </button>
  );
}

/* ── Settings row (toggle or action) ─────────────────────── */
function SettingRow({ icon, title, desc, checked, onChange, onClick, noToggle }) {
  return (
    <div className="pref-row">
      <div className="pref-row-left">
        {icon && <span className="pref-row-icon">{icon}</span>}
        <div className="pref-row-info">
          <span className="pref-row-title">{title}</span>
          {desc && <span className="pref-row-desc">{desc}</span>}
        </div>
      </div>
      {!noToggle && onChange && (
        <Toggle checked={!!checked} onChange={onChange} />
      )}
      {onClick && (
        <button className="pref-action-btn" onClick={onClick}>
          Change
        </button>
      )}
    </div>
  );
}

/* ── Section heading ──────────────────────────────────────── */
function PrefSection({ title, children }) {
  return (
    <div className="pref-section">
      <h3 className="pref-section-title">{title}</h3>
      <div className="pref-section-body">{children}</div>
    </div>
  );
}

/* ── Main Preferences Panel ───────────────────────────────── */
export function Preferences({ prefs, setPrefs, onClose }) {
  const [activeTab, setActiveTab] = useState('playback');

  const set = (key, val) => setPrefs(p => ({ ...p, [key]: val }));

  const TABS = [
    { id: 'appearance', label: '🎨 Appearance', icon: '🎨' },
    { id: 'playback',   label: '▶ Playback',   icon: '▶' },
    { id: 'quality',    label: '📶 Quality',    icon: '📶' },
    { id: 'privacy',    label: '🔒 Privacy',    icon: '🔒' },
  ];

  return (
    <div className="prefs-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="prefs-modal glass-panel-deep">

        {/* Header */}
        <div className="prefs-header">
          <div className="prefs-header-left">
            <span className="prefs-icon">⚙️</span>
            <div>
              <h2 className="prefs-title">Preferences</h2>
              <p className="prefs-subtitle">Personalise your Auralis experience</p>
            </div>
          </div>
          <button className="prefs-close-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <nav className="prefs-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`prefs-tab${activeTab === t.id ? ' prefs-tab--active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="prefs-body">

          {/* ── APPEARANCE ── */}
          {activeTab === 'appearance' && (
            <>
              <PrefSection title="Theme">
                <div className="pref-theme-grid">
                  {[
                    { id: 'dark',  label: 'Dark',  emoji: '🌙', desc: 'Easy on the eyes' },
                    { id: 'light', label: 'Light', emoji: '☀️', desc: 'Bright & clean' },
                  ].map(t => (
                    <button
                      key={t.id}
                      className={`pref-theme-card${prefs.theme === t.id ? ' active' : ''}`}
                      onClick={() => set('theme', t.id)}
                    >
                      <span className="pref-theme-emoji">{t.emoji}</span>
                      <strong>{t.label}</strong>
                      <span>{t.desc}</span>
                    </button>
                  ))}
                </div>
              </PrefSection>

              <PrefSection title="Accent colour">
                <div className="pref-swatches">
                  {[
                    { color: '#1db954', name: 'Spotify Green' },
                    { color: '#67f0b7', name: 'Mint' },
                    { color: '#ff7a90', name: 'Coral' },
                    { color: '#7cc7ff', name: 'Sky' },
                    { color: '#ffd166', name: 'Gold' },
                    { color: '#7e1df4', name: 'Purple' },
                    { color: '#ff4d4d', name: 'Red' },
                    { color: '#ff9500', name: 'Orange' },
                  ].map(s => (
                    <button
                      key={s.color}
                      title={s.name}
                      className={`pref-swatch${prefs.accent === s.color ? ' active' : ''}`}
                      style={{ '--sw': s.color }}
                      onClick={() => set('accent', s.color)}
                    />
                  ))}
                </div>
              </PrefSection>

              <PrefSection title="Layout">
                <SettingRow
                  icon="📐"
                  title="Compact density"
                  desc="Smaller rows and reduced spacing throughout the app."
                  checked={prefs.compact}
                  onChange={v => set('compact', v)}
                />
                <SettingRow
                  icon="💎"
                  title="Glassmorphism effects"
                  desc="Semi-transparent panels with blur effects."
                  checked={prefs.glass !== false}
                  onChange={v => set('glass', v)}
                />
              </PrefSection>

              <PrefSection title="Volume">
                <div className="pref-row">
                  <div className="pref-row-left">
                    <span className="pref-row-icon">🔊</span>
                    <div className="pref-row-info">
                      <span className="pref-row-title">Volume</span>
                      <span className="pref-row-desc">{prefs.volume ?? 62}%</span>
                    </div>
                  </div>
                  <input
                    type="range" min="0" max="100"
                    value={prefs.volume ?? 62}
                    className="pref-slider"
                    onChange={e => set('volume', Number(e.target.value))}
                  />
                </div>
              </PrefSection>
            </>
          )}

          {/* ── PLAYBACK ── */}
          {activeTab === 'playback' && (
            <>
              <PrefSection title="Track transitions">
                <SettingRow
                  icon="🔁"
                  title="Gapless playback"
                  desc="Removes any gaps or pauses that may occur in between tracks."
                  checked={prefs.gapless}
                  onChange={v => set('gapless', v)}
                />
              </PrefSection>

              <PrefSection title="Listening controls">
                <SettingRow
                  icon="▶"
                  title="Autoplay"
                  desc="Similar content will play when what you're listening to ends."
                  checked={prefs.autoplay !== false}
                  onChange={v => set('autoplay', v)}
                />
                <SettingRow
                  icon="🔈"
                  title="Mono audio"
                  desc="Left and right speakers play the same audio."
                  checked={prefs.mono}
                  onChange={v => set('mono', v)}
                />
                <SettingRow
                  icon="📡"
                  title="Device broadcast status"
                  desc="Allows other apps on your device to show what you're listening to."
                  checked={prefs.broadcast}
                  onChange={v => set('broadcast', v)}
                />
              </PrefSection>

              <PrefSection title="Equalizer">
                <div className="pref-eq-info">
                  <span className="pref-row-icon" style={{ fontSize: '1.4rem' }}>🎚️</span>
                  <div>
                    <span className="pref-row-title">Equalizer</span>
                    <span className="pref-row-desc">Adjust different frequencies to enhance your audio experience.</span>
                  </div>
                </div>
                <div className="pref-eq-bars">
                  {['60Hz','150Hz','400Hz','1kHz','2.4kHz','6kHz','15kHz'].map((band, i) => {
                    const eqKey = `eq_${i}`;
                    const val = prefs[eqKey] ?? 50;
                    return (
                      <div key={band} className="pref-eq-band">
                        <span className="pref-eq-value">{val > 50 ? `+${val - 50}` : val - 50}</span>
                        <input
                          type="range" min="0" max="100" orient="vertical"
                          value={val}
                          className="pref-eq-slider"
                          onChange={e => set(eqKey, Number(e.target.value))}
                        />
                        <span className="pref-eq-label">{band}</span>
                      </div>
                    );
                  })}
                </div>
              </PrefSection>

              <PrefSection title="Volume controls">
                <SettingRow
                  icon="📊"
                  title="Volume normalisation"
                  desc="Sets the same loudness level for all tracks."
                  checked={prefs.normalize}
                  onChange={v => set('normalize', v)}
                />
                <SettingRow
                  icon="🔇"
                  title="Crossfade"
                  desc="Smoothly blend the ending of one song into the start of the next."
                  checked={prefs.crossfade}
                  onChange={v => set('crossfade', v)}
                />
              </PrefSection>
            </>
          )}

          {/* ── QUALITY ── */}
          {activeTab === 'quality' && (
            <>
              <div className="pref-quality-note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
                  <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
                </svg>
                Quality changes on next track (unless downloaded or higher-quality cached track available).
              </div>

              <PrefSection title="Wi-Fi streaming quality">
                <p className="pref-section-desc">Choose the quality of your audio streaming when you're connected to the internet.</p>
                {[
                  { value: 'auto',      label: 'Automatic',  desc: 'Adjusts based on your network speed' },
                  { value: 'low',       label: 'Low',        desc: '~24 kbps' },
                  { value: 'normal',    label: 'Normal',     desc: '~96 kbps' },
                  { value: 'high',      label: 'High',       desc: '~160 kbps' },
                  { value: 'very_high', label: 'Very high',  desc: '~320 kbps', premium: true },
                  { value: 'lossless',  label: 'Lossless',   desc: 'FLAC / ALAC', premium: true },
                ].map(opt => (
                  <RadioOption key={opt.value}
                    label={opt.label} desc={opt.desc} value={opt.value}
                    premium={opt.premium}
                    selected={(prefs.streamQuality ?? 'auto') === opt.value}
                    onChange={v => set('streamQuality', v)}
                  />
                ))}
              </PrefSection>

              <PrefSection title="Downloads">
                <SettingRow
                  icon="💾"
                  title="Download over cellular"
                  desc="Downloads start or continue when you're not connected to Wi-Fi."
                  checked={prefs.downloadCellular}
                  onChange={v => set('downloadCellular', v)}
                />
                <SettingRow
                  icon="🎵"
                  title="Audio-only downloads"
                  desc="Only the audio will be saved when downloading video podcasts."
                  checked={prefs.audioOnlyDownload !== false}
                  onChange={v => set('audioOnlyDownload', v)}
                />
              </PrefSection>

              <PrefSection title="Data saver">
                <p className="pref-section-desc">Choose if you'd like to optimise your data usage.</p>
                {[
                  { value: 'off',   label: 'Always off',  desc: 'Full quality always' },
                  { value: 'auto',  label: 'Automatic',   desc: 'Adjusts based on your connection' },
                  { value: 'on',    label: 'Always on',   desc: 'Lowers quality to save data' },
                ].map(opt => (
                  <RadioOption key={opt.value}
                    label={opt.label} desc={opt.desc} value={opt.value}
                    selected={(prefs.dataSaver ?? 'off') === opt.value}
                    onChange={v => set('dataSaver', v)}
                  />
                ))}
              </PrefSection>
            </>
          )}

          {/* ── PRIVACY ── */}
          {activeTab === 'privacy' && (
            <>
              <PrefSection title="Playlist visibility">
                <SettingRow
                  icon="🌐"
                  title="Public playlists"
                  desc="New playlists you create will be viewable by others by default, and can be added to your profile."
                  checked={prefs.publicPlaylists !== false}
                  onChange={v => set('publicPlaylists', v)}
                />
                <div className="pref-hint">Only playlists that you make after changing this setting will be affected.</div>

                <SettingRow
                  icon="👤"
                  title="Playlists appear on your profile"
                  desc="New playlists you create will be visible on your profile by default."
                  checked={prefs.playlistsOnProfile !== false}
                  onChange={v => set('playlistsOnProfile', v)}
                />
                <div className="pref-hint">Only playlists that you make after changing this setting will be affected.</div>

                <SettingRow
                  icon="🔒"
                  title="Playlist privacy"
                  desc="Private playlists are only visible to you and people you invite, while everyone can view public playlists."
                  checked={prefs.playlistPrivate}
                  onChange={v => set('playlistPrivate', v)}
                />
              </PrefSection>

              <PrefSection title="Profile visibility">
                <SettingRow
                  icon="👥"
                  title="Followers and following"
                  desc="On your profile, people can see who's following you and who you're following."
                  checked={prefs.showFollowers !== false}
                  onChange={v => set('showFollowers', v)}
                />
                <SettingRow
                  icon="🎵"
                  title="Playlists on profile"
                  desc="People can see the playlists you've added to your profile."
                  checked={prefs.showPlaylists !== false}
                  onChange={v => set('showPlaylists', v)}
                />
                <SettingRow
                  icon="🎧"
                  title="Recently played"
                  desc="Others can see your recently played tracks and artists."
                  checked={prefs.showRecent}
                  onChange={v => set('showRecent', v)}
                />
              </PrefSection>

              <PrefSection title="Social">
                <SettingRow
                  icon="📢"
                  title="Share listening activity"
                  desc="Friends can see what you're currently listening to."
                  checked={prefs.shareActivity}
                  onChange={v => set('shareActivity', v)}
                />
                <SettingRow
                  icon="💬"
                  title="Friend activity"
                  desc="See what your friends are listening to in the Friend Feed."
                  checked={prefs.friendActivity !== false}
                  onChange={v => set('friendActivity', v)}
                />
              </PrefSection>
            </>
          )}

        </div>

        {/* Footer */}
        <div className="prefs-footer">
          <button className="prefs-reset-btn" onClick={() => setPrefs({
            theme: 'dark', accent: '#67f0b7', volume: 62,
            gapless: false, autoplay: true, mono: false, normalize: false,
            streamQuality: 'auto', publicPlaylists: true,
          })}>
            Reset to defaults
          </button>
          <button className="prefs-save-btn" onClick={onClose}>
            Save & close
          </button>
        </div>

      </div>
    </div>
  );
}
