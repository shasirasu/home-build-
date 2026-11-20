import type { RoomType } from '@/types/house';

// Furniture and fixtures that can be placed in a house. Every `kind` here has a detailed procedural 3D model in
// src/three/furniture (buildItem). Sizes are metres: w = width (local X), d = depth (local Z, front = +Z), h = height.
// Prices are indicative ranges for India (INR), for the items list. They are estimates, not quotes.

export type CatalogCategory =
  | 'Bedroom'
  | 'Living'
  | 'Dining'
  | 'Kitchen'
  | 'Bath'
  | 'Pooja'
  | 'Utility'
  | 'Lighting'
  | 'Decor'
  | 'Outdoor';

export type Mount = 'floor' | 'wall' | 'ceiling';

export interface CatalogItem {
  kind: string;
  name: string;
  category: CatalogCategory;
  w: number;
  d: number;
  h: number;
  mount: Mount;
  /** Default bottom height above floor for wall items. Ceiling items hang from the ceiling (engine computes). */
  elevation?: number;
  rooms: RoomType[];
  material: string;
  price: [number, number];
  /** Colour choices offered in Design mode; first is the default. */
  colors: string[];
  /** Width can be stretched in Design mode (counters, cabinets, curtains). */
  stretch?: boolean;
}

export const CATALOG: CatalogItem[] = [
  // Bedroom
  { kind: 'bed-queen', name: 'Queen bed with headboard', category: 'Bedroom', w: 1.6, d: 2.08, h: 1.05, mount: 'floor', rooms: ['bedroom'], material: 'Sheesham wood frame, upholstered headboard, 8" mattress', price: [28000, 65000], colors: ['#8a6a4f', '#c8b49a', '#3f3a36', '#6b7a6a'] },
  { kind: 'bed-king', name: 'King bed with storage', category: 'Bedroom', w: 1.9, d: 2.12, h: 1.1, mount: 'floor', rooms: ['bedroom'], material: 'Engineered wood, hydraulic storage, upholstered headboard', price: [38000, 90000], colors: ['#6e5442', '#d2c4b0', '#2f3437'] },
  { kind: 'bed-single', name: 'Single bed', category: 'Bedroom', w: 0.95, d: 2.0, h: 0.9, mount: 'floor', rooms: ['bedroom', 'study'], material: 'Solid wood', price: [12000, 30000], colors: ['#a07c5a', '#e2d8c8', '#3d4a5c'] },
  { kind: 'bedside-table', name: 'Bedside table', category: 'Bedroom', w: 0.48, d: 0.4, h: 0.52, mount: 'floor', rooms: ['bedroom'], material: 'Solid wood, one drawer, shelf', price: [4000, 12000], colors: ['#8a6a4f', '#e8e2d6', '#2f2f2f'] },
  { kind: 'wardrobe-2door', name: 'Wardrobe · 2 door', category: 'Bedroom', w: 1.0, d: 0.6, h: 2.1, mount: 'floor', rooms: ['bedroom', 'walkin'], material: 'BWP plywood, laminate finish, soft-close hinges', price: [22000, 48000], colors: ['#d9cfc0', '#7b5d45', '#5b6670', '#f2efe8'] },
  { kind: 'wardrobe-3door', name: 'Wardrobe · 3 door with mirror', category: 'Bedroom', w: 1.5, d: 0.6, h: 2.1, mount: 'floor', rooms: ['bedroom', 'walkin'], material: 'BWP plywood, laminate, mirror shutter', price: [32000, 70000], colors: ['#d9cfc0', '#7b5d45', '#5b6670', '#f2efe8'] },
  { kind: 'dresser', name: 'Dresser with mirror', category: 'Bedroom', w: 0.9, d: 0.42, h: 1.75, mount: 'floor', rooms: ['bedroom', 'walkin'], material: 'Engineered wood, 3 drawers, bevelled mirror', price: [9000, 24000], colors: ['#8a6a4f', '#ece6db', '#3a3a3a'] },
  { kind: 'study-desk', name: 'Study desk', category: 'Bedroom', w: 1.2, d: 0.6, h: 0.75, mount: 'floor', rooms: ['bedroom', 'study', 'lobby'], material: 'Oak veneer top, metal legs, drawer', price: [8000, 22000], colors: ['#b48a5e', '#f0ece4', '#2e2e2e'] },
  { kind: 'desk-chair', name: 'Desk chair', category: 'Bedroom', w: 0.58, d: 0.58, h: 0.98, mount: 'floor', rooms: ['bedroom', 'study', 'lobby'], material: 'Mesh back, 5-star base, castors', price: [5000, 18000], colors: ['#2b2b2b', '#5a6b7a', '#9b4a3c'] },
  { kind: 'bookshelf', name: 'Bookshelf', category: 'Bedroom', w: 0.8, d: 0.32, h: 1.8, mount: 'floor', rooms: ['bedroom', 'study', 'lobby', 'hall', 'living'], material: 'Solid wood, 5 shelves, styled with books', price: [7000, 20000], colors: ['#8a6a4f', '#f0ece4', '#2f2f2f'] },
  // Living
  { kind: 'sofa-3seat', name: '3-seater sofa', category: 'Living', w: 2.1, d: 0.9, h: 0.85, mount: 'floor', rooms: ['hall', 'living', 'lobby'], material: 'Fabric upholstery, solid wood frame, cushions', price: [35000, 95000], colors: ['#8c8a83', '#36506b', '#a8754f', '#d8cfc0', '#5e6b52'] },
  { kind: 'sofa-2seat', name: '2-seater sofa', category: 'Living', w: 1.5, d: 0.88, h: 0.85, mount: 'floor', rooms: ['hall', 'living', 'lobby', 'bedroom'], material: 'Fabric upholstery, solid wood frame', price: [24000, 65000], colors: ['#8c8a83', '#36506b', '#a8754f', '#d8cfc0'] },
  { kind: 'armchair', name: 'Armchair', category: 'Living', w: 0.82, d: 0.84, h: 0.86, mount: 'floor', rooms: ['hall', 'living', 'lobby', 'bedroom', 'portico'], material: 'Fabric, teak legs', price: [12000, 32000], colors: ['#c3a27a', '#36506b', '#8c8a83', '#7d3f35'] },
  { kind: 'coffee-table', name: 'Coffee table', category: 'Living', w: 1.1, d: 0.6, h: 0.42, mount: 'floor', rooms: ['hall', 'living', 'lobby'], material: 'Solid wood top, lower shelf', price: [7000, 22000], colors: ['#8a6a4f', '#3a3a3a', '#e6e0d4'] },
  { kind: 'tv-unit', name: 'TV unit', category: 'Living', w: 1.8, d: 0.42, h: 0.48, mount: 'floor', rooms: ['hall', 'living', 'bedroom', 'lobby'], material: 'Engineered wood, fluted drawers, open shelf', price: [12000, 38000], colors: ['#8a6a4f', '#ece6db', '#2f2f2f'] },
  { kind: 'tv', name: 'LED TV 55" (wall mounted)', category: 'Living', w: 1.24, d: 0.06, h: 0.72, mount: 'wall', elevation: 0.95, rooms: ['hall', 'living', 'bedroom', 'lobby'], material: '55" 4K panel, slim wall bracket', price: [42000, 95000], colors: ['#111111'] },
  { kind: 'rug', name: 'Area rug', category: 'Living', w: 2.0, d: 1.4, h: 0.012, mount: 'floor', rooms: ['hall', 'living', 'bedroom', 'lobby'], material: 'Hand-tufted wool', price: [6000, 24000], colors: ['#b98d6a', '#5b6b7a', '#d8cfc0', '#7d3f35'], stretch: true },
  { kind: 'floor-lamp', name: 'Floor lamp', category: 'Lighting', w: 0.4, d: 0.4, h: 1.6, mount: 'floor', rooms: ['hall', 'living', 'bedroom', 'lobby'], material: 'Brass stem, linen shade', price: [4000, 14000], colors: ['#b08d57', '#2b2b2b'] },
  { kind: 'side-table', name: 'Side table', category: 'Living', w: 0.45, d: 0.45, h: 0.55, mount: 'floor', rooms: ['hall', 'living', 'bedroom', 'lobby', 'portico'], material: 'Marble top, metal base', price: [3500, 11000], colors: ['#e8e4dc', '#2b2b2b'] },
  { kind: 'shoe-rack', name: 'Shoe rack cabinet', category: 'Living', w: 0.8, d: 0.34, h: 0.9, mount: 'floor', rooms: ['hall', 'living', 'portico', 'passage'], material: 'Engineered wood, tilt-out shelves', price: [5000, 15000], colors: ['#8a6a4f', '#ece6db', '#2f2f2f'] },
  { kind: 'wall-art', name: 'Framed wall art', category: 'Decor', w: 0.9, d: 0.035, h: 0.6, mount: 'wall', elevation: 1.35, rooms: ['hall', 'living', 'bedroom', 'lobby', 'dining'], material: 'Canvas print, wooden frame', price: [2500, 12000], colors: ['#c66b3d', '#2f5d62', '#d9b44a'] },
  { kind: 'plant-tall', name: 'Indoor plant · tall', category: 'Decor', w: 0.5, d: 0.5, h: 1.45, mount: 'floor', rooms: ['hall', 'living', 'bedroom', 'lobby', 'portico', 'balcony'], material: 'Areca palm in ceramic pot', price: [1500, 4500], colors: ['#d8cfc0', '#2b2b2b', '#b4633e'] },
  { kind: 'plant-small', name: 'Indoor plant · small', category: 'Decor', w: 0.3, d: 0.3, h: 0.55, mount: 'floor', rooms: ['hall', 'living', 'bedroom', 'lobby', 'kitchen', 'balcony'], material: 'Snake plant in ceramic pot', price: [500, 1800], colors: ['#d8cfc0', '#2b2b2b', '#b4633e'] },
  { kind: 'curtains', name: 'Curtains with rod', category: 'Decor', w: 1.6, d: 0.12, h: 2.3, mount: 'wall', elevation: 0.0, rooms: ['bedroom', 'hall', 'living', 'lobby'], material: 'Linen blend, blackout lining, metal rod', price: [3500, 12000], colors: ['#e7dccb', '#7d8a77', '#5b6b7a', '#b98d6a'], stretch: true },
  // Dining
  { kind: 'dining-set-4', name: 'Dining set · 4 seater', category: 'Dining', w: 1.2, d: 1.55, h: 0.9, mount: 'floor', rooms: ['hall', 'dining', 'kitchen', 'living'], material: 'Sheesham table 1200×800, 4 cushioned chairs', price: [22000, 55000], colors: ['#8a6a4f', '#e6e0d4', '#3a3a3a'] },
  { kind: 'dining-set-6', name: 'Dining set · 6 seater', category: 'Dining', w: 1.95, d: 1.6, h: 0.9, mount: 'floor', rooms: ['hall', 'dining', 'living'], material: 'Sheesham table 1800×900, 6 chairs', price: [34000, 85000], colors: ['#8a6a4f', '#e6e0d4', '#3a3a3a'] },
  // Kitchen
  { kind: 'kitchen-counter', name: 'Base cabinets + granite counter', category: 'Kitchen', w: 1.2, d: 0.6, h: 0.9, mount: 'floor', rooms: ['kitchen', 'utility'], material: 'BWP plywood carcass, acrylic shutters, granite top', price: [18000, 32000], colors: ['#e9e4da', '#5d6f62', '#1f2f3f', '#8a6a4f'], stretch: true },
  { kind: 'kitchen-sink-unit', name: 'Sink unit', category: 'Kitchen', w: 1.0, d: 0.6, h: 0.9, mount: 'floor', rooms: ['kitchen'], material: 'SS double-bowl sink, pull-out tap, base cabinet', price: [16000, 34000], colors: ['#e9e4da', '#5d6f62', '#1f2f3f', '#8a6a4f'] },
  { kind: 'hob-unit', name: 'Hob unit · 3 burner', category: 'Kitchen', w: 0.9, d: 0.6, h: 0.9, mount: 'floor', rooms: ['kitchen'], material: 'Glass-top 3-burner hob, drawers below', price: [20000, 42000], colors: ['#e9e4da', '#5d6f62', '#1f2f3f', '#8a6a4f'] },
  { kind: 'chimney', name: 'Kitchen chimney', category: 'Kitchen', w: 0.9, d: 0.48, h: 0.75, mount: 'wall', elevation: 1.55, rooms: ['kitchen'], material: 'Auto-clean, 1200 m³/h, SS + glass', price: [14000, 32000], colors: ['#c9ccd0', '#1c1c1c'] },
  { kind: 'wall-cabinet', name: 'Wall cabinets', category: 'Kitchen', w: 1.2, d: 0.35, h: 0.7, mount: 'wall', elevation: 1.5, rooms: ['kitchen', 'utility'], material: 'BWP plywood, lift-up shutters', price: [12000, 26000], colors: ['#e9e4da', '#5d6f62', '#1f2f3f', '#8a6a4f'], stretch: true },
  { kind: 'refrigerator', name: 'Refrigerator · double door', category: 'Kitchen', w: 0.7, d: 0.72, h: 1.75, mount: 'floor', rooms: ['kitchen', 'dining', 'hall'], material: '340 L frost-free', price: [32000, 60000], colors: ['#c9ccd0', '#2b2b2b', '#e9e7e2'] },
  { kind: 'microwave', name: 'Microwave oven', category: 'Kitchen', w: 0.5, d: 0.38, h: 0.3, mount: 'wall', elevation: 0.9, rooms: ['kitchen'], material: '28 L convection', price: [11000, 22000], colors: ['#1c1c1c', '#c9ccd0'] },
  { kind: 'water-purifier', name: 'Water purifier (RO)', category: 'Kitchen', w: 0.3, d: 0.16, h: 0.48, mount: 'wall', elevation: 1.15, rooms: ['kitchen'], material: 'RO+UV, 8 L tank', price: [12000, 22000], colors: ['#f2f2f2', '#1c1c1c'] },
  // Bath
  { kind: 'wc', name: 'Western WC · wall-hung', category: 'Bath', w: 0.38, d: 0.56, h: 0.8, mount: 'floor', rooms: ['toilet'], material: 'Vitreous china, concealed cistern, dual flush plate', price: [12000, 35000], colors: ['#f7f7f5'] },
  { kind: 'washbasin', name: 'Washbasin with vanity', category: 'Bath', w: 0.6, d: 0.46, h: 0.85, mount: 'floor', rooms: ['toilet', 'utility', 'dining'], material: 'Ceramic counter basin, vanity drawer, pillar tap', price: [9000, 26000], colors: ['#8a6a4f', '#f2efe8', '#3a3a3a'] },
  { kind: 'mirror', name: 'Wall mirror', category: 'Bath', w: 0.6, d: 0.03, h: 0.8, mount: 'wall', elevation: 1.15, rooms: ['toilet', 'bedroom', 'walkin', 'hall', 'utility'], material: 'Bevelled mirror, backlit', price: [2500, 9000], colors: ['#d8d8d8'] },
  { kind: 'shower', name: 'Rain shower set', category: 'Bath', w: 0.4, d: 0.32, h: 1.35, mount: 'wall', elevation: 0.85, rooms: ['toilet'], material: '8" overhead shower, hand shower, diverter mixer', price: [7000, 24000], colors: ['#c9ccd0', '#1c1c1c', '#b08d57'] },
  { kind: 'glass-partition', name: 'Shower glass partition', category: 'Bath', w: 0.9, d: 0.06, h: 2.0, mount: 'floor', rooms: ['toilet'], material: '8 mm toughened glass, SS clamps', price: [9000, 18000], colors: ['#d6e4e8'], stretch: true },
  { kind: 'geyser', name: 'Water heater (geyser)', category: 'Bath', w: 0.36, d: 0.36, h: 0.55, mount: 'wall', elevation: 1.85, rooms: ['toilet', 'kitchen', 'utility'], material: '15 L storage, 5-star', price: [7000, 16000], colors: ['#f2f2f2'] },
  { kind: 'towel-rail', name: 'Towel rail', category: 'Bath', w: 0.6, d: 0.1, h: 0.12, mount: 'wall', elevation: 1.25, rooms: ['toilet'], material: 'SS 304', price: [1200, 4000], colors: ['#c9ccd0', '#1c1c1c'] },
  // Pooja
  { kind: 'pooja-mandir', name: 'Pooja mandir', category: 'Pooja', w: 0.9, d: 0.45, h: 1.55, mount: 'floor', rooms: ['pooja', 'hall', 'living', 'kitchen'], material: 'Teak wood, carved arch, bell, drawers', price: [18000, 60000], colors: ['#9a6a3c', '#f0e6d2'] },
  // Utility
  { kind: 'washing-machine', name: 'Washing machine · front load', category: 'Utility', w: 0.6, d: 0.58, h: 0.85, mount: 'floor', rooms: ['utility', 'toilet'], material: '8 kg front load', price: [30000, 55000], colors: ['#f2f2f2', '#4a4d52'] },
  { kind: 'utility-sink', name: 'Utility sink', category: 'Utility', w: 0.6, d: 0.5, h: 0.85, mount: 'floor', rooms: ['utility'], material: 'SS sink on granite slab, bib tap', price: [5000, 12000], colors: ['#c9ccd0'] },
  // Lighting (ceiling)
  { kind: 'ceiling-fan', name: 'Ceiling fan', category: 'Lighting', w: 1.2, d: 1.2, h: 0.42, mount: 'ceiling', rooms: ['bedroom', 'hall', 'living', 'lobby', 'kitchen', 'dining', 'study'], material: 'BLDC, 1200 mm sweep', price: [3500, 9000], colors: ['#f2f0ea', '#8a6a4f', '#2b2b2b'] },
  { kind: 'ceiling-light', name: 'Ceiling light', category: 'Lighting', w: 0.42, d: 0.42, h: 0.09, mount: 'ceiling', rooms: ['bedroom', 'hall', 'living', 'lobby', 'kitchen', 'toilet', 'pooja', 'utility', 'walkin', 'staircase', 'portico', 'passage'], material: 'LED surface panel, 18 W', price: [900, 3000], colors: ['#f7f7f5'] },
  { kind: 'pendant-light', name: 'Pendant light', category: 'Lighting', w: 0.38, d: 0.38, h: 0.7, mount: 'ceiling', rooms: ['dining', 'hall', 'living', 'kitchen', 'bedroom'], material: 'Brass dome pendant', price: [3000, 12000], colors: ['#b08d57', '#2b2b2b', '#f2efe8'] },
  // Outdoor
  { kind: 'jhoola', name: 'Hanging swing (jhoola)', category: 'Outdoor', w: 1.2, d: 0.55, h: 2.9, mount: 'ceiling', rooms: ['portico', 'balcony', 'hall'], material: 'Teak seat, brass chains, cushions', price: [16000, 45000], colors: ['#8a5a34', '#c8a272'] },
  { kind: 'plant-outdoor', name: 'Outdoor planter', category: 'Outdoor', w: 0.55, d: 0.55, h: 1.1, mount: 'floor', rooms: ['portico', 'balcony'], material: 'Fibreglass planter, bougainvillea', price: [2000, 6000], colors: ['#3a3a3a', '#b4633e', '#d8cfc0'] },
  { kind: 'car', name: 'Car · compact SUV', category: 'Outdoor', w: 1.78, d: 3.99, h: 1.6, mount: 'floor', rooms: ['portico', 'other'], material: 'For parking clearance checks', price: [0, 0], colors: ['#a3262a', '#e9e9e7', '#2b3a4a', '#1c1c1c'] },
];

export const catalogByKind = (kind: string): CatalogItem | undefined => CATALOG.find((c) => c.kind === kind);

export const CATEGORIES: CatalogCategory[] = ['Living', 'Dining', 'Bedroom', 'Kitchen', 'Bath', 'Pooja', 'Utility', 'Lighting', 'Decor', 'Outdoor'];
