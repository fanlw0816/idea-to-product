// Role color and icon mapping — semantic design tokens
// Icons are handled by Lucide React components in the actual rendering

import {
  Zap,        // TrendHunter - trend/energy
  Users,      // UserVoice - user focus
  Cpu,        // Engineer - technical
  AlertTriangle, // DevilAdvocate - critical/attack
  Minimize2,  // Minimalist - simplicity
  Sparkles,   // Philosopher - meaning/deeper
  Mic,        // Moderator - orchestration
  Palette,    // Designer
  Search,     // Reviewer
  Rocket,     // Deployer
  Bot,        // Orchestrator
} from 'lucide-react';

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

/**
 * Get role icon component (Lucide React icon)
 */
export function getRoleIcon(role: string): React.ComponentType<{ className?: string }> {
  const icons: Record<string, React.ComponentType<{ className?: string }> > = {
    TrendHunter: Zap,
    UserVoice: Users,
    Engineer: Cpu,
    DevilAdvocate: AlertTriangle,
    Minimalist: Minimize2,
    Philosopher: Sparkles,
    Moderator: Mic,
    DESIGNER: Palette,
    REVIEWER: Search,
    DEPLOYER: Rocket,
    Orchestrator: Bot,
  };
  return icons[role] || Bot;
}

/**
 * Get role color (CSS variable name)
 */
export function getRoleColorVar(role: string): string {
  const colors: Record<string, string> = {
    TrendHunter: 'var(--role-trendhunter)',
    UserVoice: 'var(--role-uservoice)',
    Engineer: 'var(--role-engineer)',
    DevilAdvocate: 'var(--role-deviladvocate)',
    Minimalist: 'var(--role-minimalist)',
    Philosopher: 'var(--role-philosopher)',
    Moderator: 'var(--role-moderator)',
    DESIGNER: 'var(--role-philosopher)',
    REVIEWER: 'var(--color-warning)',
    DEPLOYER: 'var(--color-success)',
    Orchestrator: 'var(--role-system)',
  };
  return colors[role] || 'var(--role-system)';
}

/**
 * Get role text color (direct hex for inline styles)
 */
export function getRoleTextColor(role: string): string {
  const colors: Record<string, string> = {
    TrendHunter: '#f97316',
    UserVoice: '#14b8a6',
    Engineer: '#0ea5e9',
    DevilAdvocate: '#dc2626',
    Minimalist: '#eab308',
    Philosopher: '#a855f7',
    Moderator: '#6366f1',
    DESIGNER: '#a855f7',
    REVIEWER: '#f59e0b',
    DEPLOYER: '#10b981',
    Orchestrator: '#64748b',
  };
  return colors[role] || '#64748b';
}

// Event type icons (Lucide components)
import {
  Play,       // phase_start
  CheckCircle, // phase_end
  Lightbulb,  // role_pitch
  MessageSquare, // role_attack
  Shield,     // role_defense
  MessageCircle, // role_speak
  ScrollText, // moderator_summary
  Target,     // synthesis
  BarChart3,  // scoring
  FileCode,   // design_output
  Hammer,     // builder_output
  ClipboardList, // builder_summary
  Bug,        // review_findings
  Wrench,     // review_fix
  Rocket as RocketLaunch, // deploy_summary
  XCircle,    // error
} from 'lucide-react';

export function getEventIconComponent(type: string): React.ComponentType<{ className?: string }> {
  const icons: Record<string, React.ComponentType<{ className?: string }> > = {
    phase_start: Play,
    phase_end: CheckCircle,
    role_pitch: Lightbulb,
    role_attack: MessageSquare,
    role_defense: Shield,
    role_speak: MessageCircle,
    moderator_summary: ScrollText,
    synthesis: Target,
    scoring: BarChart3,
    design_output: FileCode,
    builder_output: Hammer,
    builder_summary: ClipboardList,
    review_findings: Bug,
    review_fix: Wrench,
    deploy_summary: RocketLaunch,
    error: XCircle,
  };
  return icons[type] || MessageCircle;
}

// Legacy emoji icons (for backward compatibility, but prefer Lucide)
const EVENT_ICONS_LEGACY: Record<string, string> = {
  phase_start: '▶',
  phase_end: '✓',
  role_pitch: '💡',
  role_attack: '⚔',
  role_defense: '🛡',
  role_speak: '🗣',
  moderator_summary: '📋',
  synthesis: '🎯',
  scoring: '📊',
  design_output: '📐',
  builder_output: '🔨',
  builder_summary: '📋',
  review_findings: '🔍',
  review_fix: '🔧',
  deploy_summary: '🚀',
  error: '✕',
};

export function getEventIcon(type: string): string {
  return EVENT_ICONS_LEGACY[type] || '•';
}

// Phase labels with icons
const PHASE_ICONS: Record<string, React.ComponentType<{ className?: string }> > = {
  idea: Sparkles,
  design: Palette,
  build: Hammer,
  review: Search,
  deploy: Rocket,
};

export function getPhaseIcon(phase: string): React.ComponentType<{ className?: string }> {
  return PHASE_ICONS[phase] || Bot;
}

const PHASE_LABELS: Record<string, string> = {
  idea: 'Idea Arena',
  design: 'Design',
  build: 'Build',
  review: 'Review',
  deploy: 'Deploy',
};

const PHASE_LABELS_ZH: Record<string, string> = {
  idea: '创意竞技场',
  design: '设计',
  build: '构建',
  review: '审查',
  deploy: '部署',
};

export function getPhaseLabel(phase: string, language: string = 'zh'): string {
  if (language === 'zh') {
    return PHASE_LABELS_ZH[phase] || PHASE_LABELS[phase] || phase;
  }
  return PHASE_LABELS[phase] || phase;
}