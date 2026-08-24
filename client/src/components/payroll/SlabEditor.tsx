import { Box, Stack, TextField, FormControl, InputLabel, Select, MenuItem, IconButton, Button, Typography } from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';

export interface Slab { min: number; max: number | null; amount: number; rate: number }
export interface SlabConfig { base: string; bracket_type: 'flat' | 'progressive'; slabs: Slab[] }

interface ComponentOption { id: number; code: string; name: string }

interface SlabEditorProps {
    value: SlabConfig;
    onChange: (config: SlabConfig) => void;
    components: ComponentOption[];
}

const emptySlab: Slab = { min: 0, max: null, amount: 0, rate: 0 };

// Editor for the JSON `config` blob on a slab-type salary component — a
// small ordered bracket table, always edited as one atomic unit (matches
// how the calculation engine reads it: server/services/payrollCalculation.service.js::evaluateSlab).
export default function SlabEditor({ value, onChange, components }: SlabEditorProps) {
    const slabs = value.slabs || [];

    const updateSlab = (index: number, patch: Partial<Slab>) => {
        const next = slabs.map((s, i) => (i === index ? { ...s, ...patch } : s));
        onChange({ ...value, slabs: next });
    };
    const addSlab = () => onChange({ ...value, slabs: [...slabs, { ...emptySlab, min: slabs.length ? (slabs[slabs.length - 1].max ?? 0) + 1 : 0 }] });
    const removeSlab = (index: number) => onChange({ ...value, slabs: slabs.filter((_, i) => i !== index) });

    return (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                <FormControl fullWidth size="small">
                    <InputLabel>Base</InputLabel>
                    <Select label="Base" value={value.base} onChange={(e) => onChange({ ...value, base: e.target.value })}>
                        <MenuItem value="gross">Gross earnings</MenuItem>
                        <MenuItem value="ctc">Monthly CTC</MenuItem>
                        {components.map((c) => (
                            <MenuItem key={c.id} value={`component:${c.id}`}>{c.name} ({c.code})</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <FormControl fullWidth size="small">
                    <InputLabel>Bracket type</InputLabel>
                    <Select label="Bracket type" value={value.bracket_type} onChange={(e) => onChange({ ...value, bracket_type: e.target.value as 'flat' | 'progressive' })}>
                        <MenuItem value="flat">Flat amount per bracket</MenuItem>
                        <MenuItem value="progressive">Progressive rate per bracket</MenuItem>
                    </Select>
                </FormControl>
            </Stack>

            <Stack spacing={1.5}>
                {slabs.map((slab, index) => (
                    <Stack key={index} direction="row" spacing={1} alignItems="center">
                        <TextField size="small" label="Min" type="number" value={slab.min} onChange={(e) => updateSlab(index, { min: Number(e.target.value) })} sx={{ width: 110 }} />
                        <TextField
                            size="small" label="Max (blank = ∞)" type="number" value={slab.max ?? ''}
                            onChange={(e) => updateSlab(index, { max: e.target.value === '' ? null : Number(e.target.value) })}
                            sx={{ width: 140 }}
                        />
                        {value.bracket_type === 'flat' ? (
                            <TextField size="small" label="Amount" type="number" value={slab.amount} onChange={(e) => updateSlab(index, { amount: Number(e.target.value) })} sx={{ width: 120 }} />
                        ) : (
                            <TextField size="small" label="Rate %" type="number" value={slab.rate} onChange={(e) => updateSlab(index, { rate: Number(e.target.value) })} sx={{ width: 120 }} />
                        )}
                        <IconButton size="small" onClick={() => removeSlab(index)}><Trash2 size={16} /></IconButton>
                    </Stack>
                ))}
            </Stack>

            {slabs.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>No brackets yet.</Typography>}

            <Button size="small" startIcon={<Plus size={14} />} onClick={addSlab} sx={{ mt: 1.5 }}>Add bracket</Button>
        </Box>
    );
}
