import React from 'react';
import {
  // Pecuária / agricultura / vegetação
  Sprout, Wheat, Carrot, Leaf, Flower2, Bean,
  Trees, TreeDeciduous, TreePine, Tractor, Recycle, LandPlot,
  Fence, Beef, Bird,
  // Ambiental / relevo / água
  Shield, ShieldCheck, Mountain, MountainSnow, Droplet, Droplets, Waves,
  // Infraestrutura
  Home, House, Building2, Warehouse, Factory, BedDouble, Users, Utensils,
  Package, Soup, Container, Cylinder, BrickWall, Wrench, ShowerHead, Fuel,
  Zap, Sun, Antenna, Cctv, DoorClosed, Route, Milestone, Construction,
  SquareParking, Truck,
  type LucideIcon,
} from 'lucide-react';

/**
 * Registro de ícones do cadastro "Tipos de Locais".
 *
 * O campo `icone` (em tipos_local / tipo_local_categorias) passou a guardar o
 * NOME de um ícone lucide (ex.: "Sprout"), em vez de um emoji colorido. São
 * ícones de traço preto-e-branco ("estilo IA"), herdando a cor via currentColor.
 *
 * Compatibilidade: linhas antigas ainda guardam emojis; `TipoIcon` renderiza
 * o valor cru como texto quando não é um nome conhecido (ver tmp/migrate-tipos-local-icons.ts
 * para converter os dados existentes).
 */
export interface TipoIconPreset {
  name: string;
  label: string;
  Icon: LucideIcon;
}

export const TIPO_ICON_PRESETS: TipoIconPreset[] = [
  // Pecuária / agricultura / vegetação
  { name: 'Sprout', label: 'Broto / pastagem', Icon: Sprout },
  { name: 'Wheat', label: 'Trigo / lavoura', Icon: Wheat },
  { name: 'Carrot', label: 'Cultivo', Icon: Carrot },
  { name: 'Leaf', label: 'Folha / forrageira', Icon: Leaf },
  { name: 'Flower2', label: 'Flor', Icon: Flower2 },
  { name: 'Bean', label: 'Semente', Icon: Bean },
  { name: 'Trees', label: 'Árvores', Icon: Trees },
  { name: 'TreeDeciduous', label: 'Árvore nativa', Icon: TreeDeciduous },
  { name: 'TreePine', label: 'Floresta plantada', Icon: TreePine },
  { name: 'Tractor', label: 'Trator / reforma', Icon: Tractor },
  { name: 'Recycle', label: 'Integração / recuperação', Icon: Recycle },
  { name: 'LandPlot', label: 'Talhão / área', Icon: LandPlot },
  { name: 'Fence', label: 'Cerca / confinamento', Icon: Fence },
  { name: 'Beef', label: 'Gado', Icon: Beef },
  { name: 'Bird', label: 'Ave', Icon: Bird },
  // Ambiental / relevo / água
  { name: 'Shield', label: 'Reserva', Icon: Shield },
  { name: 'ShieldCheck', label: 'Reserva legal', Icon: ShieldCheck },
  { name: 'Mountain', label: 'Relevo / APP', Icon: Mountain },
  { name: 'MountainSnow', label: 'Serra', Icon: MountainSnow },
  { name: 'Droplet', label: 'Água / nascente', Icon: Droplet },
  { name: 'Droplets', label: 'Açude / reservatório', Icon: Droplets },
  { name: 'Waves', label: 'Várzea / rede hidráulica', Icon: Waves },
  // Infraestrutura
  { name: 'Home', label: 'Sede', Icon: Home },
  { name: 'House', label: 'Casa', Icon: House },
  { name: 'Building2', label: 'Escritório', Icon: Building2 },
  { name: 'Warehouse', label: 'Galpão', Icon: Warehouse },
  { name: 'Factory', label: 'Fábrica de ração', Icon: Factory },
  { name: 'BedDouble', label: 'Alojamento', Icon: BedDouble },
  { name: 'Users', label: 'Sala de reunião', Icon: Users },
  { name: 'Utensils', label: 'Refeitório', Icon: Utensils },
  { name: 'Package', label: 'Almoxarifado', Icon: Package },
  { name: 'Soup', label: 'Cochos', Icon: Soup },
  { name: 'Container', label: "Caixa d'água", Icon: Container },
  { name: 'Cylinder', label: 'Silo', Icon: Cylinder },
  { name: 'BrickWall', label: 'Silo trincheira', Icon: BrickWall },
  { name: 'Wrench', label: 'Oficina', Icon: Wrench },
  { name: 'ShowerHead', label: 'Lavador', Icon: ShowerHead },
  { name: 'Fuel', label: 'Combustível', Icon: Fuel },
  { name: 'Zap', label: 'Rede elétrica', Icon: Zap },
  { name: 'Sun', label: 'Energia solar', Icon: Sun },
  { name: 'Antenna', label: 'Comunicação', Icon: Antenna },
  { name: 'Cctv', label: 'Câmeras', Icon: Cctv },
  { name: 'DoorClosed', label: 'Guarita / portaria', Icon: DoorClosed },
  { name: 'Route', label: 'Estradas', Icon: Route },
  { name: 'Milestone', label: 'Estradas internas', Icon: Milestone },
  { name: 'Construction', label: 'Obras / mata-burro', Icon: Construction },
  { name: 'SquareParking', label: 'Pátio de manobra', Icon: SquareParking },
  { name: 'Truck', label: 'Carga e descarga', Icon: Truck },
];

/** name → componente lucide, para resolução em O(1). */
export const TIPO_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  TIPO_ICON_PRESETS.map((p) => [p.name, p.Icon]),
);

interface TipoIconProps {
  /** Nome lucide (ex.: "Sprout"). Legado: pode ser um emoji. */
  name?: string | null;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Renderizado quando `name` é vazio. */
  fallback?: React.ReactNode;
}

/**
 * Renderiza o ícone de um tipo/categoria. Resolve o nome lucide; se o valor
 * não for um nome conhecido (ex.: emoji legado), renderiza-o como texto.
 */
export const TipoIcon: React.FC<TipoIconProps> = ({ name, size = 15, className, style, fallback = null }) => {
  if (!name) return <>{fallback}</>;
  const Icon = TIPO_ICON_MAP[name];
  if (Icon) return <Icon size={size} className={className} style={style} />;
  return <span className={className} style={style}>{name}</span>;
};
