import { create } from "zustand";

interface CareersStore {
  compareList: string[];
  addToCompare: (id: string) => void;
  removeFromCompare: (id: string) => void;
  toggleCompare: (id: string) => void;
  clearCompare: () => void;
}

export const useCareersStore = create<CareersStore>((set, get) => ({
  compareList: [],
  addToCompare: (id) =>
    set((state) => ({
      compareList: state.compareList.includes(id)
        ? state.compareList
        : [...state.compareList, id].slice(0, 3),
    })),
  removeFromCompare: (id) =>
    set((state) => ({
      compareList: state.compareList.filter((x) => x !== id),
    })),
  toggleCompare: (id) =>
    set((state) => ({
      compareList: state.compareList.includes(id)
        ? state.compareList.filter((x) => x !== id)
        : [...state.compareList, id].slice(0, 3),
    })),
  clearCompare: () => set({ compareList: [] }),
}));
