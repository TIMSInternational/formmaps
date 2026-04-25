'use client';

import React from 'react';
import {
  Text,
  View,
  StyleSheet,
  Svg,
  Path,
  G,
  LinearGradient,
  RadialGradient,
  Stop,
  Rect,
  Circle,
  Defs,
  Page,
  Line,
} from '@react-pdf/renderer';

// Standard fonts
const primaryFont = 'Helvetica';
const primaryFontBold = 'Helvetica-Bold';

// Color Palette - Extended for Richer UI
export const modernColors = {
  primary: '#4f46e5', // Vibrant Indigo - New Core Brand Color
  secondary: '#ec4899', // Vibrant Pink
  accent: '#8b5cf6', // Vibrant Violet
  dark: '#0f172a', // Slate 900
  textPrimary: '#1e293b', // Slate 800
  textSecondary: '#64748b', // Slate 500
  textOnDark: '#f1f5f9', // Slate 100 for Sidebar
  textMutedOnDark: '#94a3b8', // Slate 400 for Sidebar
  highlight: '#f0fdf4', // Green 50
  warning: '#fffbeb', // Amber 50
  error: '#fef2f2', // Red 50
  success: '#10b981', // Emerald 500
  gridLines: '#e2e8f0', // Slate 200
  sidebarBg: '#020410', // Deep Obsidian - Matches Cover Page
  cardBg: '#ffffff',
  headerBg: '#020410',
};

export const modernStyles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    fontFamily: primaryFont,
    color: modernColors.textPrimary,
    flexDirection: 'row', // Enable side-by-side layout by default
  },
  sidebar: {
     width: '28%',
     backgroundColor: modernColors.sidebarBg,
     height: '100%',
     padding: 24,
     borderRightWidth: 1,
     borderRightColor: '#1e293b', // Darker border for dark sidebar
  },
  mainContent: {
     flex: 1,
     padding: 24,
     paddingTop: 32,
  },
  sidebarFooter: {
     position: 'absolute',
     bottom: 24,
     left: 24,
     right: 24,
  },
  heading1: {
     fontSize: 24,
     fontFamily: primaryFontBold,
     color: modernColors.dark,
     marginBottom: 8,
     lineHeight: 1.2,
  },
  heading2: {
     fontSize: 16,
     fontFamily: primaryFontBold,
     color: modernColors.primary,
     marginBottom: 12,
     textTransform: 'uppercase',
     letterSpacing: 1,
  },
  heading3: {
     fontSize: 12,
     fontFamily: primaryFontBold,
     color: modernColors.textPrimary,
     marginBottom: 6,
  },
  paragraph: {
     fontSize: 10,
     color: modernColors.textSecondary,
     lineHeight: 1.6,
     marginBottom: 12,
     textAlign: 'justify',
  },
  card: {
     backgroundColor: 'white',
     borderRadius: 12,
     padding: 16,
     marginBottom: 16,
     borderWidth: 1,
     borderColor: '#f1f5f9', // Slate 100
     // boxShadow not fully supported in react-pdf, removed to avoid confusion
  },
  iconBox: {
     width: 32,
     height: 32,
     borderRadius: 8,
     justifyContent: 'center',
     alignItems: 'center',
     marginBottom: 8,
  }
});

// --- Decorative Components ---

export const CircuitPattern = ({ opacity = 0.1 }: { opacity?: number }) => (
   <Svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
      {/* Abstract Circuit Lines */}
      <Path d="M0,50 L50,50 L50,100" stroke={modernColors.primary} strokeWidth="1" fill="none" opacity={opacity} />
      <Path d="M100,0 L100,150 L150,150" stroke={modernColors.secondary} strokeWidth="1" fill="none" opacity={opacity} />
      <Circle cx="50" cy="50" r="3" fill={modernColors.primary} opacity={opacity * 2} />
      <Circle cx="150" cy="150" r="3" fill={modernColors.secondary} opacity={opacity * 2} />
      {/* Grid Dots */}
      {[...Array(20)].map((_, i) => (
         <Circle key={`d-${i}`} cx={Math.random() * 500} cy={Math.random() * 800} r="1" fill="#94a3b8" opacity={opacity} />
      ))}
   </Svg>
);

