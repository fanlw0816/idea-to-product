import type { ObsEvent } from '../types/event';
import { getRoleTextColor, getEventIcon, getLocalizedRoleName } from '../utils/roleColors';

interface EventCardProps {
  event: ObsEvent;
  selected: boolean;
  onClick: () => void;
}

export function EventCard({ event, selected, onClick }: EventCardProps) {
  const roleColor = getRoleTextColor(event.role);
  const icon = getEventIcon(event.type);
  const roleName = getLocalizedRoleName(event.role); // Use localized name

  // Highlight @mentions in content
  const highlightMentions = (content: string) => {
    const mentionPattern = /@(\w+)|(\w+),/g;
    return content.replace(mentionPattern, (match, name1, name2) => {
      const name = name1 || name2;
      return `<span class="text-yellow-400 font-semibold">${match}</span>`;
    });
  };

  return (
    <div
      onClick={onClick}
      className={`arena-card p-3 rounded-lg cursor-pointer transition-all animate-slide-in
        ${selected ? 'ring-2 ring-role-philosopher' : 'hover:bg-arena-border'}`}
      style={{ backgroundColor: '#16213e' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span style={{ color: roleColor }} className="font-semibold">
          {roleName}
        </span>
        <span className="text-xs text-gray-500">
          [{event.type}]
        </span>
      </div>
      <p
        className="text-sm text-gray-300 whitespace-pre-wrap"
        dangerouslySetInnerHTML={{ __html: highlightMentions(event.content) }}
      />
      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
        <span>{event.phase}</span>
        <span>·</span>
        <span>{new Date(event.ts).toLocaleTimeString()}</span>
        {event.meta.turn && <span>· Turn {event.meta.turn}</span>}
      </div>
    </div>
  );
}