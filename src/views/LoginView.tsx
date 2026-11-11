import React, { useState } from 'react';
import {
    Lock, User, Eye, EyeOff, ArrowRight, AlertCircle, Info, Activity, ShieldCheck, MapPin
} from 'lucide-react';
import { apiFetch, AUTH_TOKEN_KEY, AUTH_USER_KEY } from '../config/api';
import { AuthUser } from '../types/dashboard';

interface LoginViewProps {
    onLoginSuccess: (user: AuthUser) => void;
}

export function LoginView({ onLoginSuccess }: LoginViewProps) {
    const [documento, setDocumento] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ssoAlert, setSsoAlert] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSsoAlert(null);

        if (!documento.trim() || !password.trim()) {
            setError('Ingresa tu documento y contraseña.');
            return;
        }

        setLoading(true);
        try {
            const res = await apiFetch<{ ok: boolean; token: string; user: AuthUser; error?: string }>(
                '/api/auth/login',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        documento: documento.trim(),
                        password: password.trim(),
                    }),
                }
            );

            if (res.ok && res.token && res.user) {
                localStorage.setItem(AUTH_TOKEN_KEY, res.token);
                localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
                onLoginSuccess(res.user);
            } else {
                setError(res.error || 'Acceso denegado.');
            }
        } catch (err: any) {
            setError(err.message || 'Credenciales inválidas.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-12 bg-white font-sans select-none">
            {/* PANEL IZQUIERDO: IDENTIDAD VISUAL & TELEMETRÍA */}
            <div className="hidden lg:flex lg:col-span-7 bg-[#090D16] relative overflow-hidden flex-col justify-between p-12 text-white">
                {/* Malla y luces ambientales */}
                <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-60 pointer-events-none" />
                <div className="absolute -top-40 -left-40 w-[520px] h-[520px] bg-[#FF5500]/20 rounded-full blur-[130px] pointer-events-none" />
                <div className="absolute bottom-0 right-0 w-[420px] h-[420px] bg-orange-600/10 rounded-full blur-[110px] pointer-events-none" />

                {/* Logo Superior */}
                <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-[#FF5500] flex items-center justify-center font-black text-white text-2xl shadow-lg shadow-[#FF5500]/30">
                            W
                        </div>
                        <div>
                            <span className="font-extrabold text-lg tracking-tight text-white block leading-none">
                                Control WIN
                            </span>
                            <span className="text-[11px] font-bold text-[#FF5500] tracking-widest uppercase mt-1 block">
                                en RUTA
                            </span>
                        </div>
                    </div>

                    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-slate-300 backdrop-blur-md">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Sistema Operativo
                    </span>
                </div>

                {/* Bloque Central */}
                <div className="relative z-10 max-w-xl space-y-6 my-auto">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF5500]/15 border border-[#FF5500]/30 text-[#FF5500] text-xs font-bold">
                        <Activity size={13} />
                        <span>Monitoreo en Tiempo Real</span>
                    </div>

                    <h1 className="text-4xl xl:text-5xl font-black tracking-tight leading-[1.12]">
                         Gestión y Trazabilidad
                         <span className="block bg-gradient-to-r from-[#FF5500] to-amber-400 bg-clip-text text-transparent">
                          WIN en Ruta
                        </span>
                     </h1>

                    {/* Tarjetas flotantes de telemetría */}
                    <div className="grid grid-cols-3 gap-3.5 pt-4">
                        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                            <MapPin size={18} className="text-[#FF5500] mb-2" />
                            <div className="text-xl font-extrabold text-white tabular-nums">Lima & Prov</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">Cobertura nacional</div>
                        </div>

                        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                            <Activity size={18} className="text-emerald-400 mb-2" />
                            <div className="text-xl font-extrabold text-white tabular-nums">Mantra Live</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">Sincronización SOS</div>
                        </div>

                        <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                            <ShieldCheck size={18} className="text-sky-400 mb-2" />
                            <div className="text-xl font-extrabold text-white tabular-nums">Acceso RBAC</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">Control por perfil</div>
                        </div>
                    </div>
                </div>

                {/* Pie Izquierdo */}
                <div className="relative z-10 flex items-center justify-between text-xs text-slate-500 border-t border-white/10 pt-6">
                    <span>WIN Telecomunicaciones</span>
                    <span>v2.4 • Producción</span>
                </div>
            </div>

            {/* PANEL DERECHO: FORMULARIO DE ACCESO */}
            <div className="lg:col-span-5 flex flex-col justify-center items-center p-6 sm:p-12 bg-white relative">
                <div className="w-full max-w-[360px] space-y-7">
                    {/* Logo visible solo en móvil */}
                    <div className="flex lg:hidden items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-[#FF5500] flex items-center justify-center font-black text-white text-xl shadow-md shadow-[#FF5500]/25">
                            W
                        </div>
                        <div>
                            <span className="font-extrabold text-base text-slate-900 block leading-none">
                                Control WIN
                            </span>
                            <span className="text-[10px] font-bold text-[#FF5500] uppercase tracking-wider">
                                en RUTA
                            </span>
                        </div>
                    </div>

                    {/* Cabecera limpia */}
                    <div>
                        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            Iniciar sesión
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">
                            Ingresa tus credenciales operativas
                        </p>
                    </div>

                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2">
                            <AlertCircle size={15} className="text-rose-600 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {ssoAlert && (
                        <div className="bg-slate-900 text-white px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2.5 shadow-sm">
                            <Info size={15} className="text-[#FF5500] shrink-0" />
                            <span>{ssoAlert}</span>
                        </div>
                    )}

                    {/* Formulario Principal */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700">
                                Documento
                            </label>
                            <div className="relative">
                                <User
                                    size={16}
                                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                                />
                                <input
                                    type="text"
                                    autoFocus
                                    placeholder="DNI / CE"
                                    value={documento}
                                    onChange={(e) => setDocumento(e.target.value)}
                                    className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#FF5500] focus:ring-4 focus:ring-[#FF5500]/10 transition"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700">
                                Contraseña
                            </label>
                            <div className="relative">
                                <Lock
                                    size={16}
                                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                                />
                                <input
                                    type={showPass ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full h-11 pl-10 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:bg-white focus:border-[#FF5500] focus:ring-4 focus:ring-[#FF5500]/10 transition"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass(!showPass)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 transition"
                                    tabIndex={-1}
                                >
                                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-11 rounded-xl bg-[#FF5500] hover:bg-[#E04B00] active:scale-[0.99] disabled:opacity-60 text-white font-bold text-xs tracking-wide shadow-lg shadow-[#FF5500]/25 flex items-center justify-center gap-2 transition cursor-pointer mt-2"
                        >
                            <span>{loading ? 'Verificando...' : 'Continuar'}</span>
                            {!loading && <ArrowRight size={15} />}
                        </button>
                    </form>

                    {/* Divisor minimalista */}
                    <div className="relative flex items-center">
                        <div className="flex-grow border-t border-slate-200" />
                        <span className="flex-shrink mx-3 text-[11px] font-semibold text-slate-400">
                            SSO Corporativo
                        </span>
                        <div className="flex-grow border-t border-slate-200" />
                    </div>

                    {/* Botones Visuales SSO */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setSsoAlert('Acceso Google pendiente de activación.')}
                            className="h-10 flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 font-semibold text-xs transition cursor-pointer"
                        >
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                                <path
                                    fill="#EA4335"
                                    d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                                />
                                <path
                                    fill="#4285F4"
                                    d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                                />
                                <path
                                    fill="#FBBC05"
                                    d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"
                                />
                                <path
                                    fill="#34A853"
                                    d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.9C3.5 21.4 7.4 24 12 24z"
                                />
                            </svg>
                            <span>Google</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setSsoAlert('Acceso Microsoft pendiente de activación.')}
                            className="h-10 flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-700 font-semibold text-xs transition cursor-pointer"
                        >
                            <svg className="w-4 h-4 shrink-0" viewBox="0 0 23 23">
                                <path fill="#f35325" d="M1 1h10v10H1z" />
                                <path fill="#81bc06" d="M12 1h10v10H12z" />
                                <path fill="#05a6f0" d="M1 12h10v10H1z" />
                                <path fill="#ffba08" d="M12 12h10v10H12z" />
                            </svg>
                            <span>Microsoft</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}