export const SidebarDecoration = () => (
   <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 300, overflow: 'hidden' }}>
      <Svg width="100%" height="300" viewBox="0 0 200 300" preserveAspectRatio="none">
         <Defs>
            <LinearGradient id="grad1" x1="0%" y1="0%" x2="0%" y2="100%">
               <Stop offset="0%" stopColor="#020410" stopOpacity="0" />
               <Stop offset="100%" stopColor={modernColors.primary} stopOpacity="0.1" />
            </LinearGradient>
            <RadialGradient id="glow" cx="50%" cy="100%" r="80%">
                <Stop offset="0%" stopColor={modernColors.secondary} stopOpacity="0.15" />
                <Stop offset="100%" stopColor={modernColors.secondary} stopOpacity="0" />
            </RadialGradient>
         </Defs>
         <Rect x="0" y="0" width="200" height="300" fill="url(#grad1)" />
         <Rect x="0" y="0" width="200" height="300" fill="url(#glow)" />
         
         {/* Subtle Grid overlay */}
         <Path d="M 0,250 L 200,250" stroke={modernColors.primary} strokeWidth="0.5" opacity="0.2" />
         <Path d="M 0,280 L 200,280" stroke={modernColors.primary} strokeWidth="0.5" opacity="0.1" />
      </Svg>
   </View>
);

// --- Layout Components ---

// --- Restored Standard Components for Backward Compatibility ---

export const GenericPageLayout = ({ 
  children, 
  sidebarContent, 
  pageNum, 
  totalPages 
}: { 
  children: React.ReactNode; 
  sidebarContent: React.ReactNode; 
  pageNum: number; 
  totalPages: number; 
}) => (
  <Page size="A4" style={modernStyles.page}>
     {/* Sidebar */}
     <View style={modernStyles.sidebar}>
        <SidebarDecoration />
        <View style={{ marginBottom: 32 }}>
           {/* Logo Placeholder */}
           <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: modernColors.primary }} />
              <Text style={{ fontSize: 14, fontFamily: primaryFontBold, color: modernColors.textOnDark }}>TimCare</Text>
           </View>
        </View>
        
        {sidebarContent}

        <View style={modernStyles.sidebarFooter}>
           <Text style={{ fontSize: 8, color: modernColors.textMutedOnDark, marginBottom: 4 }}>Report ID: TC-GEN-001</Text>
           <Text style={{ fontSize: 8, color: modernColors.textMutedOnDark }}>Page {pageNum} of {totalPages}</Text>
        </View>
     </View>

     {/* Main Content */}
     <View style={modernStyles.mainContent}>
        {/* Architectural Grid Overlay - Manual Lines */}
        <Svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.2 }}>
            <Path d="M 40,0 L 40,800" stroke={modernColors.gridLines} strokeWidth="0.5" />
            <Path d="M 140,0 L 140,800" stroke={modernColors.gridLines} strokeWidth="0.5" />
            <Path d="M 240,0 L 240,800" stroke={modernColors.gridLines} strokeWidth="0.5" />
            <Path d="M 340,0 L 340,800" stroke={modernColors.gridLines} strokeWidth="0.5" />
            <Path d="M 440,0 L 440,800" stroke={modernColors.gridLines} strokeWidth="0.5" />
            
            <Path d="M 0,40 L 600,40" stroke={modernColors.gridLines} strokeWidth="0.5" />
            <Path d="M 0,140 L 600,140" stroke={modernColors.gridLines} strokeWidth="0.5" />
            <Path d="M 0,240 L 600,240" stroke={modernColors.gridLines} strokeWidth="0.5" />
            <Path d="M 0,340 L 600,340" stroke={modernColors.gridLines} strokeWidth="0.5" />
            <Path d="M 0,440 L 600,440" stroke={modernColors.gridLines} strokeWidth="0.5" />
            <Path d="M 0,540 L 600,540" stroke={modernColors.gridLines} strokeWidth="0.5" />
            <Path d="M 0,640 L 600,640" stroke={modernColors.gridLines} strokeWidth="0.5" />
            
            <Path d="M 40,0 L 40,800" stroke={modernColors.primary} strokeWidth="1" opacity="0.3" />
        </Svg>
        
        {children}
     </View>
  </Page>
);

