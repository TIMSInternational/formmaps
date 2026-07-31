"use client";

import React, { createContext, useContext } from "react";

type ThemeMode = "solid" | "glass";

interface UIDesignContextType {
  themeMode: ThemeMode;
}

const UIDesignContext = createContext<UIDesignContextType>({ themeMode: "solid" });

export function UIDesignProvider({
  children,
  themeMode,
}: {
  children: React.ReactNode;
  themeMode: ThemeMode;
}) {
  return (
    <UIDesignContext.Provider value={{ themeMode }}>
      {children}
    </UIDesignContext.Provider>
  );
}

export function useUIDesign() {
  return useContext(UIDesignContext);
}
