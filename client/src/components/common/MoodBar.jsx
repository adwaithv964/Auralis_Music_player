import { MOODS } from '../../utils/constants';

/**
 * MoodBar
 * Horizontal scrollable mood filter chip strip.
 */
export function MoodBar({ mood, onChange }) {
  return (
    <div className="mood-bar" role="group" aria-label="Mood filter">
      {MOODS.map(m => (
        <button
          key={m.id}
          className={`mood-chip${mood === m.id ? ' mood-chip--active' : ''}`}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