export const HolographicGauge = ({ score, label, color = modernColors.primary }: { score: number; label: string; color?: string }) => {
  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const angle = (score / 100) * 360;
  const endAngle = angle >= 360 ? 359.9 : angle; 
  const startRad = - Math.PI / 2; 
  const endRad = startRad + (endAngle * Math.PI / 180);
  
  const x1 = size / 2 + radius * Math.cos(startRad);
  const y1 = size / 2 + radius * Math.sin(startRad);
  const x2 = size / 2 + radius * Math.cos(endRad);
  const y2 = size / 2 + radius * Math.sin(endRad);
  const largeArcFlag = endAngle > 180 ? 1 : 0;
  const pathData = ["M", x1, y1, "A", radius, radius, 0, largeArcFlag, 1, x2, y2].join(" ");

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size, position: 'relative' }}>
      <Svg width={size} height={size}>
        <Path d={`M ${size/2},${strokeWidth/2} A ${radius},${radius} 0 1 1 ${size/2},${size-strokeWidth/2} A ${radius},${radius} 0 1 1 ${size/2},${strokeWidth/2}`} stroke="#e2e8f0" strokeWidth={strokeWidth} fill="none" />
         <Path d={pathData} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
         <Text style={{ fontSize: 28, fontFamily: primaryFontBold, color: modernColors.dark }}>{score}</Text>
         <Text style={{ fontSize: 8, color: modernColors.textSecondary, textTransform: 'uppercase' }}>{label}</Text>
      </View>
    </View>
  );
};

export const TechProgressBar = ({ label, value, color = modernColors.primary }: { label: string; value: number; color?: string }) => (
  <View style={{ marginBottom: 16 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
      <Text style={{ fontSize: 10, fontFamily: primaryFontBold, color: modernColors.textPrimary }}>{label}</Text>
      <Text style={{ fontSize: 10, fontFamily: primaryFontBold, color: color }}>{value}%</Text>
    </View>
    <View style={{ height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ width: `${value}%`, backgroundColor: color, height: '100%', borderRadius: 3 }} />
    </View>
  </View>
);

// --- Layout Components ---

export const CleanEditorialLayout = ({ 
  children, 
  title,
  subtitle,
  pageNum, 
  totalPages 
}: { 
  children: React.ReactNode; 
  title: string;
  subtitle?: string;
  pageNum: number; 
  totalPages: number; 
}) => (
  <Page size="A4" style={{ backgroundColor: '#ffffff', padding: 32, fontFamily: primaryFont, color: modernColors.textPrimary }}>
     {/* Minimalist Header */}
     <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, borderBottomWidth: 1, borderBottomColor: modernColors.gridLines, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: modernColors.primary }} />
            <Text style={{ fontSize: 10, fontFamily: primaryFontBold, color: modernColors.dark, letterSpacing: 1 }}>TIMCARE INTELLIGENCE</Text>
        </View>
        <View>
            <Text style={{ fontSize: 9, color: modernColors.primary, letterSpacing: 2, fontFamily: primaryFontBold, textTransform: 'uppercase', textAlign: 'right' }}>{title}</Text>
            {subtitle && <Text style={{ fontSize: 7, color: modernColors.textSecondary, letterSpacing: 0.5, textAlign: 'right', marginTop: 2 }}>{subtitle}</Text>}
        </View>
     </View>

     {/* Main Content Area - Full Width */}
     <View style={{ flex: 1 }}>
        {children}
     </View>

     {/* Footer */}
     <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: modernColors.gridLines }}>
         <Text style={{ fontSize: 8, color: modernColors.textSecondary }}>CONFIDENTIAL ASSESSMENT REPORT</Text>
         <Text style={{ fontSize: 8, color: modernColors.textSecondary }}>Page {pageNum} of {totalPages}</Text>
     </View>
  </Page>
);

