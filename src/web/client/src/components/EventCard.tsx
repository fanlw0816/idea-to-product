import type { ObsEvent } from '../types/event';
import { getRoleTextColor, getLocalizedRoleName, getRoleIcon, getEventIconComponent } from '../utils/roleColors';

interface EventCardProps {
  event: ObsEvent;
  selected: boolean;
  onClick: () => void;
}

export function EventCard({ event, selected, onClick }: EventCardProps) {
  const roleColor = getRoleTextColor(event.role);
  const RoleIcon = getRoleIcon(event.role);
  const EventIcon = getEventIconComponent(event.type);
  const roleName = getLocalizedRoleName(event.role);

  // Highlight @mentions in content
  const highlightMentions = (content: string) => {
    const mentionPattern = /@(\w+)|(\w+),/g;
    return content.replace(mentionPattern, (match, name1, name2) => {
      const name = name1 || name2;
      return `<span class="mention-highlight">${match}</span>`;
    });
  };

  return (
    <div
      onClick={onClick}
      className={`arena-card p-3 rounded-lg cursor-pointer transition-all duration-arena-normal animate-slide-in
        ${selected ? 'arena-card-selected' : ''}`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        {/* Event type icon */}
        <EventIcon className="icon-sm" style={{ color: roleColor }} />

        {/* Role name with color */}
        <span style={{ color: roleColor }} className="font-semibold text-sm">
          {roleName}
        </span>

        {/* Event type badge */}
        <span className="arena-badge arena-badge-info text-xs">
          {event.type.replace('role_', '').replace('_', ' ')}
        </span>
      </div>

      {/* Content */}
      <p
        className="text-sm text-arena-text-secondary whitespace-pre-wrap leading-relaxed"
        dangerouslySetInnerHTML={{ __html: highlightMentions(event.content) }}
      />

      {/* Meta footer */}
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-arena-border text-xs text-arena-text-muted">
        <span className="flex items-center gap-1">
          <RoleIcon className="icon-xs" style={{ color: roleColor }} />
          {event.phase}
        </span>
        <span className="text-arena-border">|</span>
        <span>{new Date(event.ts).toLocaleTimeString()}</span>
        {event.meta.turn && (
          <>
            <span className="text-arena-border">|</span>
            <span className="text-arena-warning">Turn {event.meta.turn}</span>
          </>
        )}
      </div>
    </div>
  );
}