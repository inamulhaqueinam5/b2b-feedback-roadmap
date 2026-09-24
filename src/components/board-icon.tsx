import {
  MessageSquare,
  Bug,
  Sparkles,
  Lightbulb,
  Puzzle,
  Rocket,
  Zap,
  Shield,
  Layers,
  Compass,
  Flame,
  Star,
  Cpu,
  Wrench,
  type LucideProps,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  "message-square": MessageSquare,
  bug: Bug,
  sparkles: Sparkles,
  lightbulb: Lightbulb,
  puzzle: Puzzle,
  rocket: Rocket,
  zap: Zap,
  shield: Shield,
  layers: Layers,
  compass: Compass,
  flame: Flame,
  star: Star,
  cpu: Cpu,
  wrench: Wrench,
};

interface BoardIconProps extends Omit<LucideProps, "name"> {
  name?: string | null;
}

export function BoardIcon({ name, ...props }: BoardIconProps) {
  const IconComponent = (name && ICON_MAP[name.toLowerCase()]) || MessageSquare;
  return <IconComponent {...props} />;
}