export const DarkEditorialLayout = ({ 
  children, 
  title,
  pageNum, 
  totalPages 
}: { 
  children: React.ReactNode; 
  title: string;
  pageNum: number; 
  totalPages: number; 
}) => (
  <Page size="A4" style={{ backgroundColor: '#020410', padding: 32, fontFamily: primaryFont, color: '#f1f5f9' }}>
     {/* Ambient Background Glows */}
     <Svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
         <Defs>
            <RadialGradient id="pageGlow" cx="50%" cy="0%" r="80%">
                <Stop offset="0%" stopColor="#4f46e5" stopOpacity="0.05" />
                <Stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
            </RadialGradient>
         </Defs>
         <Rect width="100%" height="100%" fill="url(#pageGlow)" />
     </Svg>

     {/* Minimalist Header */}
     <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: modernColors.primary }} />
            <Text style={{ fontSize: 10, fontFamily: primaryFontBold, color: '#f8fafc', letterSpacing: 1 }}>TIMCARE INTELLIGENCE</Text>
        </View>
        <Text style={{ fontSize: 9, color: modernColors.primary, letterSpacing: 2, fontFamily: primaryFontBold, textTransform: 'uppercase' }}>{title}</Text>
     </View>

     {/* Main Content Area - Full Width */}
     <View style={{ flex: 1 }}>
        {children}
     </View>

     {/* Footer */}
     <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
         <Text style={{ fontSize: 8, color: '#64748b' }}>CONFIDENTIAL ASSESSMENT REPORT</Text>
         <Text style={{ fontSize: 8, color: '#64748b' }}>Page {pageNum} of {totalPages}</Text>
     </View>
  </Page>
);

// --- Premium "Ethereal" Components (Dark Mode Optimized) ---

export const SectionTitle = ({ title }: { title: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, marginTop: 8 }}>
        <Text style={{ fontSize: 12, fontFamily: primaryFontBold, color: modernColors.primary, letterSpacing: 1, textTransform: 'uppercase' }}>
            // {title}
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: modernColors.primary, marginLeft: 12, opacity: 0.2 }} />
    </View>
);

export const StatCard = ({ label, value, subtext, color = modernColors.primary, variant = 'dark', progress }: { label: string; value: string; subtext?: string; color?: string; variant?: 'dark' | 'light'; progress?: number }) => (
   <View style={{ 
       flex: 1, 
       padding: 16, 
       backgroundColor: variant === 'dark' ? 'rgba(255,255,255,0.03)' : '#ffffff', 
       borderRadius: 12, 
       borderWidth: 1,
       borderColor: variant === 'dark' ? 'rgba(255,255,255,0.05)' : '#e2e8f0',
       position: 'relative',
       overflow: 'hidden'
    }}>
      <Text style={{ fontSize: 32, fontFamily: primaryFontBold, color: variant === 'dark' ? '#f8fafc' : modernColors.dark, marginBottom: 4, letterSpacing: -1 }}>{value}</Text>
      <Text style={{ fontSize: 9, color: variant === 'dark' ? '#94a3b8' : modernColors.textSecondary, textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 }}>{label}</Text>
      {subtext && <Text style={{ fontSize: 9, color: color, fontFamily: primaryFontBold, marginBottom: 4 }}>{subtext}</Text>}
      
      {/* Creative Progress Border */}
      {progress !== undefined && (
          <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: variant === 'dark' ? 'rgba(255,255,255,0.1)' : '#f1f5f9' }}>
              <View style={{ width: `${progress}%`, height: '100%', backgroundColor: color }} />
          </View>
      )}
   </View>
);

export const InfoCard = ({ title, value, icon, subtext }: { title: string; value: string; icon?: string; subtext?: string }) => (
   <View style={modernStyles.card}>
      <Text style={{ fontSize: 9, color: modernColors.textSecondary, marginBottom: 4 }}>{title}</Text>
      <Text style={{ fontSize: 18, fontFamily: primaryFontBold, color: modernColors.dark, marginBottom: 2 }}>{value}</Text>
      {subtext && <Text style={{ fontSize: 8, color: modernColors.success }}>{subtext}</Text>}
   </View>
);

