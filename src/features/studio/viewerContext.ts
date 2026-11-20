import { createContext, useContext } from 'react';
import type { HouseViewerAPI } from '@/three/api';

export const ViewerContext = createContext<{ current: HouseViewerAPI | null }>({ current: null });
export const useViewer = () => useContext(ViewerContext);
