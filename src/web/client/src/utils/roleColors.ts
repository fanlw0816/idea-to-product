// Role color mapping — synced with TerminalFormatter

// Localized role names (language: { codeName: displayName })
const ROLE_LABELS_EN: Record<string, string> = {
  TrendHunter: 'Trend Hunter',
  UserVoice: 'User Voice',
  Engineer: 'Engineer',
  DevilAdvocate: "Devil's Advocate",
  Minimalist: 'The Minimalist',
  Philosopher: 'The Philosopher',
  Moderator: 'Moderator',
  DESIGNER: 'Designer',
  REVIEWER: 'Reviewer',
  DEPLOYER: 'Deployer',
  Orchestrator: 'Orchestrator',
};

const ROLE_LABELS_ZH: Record<string, string> = {
  TrendHunter: '趋势猎人',
  UserVoice: '用户之声',
  Engineer: '工程师',
  DevilAdvocate: '反方辩手',
  Minimalist: '极简主义者',
  Philosopher: '哲学家',
  Moderator: '主持人',
  DESIGNER: '设计师',
  REVIEWER: '审查员',
  DEPLOYER: '部署员',
  Orchestrator: '编排器',
};

/**
 * Get localized role name based on language preference.
 * @param role - The role codeName (e.g., 'TrendHunter')
 * @param language - 'en' or 'zh' (defaults to 'zh' for Chinese users)
 */
export function getLocalizedRoleName(role: string, language: string = 'zh'): string {
  if (language === 'zh') {
    return ROLE_LABELS_ZH[role] || ROLE_LABELS_EN[role] || role;
  }
  return ROLE_LABELS_EN[role] || role;
}

const ROLE_COLORS: Record<string, string> = {
  TrendHunter: 'role-trendhunter',
  UserVoice: 'role-uservoice',
  Engineer: 'role-engineer',
  DevilAdvocate: 'role-deviladvocate',
  Minimalist: 'role-minimalist',
  Philosopher: 'role-philosopher',
  Moderator: 'role-moderator',
  DESIGNER: 'role-designer',
  REVIEWER: 'role-reviewer',
  DEPLOYER: 'role-deployer',
  Orchestrator: 'text-white',
};

export function getRoleColorClass(role: string): string {
  return ROLE_COLORS[role] || 'text-gray-400';
}

export function getRoleTextColor(role: string): string {
  const colors: Record<string, string> = {
    TrendHunter: '#ff6b6b',
    UserVoice: '#4ecdc4',
    Engineer: '#45b7d1',
    DevilAdvocate: '#e94560',
    Minimalist: '#feca57',
    Philosopher: '#a78bfa',
    Moderator: '#e94560',
    DESIGNER: '#a78bfa',
    REVIEWER: '#fb923c',
    DEPLOYER: '#34d399',
  };
  return colors[role] || '#888';
}

const EVENT_ICONS: Record<string, string> = {
  phase_start: '🚀',
  phase_end: '✅',
  role_pitch: '💡',
  role_attack: '⚔️',
  role_defense: '🛡️',
  role_speak: '🗣️',
  moderator_summary: '🎙️',
  synthesis: '🎯',
  scoring: '📊',
  design_output: '📐',
  builder_output: '🔨',
  builder_summary: '📋',
  review_findings: '🔍',
  review_fix: '🔧',
  deploy_summary: '🚀',
  error: '❌',
};

export function getEventIcon(type: string): string {
  return EVENT_ICONS[type] || '·';
}

const PHASE_LABELS: Record<string, string> = {
  idea: '💡 Idea Arena',
  design: '📐 Design',
  build: '🏗️ Build',
  review: '🔍 Review',
  deploy: '🚀 Deploy',
};

export function getPhaseLabel(phase: string): string {
  return PHASE_LABELS[phase] || phase;
}