// --- "The Singularity" Creative Elements ---

// --- "Ethereal Clarity" Creative Elements ---

// --- "Ethereal Clarity" Creative Elements ---
// (Graphics removed for pure minimalist aesthetic, refined with structural grid)

export const ModernCoverPage = ({ title, subtitle, userName, date }: { title: string; subtitle: string; userName: string; date: string }) => (
  <View style={{ flex: 1, backgroundColor: '#020410', position: 'relative', overflow: 'hidden' }}>
    <Svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
       <Defs>
          {/* Deep "Luxury FinTech" Background Gradient */}
          <LinearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="100%">
             <Stop offset="0%" stopColor="#020410" /> {/* Deepest Navy */}
             <Stop offset="50%" stopColor="#0f172a" /> {/* Slate 900 */}
             <Stop offset="100%" stopColor="#020617" /> {/* Back to Deep */}
          </LinearGradient>
          
          {/* Aesthetic atmospheric glows - Teal & Violet */}
          <RadialGradient id="topGlow" cx="80%" cy="-10%" r="80%">
             <Stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.08" /> {/* Teal Accent */}
             <Stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="bottomGlow" cx="20%" cy="110%" r="80%">
             <Stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.08" /> {/* Violet Accent */}
             <Stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </RadialGradient>
       </Defs>
       
       {/* Background Layers */}
       <Rect x="0" y="0" width="100%" height="100%" fill="url(#bgGrad)" />
       <Rect x="0" y="0" width="100%" height="100%" fill="url(#topGlow)" />
       <Rect x="0" y="0" width="100%" height="100%" fill="url(#bottomGlow)" />
       
       {/* Structural "Architectural" Grid Lines - Very subtle */}
       <Path d="M 48,120 L 548,120" stroke="#334155" strokeWidth="0.5" opacity="0.3" /> {/* Top Header Line */}
       <Path d="M 48,720 L 548,720" stroke="#334155" strokeWidth="0.5" opacity="0.3" /> {/* Bottom Footer Line */}
       
       <Path d="M 400,120 L 400,300" stroke="#334155" strokeWidth="0.5" opacity="0.2" /> {/* Vertical accent */}
    </Svg>

    <View style={{ flex: 1, padding: 48, justifyContent: 'space-between' }}>
       
       {/* Top: Brand Header */}
       <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 40 }}>
           <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
               <View style={{ width: 22, height: 22, backgroundColor: '#2dd4bf', borderRadius: 6, opacity: 0.9 }} /> {/* Teal Brand Color */}
               <View>
                   <Text style={{ fontSize: 12, color: '#f1f5f9', letterSpacing: 2, fontFamily: 'Helvetica-Bold' }}>TIMCARE</Text>
                   <Text style={{ fontSize: 9, color: '#94a3b8', letterSpacing: 1 }}>ANALYTICS DIVISION</Text>
               </View>
           </View>
           <View>
                <Text style={{ fontSize: 10, color: '#64748b', textAlign: 'right', letterSpacing: 1 }}>CONFIDENTIAL</Text>
                <Text style={{ fontSize: 10, color: '#475569', textAlign: 'right' }}>SERIES IV / {new Date().getFullYear()}</Text>
           </View>
       </View>

       {/* Middle: Content Block */}
       <View style={{ flex: 1, paddingTop: 60 }}>
           {/* Section Label */}
           <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                <View style={{ width: 24, height: 1, backgroundColor: '#2dd4bf', marginRight: 12 }} />
                <Text style={{ 
                    fontSize: 10, 
                    color: '#2dd4bf', 
                    letterSpacing: 3, 
                    fontFamily: 'Helvetica-Bold',
                    textTransform: 'uppercase'
                }}>
                    Quantitative Profile
                </Text>
           </View>
           
           {/* Massive Typography - Mixed Opacities for Depth */}
           <View>
               <Text style={{ fontSize: 64, color: '#f8fafc', fontFamily: 'Helvetica-Bold', lineHeight: 0.9, letterSpacing: -2 }}>
                   LABOR
               </Text>
               <Text style={{ fontSize: 64, color: '#f8fafc', fontFamily: 'Helvetica-Bold', lineHeight: 0.9, letterSpacing: -2 }}>
                   INTELLIGENCE
               </Text>
               <Text style={{ fontSize: 64, color: '#475569', fontFamily: 'Helvetica-Bold', lineHeight: 0.9, letterSpacing: -2 }}>
                   ANALYSIS
               </Text>
           </View>

           {/* New Content: Report Highlights / "Table of Contents" Teaser */}
           {/* Placed in the negative space to the right or below */}
           <View style={{ marginTop: 40, marginLeft: 4, paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.1)' }}>
               <Text style={{ fontSize: 10, color: '#64748b', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'Helvetica-Bold' }}>Report Contents</Text>
               
               <View style={{ gap: 10 }}>
                   <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                       <Text style={{ fontSize: 11, color: '#2dd4bf', fontFamily: 'Helvetica-Bold', width: 24 }}>01</Text>
                       <Text style={{ fontSize: 11, color: '#cbd5e1' }}>Executive Summary & Strategy</Text>
                   </View>
                   <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                       <Text style={{ fontSize: 11, color: '#2dd4bf', fontFamily: 'Helvetica-Bold', width: 24 }}>02</Text>
                       <Text style={{ fontSize: 11, color: '#cbd5e1' }}>Cognitive Dimensions</Text>
                   </View>
                   <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                       <Text style={{ fontSize: 11, color: '#2dd4bf', fontFamily: 'Helvetica-Bold', width: 24 }}>03</Text>
                       <Text style={{ fontSize: 11, color: '#cbd5e1' }}>Behavioral Patterns</Text>
                   </View>
                   <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                       <Text style={{ fontSize: 11, color: '#2dd4bf', fontFamily: 'Helvetica-Bold', width: 24 }}>04</Text>
                       <Text style={{ fontSize: 11, color: '#cbd5e1' }}>Career Alignment</Text>
                   </View>
               </View>
           </View>
       </View>

       {/* Bottom: Footer Info */}
       <View style={{ 
           flexDirection: 'row',
           alignItems: 'flex-end',
           marginBottom: 10,
           justifyContent: 'space-between'
       }}>
            <View>
                <Text style={{ fontSize: 9, color: '#64748b', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>Candidate</Text>
                <Text style={{ fontSize: 32, color: '#f8fafc', fontFamily: 'Helvetica-Bold', letterSpacing: -0.5 }}>{userName}</Text>
                <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Assessment ID: TC-{Math.floor(Math.random() * 1000000)}</Text>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
                 <View style={{ backgroundColor: 'rgba(45, 212, 191, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4 }}>
                     <Text style={{ fontSize: 9, color: '#2dd4bf', fontFamily: 'Helvetica-Bold' }}>98% COMPLETE</Text>
                 </View>
                 <Text style={{ fontSize: 9, color: '#64748b', marginTop: 8 }}>{date}</Text>
            </View>
       </View>

    </View>
  </View>
);

// --- Behavioral Visuals ---

export const SpeedAccuracyVisual = ({ color }: { color: string }) => (
  <Svg width="100%" height="40" viewBox="0 0 200 40">
      {/* Track */}
      <Rect x="0" y="18" width="200" height="4" rx="2" fill="#f1f5f9" />
      {/* Active Range / Gradient Representation */}
      <Rect x="50" y="18" width="100" height="4" rx="2" fill={color} opacity={0.3} />
      {/* Marker - Positioned at 'High Balance' (approx 75%) */}
      <Circle cx="150" cy="20" r="6" fill={color} />
      <Circle cx="150" cy="20" r="3" fill="#fff" />
      {/* Labels */}
      <Text x="0" y="35" style={{ fontSize: 9, fill: "#94a3b8", letterSpacing: 2 }}>SPEED</Text>
      <Text x="150" y="35" style={{ fontSize: 9, fill: "#94a3b8", letterSpacing: 2 }}>PRECISION</Text>
  </Svg>
);

export const StressPulseVisual = ({ color }: { color: string }) => (
    <Svg width="100%" height="40" viewBox="0 0 200 40">
        {/* Baseline */}
        <Path d="M0,30 L200,30" stroke="#f1f5f9" strokeWidth="2" />
        {/* Pulse Line - Simulating 'Calm then Reactive then Recovery' */}
        <Path d="M0,30 L40,30 L50,10 L60,35 L70,30 L120,30 L130,5 L140,30 L200,30" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
);

export const FocusRingVisual = ({ color }: { color: string }) => (
    <Svg width="100%" height="40" viewBox="0 0 200 40">
        <Line x1="0" y1="20" x2="200" y2="20" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
        {/* Concentric Rings representing 'Deep Work' */}
        <Circle cx="100" cy="20" r="18" fill={color} opacity={0.1} />
        <Circle cx="100" cy="20" r="12" fill={color} opacity={0.3} />
        <Circle cx="100" cy="20" r="6" fill={color} />
    </Svg>
);

export const LogicFlowVisual = ({ color }: { color: string }) => (
    <Svg width="100%" height="40" viewBox="0 0 200 40">
        {/* Simple Node Network */}
        <Line x1="20" y1="20" x2="60" y2="10" stroke={color} strokeWidth="1.5" opacity={0.5} />
        <Line x1="20" y1="20" x2="60" y2="30" stroke={color} strokeWidth="1.5" opacity={0.5} />
        <Line x1="60" y1="10" x2="100" y2="20" stroke={color} strokeWidth="1.5" opacity={0.5} />
        <Line x1="60" y1="30" x2="100" y2="20" stroke={color} strokeWidth="1.5" opacity={0.5} />
        <Line x1="100" y1="20" x2="150" y2="20" stroke={color} strokeWidth="1.5" opacity={0.5} />

        <Circle cx="20" cy="20" r="4" fill={color} />
        <Circle cx="60" cy="10" r="4" fill={color} />
        <Circle cx="60" cy="30" r="4" fill={color} />
        <Circle cx="100" cy="20" r="4" fill={color} />
        <Circle cx="150" cy="20" r="4" fill={color} />
    </Svg>
);

// --- Work Style Analysis Visuals ---

export const ToggleControl = ({ label, active = true }: { label: string; active?: boolean }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ width: 32, height: 18, borderRadius: 9, backgroundColor: active ? modernColors.primary : '#cbd5e1', padding: 2, justifyContent: 'center' }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: 'white', alignSelf: active ? 'flex-end' : 'flex-start' }} />
        </View>
        <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: modernColors.textPrimary, marginLeft: 8 }}>{label}</Text>
    </View>
);

