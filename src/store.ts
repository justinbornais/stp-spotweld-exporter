import { create } from 'zustand';
import type { WeldPoint, ParsedCADModel, AppMode, WeldPathStyle } from './types';

interface AppState {
  // App mode
  mode: AppMode;
  setMode: (mode: AppMode) => void;

  // CAD model
  model: ParsedCADModel | null;
  setModel: (model: ParsedCADModel | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  loadingMessage: string;
  setLoadingMessage: (msg: string) => void;

  // Welds
  welds: WeldPoint[];
  addWeld: (weld: WeldPoint) => void;
  removeWeld: (id: string) => void;
  updateWeld: (id: string, updates: Partial<WeldPoint>) => void;
  reorderWelds: (fromIndex: number, toIndex: number) => void;
  clearWelds: () => void;
  showWeldPath: boolean;
  setShowWeldPath: (show: boolean) => void;
  weldPathStyle: WeldPathStyle;
  setWeldPathStyle: (style: WeldPathStyle) => void;

  // Selection
  selectedWeldId: string | null;
  setSelectedWeldId: (id: string | null) => void;
  hoveredFaceIndex: number | null;
  setHoveredFaceIndex: (index: number | null) => void;

  // Next weld ID counter
  nextWeldNumber: number;
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: 'upload',
  setMode: (mode) => set({ mode }),

  model: null,
  setModel: (model) => set({ model, mode: model ? 'view' : 'upload' }),
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  loadingMessage: '',
  setLoadingMessage: (loadingMessage) => set({ loadingMessage }),

  welds: [],
  addWeld: (weld) => {
    const state = get();
    set({
      welds: [...state.welds, weld],
      nextWeldNumber: state.nextWeldNumber + 1,
    });
  },
  removeWeld: (id) =>
    set((state) => {
      const welds = state.welds
        .filter((w) => w.id !== id)
        .map((w, i) => ({ ...w, sequence: i + 1 }));
      return {
        welds,
        selectedWeldId: state.selectedWeldId === id ? null : state.selectedWeldId,
      };
    }),
  updateWeld: (id, updates) =>
    set((state) => ({
      welds: state.welds.map((w) => (w.id === id ? { ...w, ...updates } : w)),
    })),
  reorderWelds: (fromIndex, toIndex) =>
    set((state) => {
      const welds = [...state.welds];
      const [moved] = welds.splice(fromIndex, 1);
      welds.splice(toIndex, 0, moved);
      return {
        welds: welds.map((w, i) => ({ ...w, sequence: i + 1 })),
      };
    }),
  clearWelds: () => set({ welds: [], nextWeldNumber: 1, selectedWeldId: null }),
  showWeldPath: false,
  setShowWeldPath: (showWeldPath) => set({ showWeldPath }),
  weldPathStyle: 'linear',
  setWeldPathStyle: (weldPathStyle) => set({ weldPathStyle }),

  selectedWeldId: null,
  setSelectedWeldId: (id) => set({ selectedWeldId: id }),
  hoveredFaceIndex: null,
  setHoveredFaceIndex: (index) => set({ hoveredFaceIndex: index }),

  nextWeldNumber: 1,
}));
