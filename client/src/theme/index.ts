import { createTheme, type ThemeOptions, type PaletteMode } from '@mui/material/styles';
import { brand, neutral, semantic, radius } from './palette';

// Augment MUI's Typography variants with a small-caps "eyebrow" label used
// above section/card titles (PageHeader, dashboard widgets) — a cheap,
// consistent signal of a premium/product-designed screen.
declare module '@mui/material/styles' {
    interface TypographyVariants {
        kicker: React.CSSProperties;
    }
    interface TypographyVariantsOptions {
        kicker?: React.CSSProperties;
    }
}
declare module '@mui/material/Typography' {
    interface TypographyPropsVariantOverrides {
        kicker: true;
    }
}

const typography: ThemeOptions['typography'] = {
    fontFamily: "'Inter', sans-serif",
    h1: { fontFamily: "'Outfit', sans-serif", fontWeight: 800 },
    h2: { fontFamily: "'Outfit', sans-serif", fontWeight: 700 },
    h3: { fontFamily: "'Outfit', sans-serif", fontWeight: 700 },
    h4: { fontFamily: "'Outfit', sans-serif", fontWeight: 700 },
    h5: { fontFamily: "'Outfit', sans-serif", fontWeight: 700 },
    h6: { fontFamily: "'Outfit', sans-serif", fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
    kicker: {
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
    },
};

const shape = { borderRadius: radius.md };

export interface BrandOverrides {
    primaryColor?: string | null;
    secondaryColor?: string | null;
}

function buildPalette(mode: PaletteMode, overrides?: BrandOverrides) {
    const isLight = mode === 'light';
    return {
        mode,
        primary: overrides?.primaryColor
            ? { main: overrides.primaryColor, contrastText: '#fff' }
            : { main: brand.indigo600, light: brand.indigo400, dark: brand.indigo700, contrastText: '#fff' },
        secondary: { main: overrides?.secondaryColor || brand.indigo500 },
        success: { main: semantic.success },
        warning: { main: semantic.warning },
        error: { main: semantic.error },
        info: { main: semantic.info },
        background: {
            default: isLight ? neutral[50] : neutral[950],
            paper: isLight ? neutral[0] : neutral[900],
        },
        text: {
            primary: isLight ? neutral[800] : neutral[100],
            secondary: isLight ? neutral[500] : neutral[400],
        },
        divider: isLight ? neutral[200] : neutral[700],
    };
}

// `overrides` lets a tenant's Company Profile branding colors (Phase 7)
// replace the default indigo palette at theme-build time; omitted/unset
// falls back to exactly today's palette, so an unconfigured tenant's UI is
// unchanged.
export function buildTheme(mode: PaletteMode, overrides?: BrandOverrides) {
    const isLight = mode === 'light';
    return createTheme({
        palette: buildPalette(mode, overrides),
        typography,
        shape,
        spacing: 8,
        components: {
            MuiCssBaseline: {
                styleOverrides: {
                    body: {
                        scrollbarColor: `${neutral[300]} transparent`,
                    },
                    '*::-webkit-scrollbar': { width: 6, height: 6 },
                    '*::-webkit-scrollbar-thumb': { background: neutral[300], borderRadius: 10 },
                },
            },
            MuiPaper: {
                styleOverrides: {
                    root: { backgroundImage: 'none' },
                },
                defaultProps: { elevation: 0 },
            },
            MuiCard: {
                styleOverrides: {
                    root: {
                        border: `1px solid ${isLight ? neutral[200] : neutral[700]}`,
                        borderRadius: radius.lg,
                        boxShadow: isLight
                            ? '0 1px 2px 0 rgba(15,23,42,0.04)'
                            : '0 1px 2px 0 rgba(0,0,0,0.3)',
                    },
                },
            },
            MuiButton: {
                styleOverrides: {
                    root: { borderRadius: radius.sm, paddingInline: 18 },
                },
            },
            MuiChip: {
                styleOverrides: { root: { fontWeight: 600 } },
            },
            MuiTextField: {
                defaultProps: { size: 'small' },
            },
            MuiAppBar: {
                styleOverrides: { root: { boxShadow: 'none' } },
            },
        },
    });
}