export const NetworkNode = ({ color = modernColors.primary }: { color?: string }) => (
    <Svg width="100%" height="80" viewBox="0 0 200 80">
        <Line x1="100" y1="40" x2="60" y2="20" stroke={color} strokeWidth="2" opacity={0.3} />
        <Line x1="100" y1="40" x2="60" y2="60" stroke={color} strokeWidth="2" opacity={0.3} />
        <Line x1="100" y1="40" x2="140" y2="40" stroke={color} strokeWidth="2" opacity={0.3} />

        <Circle cx="100" cy="40" r="10" fill={color} />
        <Circle cx="60" cy="20" r="6" fill={color} opacity={0.6} />
        <Circle cx="60" cy="60" r="6" fill={color} opacity={0.6} />
        <Circle cx="140" cy="40" r="8" fill={color} opacity={0.8} />
    </Svg>
);

export const SignalBars = ({ strength = 3, color = modernColors.secondary }: { strength?: number; color?: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 20 }}>
        {[1, 2, 3, 4].map((i) => (
            <View key={i} style={{ width: 4, height: i * 5, backgroundColor: i <= strength ? color : '#e2e8f0', borderRadius: 2 }} />
        ))}
    </View>
);

export const PowerGauge = ({ value, label, color = modernColors.accent }: { value: number; label: string; color?: string }) => {
    return (
        <View style={{ alignItems: 'center', width: 90 }}>
             <Svg width="90" height="50" viewBox="0 0 100 55">
                 {/* Background Arc */}
                 <Path d="M 10,50 A 40,40 0 0 1 90,50" stroke="#e2e8f0" strokeWidth="8" fill="none" strokeLinecap="round" />
                 {/* Active Arc */}
                 {/* Active Arc */}
                 <Path 
                    d="M 10,50 A 40,40 0 0 1 90,50" 
                    stroke={color} 
                    strokeWidth="8" 
                    fill="none" 
                    strokeLinecap="round" 
                    style={{ strokeDasharray: "126", strokeDashoffset: 126 - (126 * (value / 100)) } as any} 
                 />
                 
                 <Text x="50" y="45" textAnchor="middle" style={{ fontSize: 16, fontFamily: "Helvetica-Bold", fill: modernColors.dark }}>{value}</Text>
             </Svg>
             <Text style={{ fontSize: 8, color: modernColors.textSecondary, marginTop: 4, textAlign: 'center' }}>{label}</Text>
        </View>
    )
};

