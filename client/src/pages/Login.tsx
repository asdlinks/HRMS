import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Paper,
    TextField,
    Button,
    Typography,
    Alert,
    Link,
    Collapse,
    InputAdornment,
} from '@mui/material';
import { Mail, Lock, Building2, ChevronRight } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getErrorMessage } from '../types';

const loginSchema = z.object({
    tenantCode: z.string().min(1, 'Company code is required'),
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
});
type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
    const [error, setError] = useState('');
    const [showForgotInfo, setShowForgotInfo] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

    const onSubmit = async (values: LoginForm) => {
        setError('');
        try {
            const data = await login(values.tenantCode.trim(), values.email, values.password);
            // Guards against IIS capturing a 401 and returning index.html as a 200 OK string.
            if (!data?.user?.id) {
                throw new Error('Invalid credentials. Please verify your company code, email and password.');
            }
            navigate('/dashboard');
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
            <Paper sx={{ width: '100%', maxWidth: 440, p: { xs: 3, sm: 5 }, borderRadius: 5 }}>
                <Box sx={{ textAlign: 'center', mb: 3 }}>
                    <Box component="img" src="logo.webp" alt="Company Logo" sx={{ height: 64, mb: 2, objectFit: 'contain' }} />
                    <Typography variant="h5">Welcome Back</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Sign in to manage your workspace
                    </Typography>
                </Box>

                <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    {error && <Alert severity="error">{error}</Alert>}

                    <TextField
                        label="Company Code"
                        placeholder="e.g. mywe"
                        fullWidth
                        autoComplete="organization"
                        error={!!errors.tenantCode}
                        helperText={errors.tenantCode?.message}
                        slotProps={{ input: { startAdornment: <InputAdornment position="start"><Building2 size={18} /></InputAdornment> } }}
                        {...register('tenantCode')}
                    />

                    <TextField
                        label="Email Address"
                        type="email"
                        placeholder="name@company.com"
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
                        placeholder="••••••••"
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

                    <Link component="button" type="button" underline="hover" onClick={() => setShowForgotInfo((v) => !v)} sx={{ mx: 'auto', fontSize: '0.85rem' }}>
                        Forgot your password?
                    </Link>
                    <Collapse in={showForgotInfo}>
                        <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
                            Password resets aren't self-service. Contact your HR administrator or
                            business owner and ask them to reset it for you from the Employees page.
                        </Alert>
                    </Collapse>
                </Box>

                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 3 }}>
                    Don't have an account? Contact HR
                </Typography>
            </Paper>
        </Box>
    );
}
