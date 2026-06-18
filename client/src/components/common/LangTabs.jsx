import { LANGUAGES } from '../../utils/constants';

/**
 * LangTabs
 * Horizontal scrollable language filter tab strip.
 */
export function LangTabs({ language, onChange }) {
  return (
    <div className="lang-tabs" role="tablist" aria-label="Language filter">
      {LANGUAGES.map(l => (
        <button
          key={l.id}
          role="tab"
          aria-selected={language === l.id}
          className={`lang-tab${language === l.id ? ' lang-tab--active' : ''}`}
          onClick={() => onChange(l.id)}
        >
          <span className="lang-tab-flag">{l.flag}</span>
          <span className="lang-tab-label">{l.label}</span>
          <span className="lang-tab-desc">{l.desc}</span>
        </button>
      ))}
    </div>
  );
}