export const MatchDial = ({ score, color = modernColors.primary }: { score: number; color?: string }) => {
    const size = 30;
    const strokeWidth = 3;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <Circle cx={size/2} cy={size/2} r={radius} stroke="#e2e8f0" strokeWidth={strokeWidth} fill="none" opacity={0.3} />
                <Circle 
                    cx={size/2} 
                    cy={size/2} 
                    r={radius} 
                    stroke={color} 
                    strokeWidth={strokeWidth} 
                    fill="none" 
                    strokeLinecap="round"
                    transform={`rotate(-90 ${size/2} ${size/2})`}
                    style={{ strokeDasharray: circumference, strokeDashoffset: offset } as any}
                />
            </Svg>
            <Text style={{ position: 'absolute', fontSize: 8, fontFamily: 'Helvetica-Bold', color: modernColors.dark }}>{score}</Text>
        </View>
    );
};


export const TechCard = ({ children, title, style }: { children: React.ReactNode; title?: string, style?: any }) => (
    <View style={{ position: 'relative', padding: 16, backgroundColor: '#f8fafc', borderRadius: 4, borderWidth: 1, borderColor: '#e2e8f0', ...style }}>
        {/* Corner Accents - Cyberpunk Style */}
        <View style={{ position: 'absolute', top: -1, left: -1, width: 8, height: 8, borderTopWidth: 2, borderLeftWidth: 2, borderColor: modernColors.primary }} />
        <View style={{ position: 'absolute', top: -1, right: -1, width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: modernColors.primary }} />
        <View style={{ position: 'absolute', bottom: -1, left: -1, width: 8, height: 8, borderBottomWidth: 2, borderLeftWidth: 2, borderColor: modernColors.primary }} />
        <View style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderBottomWidth: 2, borderRightWidth: 2, borderColor: modernColors.primary }} />
        
        {title && <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: modernColors.textSecondary, textTransform: 'uppercase', marginBottom: 12, letterSpacing: 1 }}>{title}</Text>}
        {children}
    </View>
);

export const BentoCard = ({ 
    children, 
    title, 
    subTitle,
    flex = 1, 
    variant = 'default',
    style 
}: { 
    children: React.ReactNode; 
    title?: string;
    subTitle?: string;
    flex?: number;
    variant?: 'default' | 'highlight' | 'warning' | 'primary';
    style?: any; 
}) => {
    let bg = '#ffffff';
    let border = '#f1f5f9';
    let titleColor = modernColors.textSecondary;

    if (variant === 'highlight') {
        bg = '#f0fdf4';
        border = '#bbf7d0';
        titleColor = '#15803d';
    } else if (variant === 'warning') {
        bg = '#fff1f2';
        border = '#fecdd3';
        titleColor = '#be123c';
    } else if (variant === 'primary') {
        bg = '#f0f9ff';
        border = '#bae6fd';
        titleColor = '#0369a1';
    }

    return (
        <View style={{ flex, padding: 20, backgroundColor: bg, borderRadius: 16, borderWidth: 1, borderColor: border, ...style }}>
            {(title || subTitle) && (
                <View style={{ marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    {title && <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: titleColor, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</Text>}
                    {subTitle && <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: modernColors.primary }}>{subTitle}</Text>}
                </View>
            )}
            {children}
        </View>
    );
};
