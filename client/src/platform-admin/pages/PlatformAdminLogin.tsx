import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Box, Paper, TextField, Button, Typography, Alert, InputAdornment } from '@mui/material';
import { Mail, Lock, ShieldCheck, ChevronRight } from 'lucide-react';
import { usePlatformAdminAuth } from '../auth/PlatformAdminAuthContext';
import { getErrorMessage } from '../../types';

const loginSchema = z.object({
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
});
type LoginForm = z.infer<typeof loginSchema>;

export default function PlatformAdminLogin() {
    const [error, setError] = useState('');
    const { login } = usePlatformAdminAuth();
    const navigate = useNavigate();

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

    const onSubmit = async (values: LoginForm) => {
        setError('');
        try {
            await login(values.email, values.password);
            navigate('/platform-admin/companies');
        } catch (err) {
            setError(getErrorMessage(err, 'Login failed. Please try again.'));
        }
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #1e1b4b 0%, #121a2d 100%)',
                p: 2,
            }}
        >
            <Paper sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 5 }, borderRadius: 5 }}>
                <Box sx={{ textAlign: 'center', mb: 3 }}>
                    <ShieldCheck size={40} style={{ marginBottom: 12 }} />
                    <Typography variant="h5">Platform Administration</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Internal Mywe operations portal
                    </Typography>
                </Box>

                <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    {error && <Alert severity="error">{error}</Alert>}

                    <TextField
                        label="Email Address"
                        type="email"
                        fullWidth
                        autoComplete="email"
                        error={!!errors.email}
                        helperText={errors.email?.message}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><Mail size={18} /></InputAdornment> } }}
                        {...register('email')}
                    />

                    <TextField
                        label="Password"
                        type="password"
                        fullWidth
                        autoComplete="current-password"
                        error={!!errors.password}
                        helperText={errors.password?.message}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><Lock size={18} /></InputAdornment> } }}
                        {...register('password')}
                    />

                    <Button
                        type="submit"
                        variant="contained"
                        size="large"
                        disabled={isSubmitting}
                        endIcon={!isSubmitting && <ChevronRight size={18} />}
                        sx={{ py: 1.25 }}
                    >
                        {isSubmitting ? 'Signing in…' : 'Sign In'}
                    </Button>
                </Box>
            </Paper>
        </Box>
    );
}
