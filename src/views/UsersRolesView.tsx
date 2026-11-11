import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Users, Shield, Plus, Edit3, Trash2, Check, X, KeyRound, UserCheck, Layers, LayoutGrid
} from 'lucide-react';
import { apiFetch } from '../config/api';

const ALL_VISTAS = ['Dashboard', 'Órdenes', 'Seguimiento', 'Chat en Vivo', 'Eficiencia', 'Experiencia (CSAT)', 'Accesos'];
const ALL_SUBVISTAS = [
    { id: 'ejecutiva', label: 'Vista Ejecutiva' },
    { id: 'operativa', label: 'Vista Operativa' },
    { id: 'operaciones', label: 'Operaciones Campo' },
];
const ALL_SERVICIOS = [
    'INSTA - LIMA',
    'INSTA - PROV',
    'AVER - LIMA',
    'AVER - PROV',
    'POSTVENTA',
];

export function UsersRolesView() {
    const queryClient = useQueryClient();
    const [subTab, setSubTab] = useState<'usuarios' | 'roles'>('usuarios');
    const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

    // Estado Modal Usuario
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [uDoc, setUDoc] = useState('');
    const [uNombre, setUNombre] = useState('');
    const [uEmail, setUEmail] = useState('');
    const [uPass, setUPass] = useState('');
    const [uRolId, setURolId] = useState<number>(1);
    const [uActivo, setUActivo] = useState<boolean>(true);

    // Estado Modal Rol
    const [editingRole, setEditingRole] = useState<any | null>(null);
    const [rCodigo, setRCodigo] = useState('');
    const [rNombre, setRNombre] = useState('');
    const [rVistas, setRVistas] = useState<string[]>(['Dashboard', 'Órdenes', 'Seguimiento']);
    const [rSubvistas, setRSubvistas] = useState<string[]>(['ejecutiva', 'operativa', 'operaciones']);
    const [rServicios, setRServicios] = useState<string[]>(['*']);

    const { data: rbacData, isFetching } = useQuery<any>({
        queryKey: ['adminRbac'],
        queryFn: ({ signal }): Promise<any> => (apiFetch as any)('/api/admin/rbac', { signal }),
    });

    const roles: any[] = rbacData?.roles || [];
    const usuarios: any[] = rbacData?.usuarios || [];

    const openNewUser = () => {
        setEditingUser({ id: null });
        setUDoc('');
        setUNombre('');
        setUEmail('');
        setUPass('');
        setURolId(roles[0]?.id || 1);
        setUActivo(true);
    };

    const openEditUser = (u: any) => {
        setEditingUser(u);
        setUDoc(u.documento || '');
        setUNombre(u.nombre || '');
        setUEmail(u.email || '');
        setUPass('');
        setURolId(Number(u.rol_id) || 1);
        setUActivo(Number(u.activo) !== 0);
    };

    const saveUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedback(null);
        try {
            await apiFetch('/api/admin/users', {
                method: 'POST',
                body: JSON.stringify({
                    id: editingUser?.id || null,
                    documento: uDoc,
                    nombre: uNombre,
                    email: uEmail,
                    password: uPass,
                    rol_id: uRolId,
                    activo: uActivo,
                }),
            });
            setEditingUser(null);
            setFeedback({ type: 'ok', text: 'Usuario guardado correctamente.' });
            queryClient.invalidateQueries({ queryKey: ['adminRbac'] });
        } catch (err: any) {
            setFeedback({ type: 'err', text: err.message });
        }
    };

    const deleteUser = async (id: number) => {
        if (!window.confirm('¿Eliminar este usuario permanentemente?')) return;
        try {
            await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
            queryClient.invalidateQueries({ queryKey: ['adminRbac'] });
        } catch (err: any) {
            setFeedback({ type: 'err', text: err.message });
        }
    };

    const openNewRole = () => {
        setEditingRole({ id: null });
        setRCodigo('');
        setRNombre('');
        setRVistas(['Dashboard', 'Órdenes', 'Seguimiento']);
        setRSubvistas(['ejecutiva', 'operativa', 'operaciones']);
        setRServicios(['INSTA - LIMA']);
    };

    const openEditRole = (r: any) => {
        setEditingRole(r);
        setRCodigo(r.codigo);
        setRNombre(r.nombre);
        setRVistas(r.vistas.includes('*') ? [...ALL_VISTAS] : r.vistas);
        setRSubvistas(r.subvistas.includes('*') ? ALL_SUBVISTAS.map((s) => s.id) : r.subvistas);
        setRServicios(r.servicios.includes('*') ? [...ALL_SERVICIOS] : r.servicios);
    };

    const toggleItem = (list: string[], setList: (v: string[]) => void, val: string) => {
        setList(list.includes(val) ? list.filter((x) => x !== val) : [...list, val]);
    };

    const saveRole = async (e: React.FormEvent) => {
        e.preventDefault();
        setFeedback(null);
        try {
            const vistasPayload = rVistas.length === ALL_VISTAS.length ? ['*'] : rVistas;
            const subvistasPayload = rSubvistas.length === ALL_SUBVISTAS.length ? ['*'] : rSubvistas;
            const serviciosPayload = rServicios.length === ALL_SERVICIOS.length ? ['*'] : rServicios;

            await apiFetch('/api/admin/roles', {
                method: 'POST',
                body: JSON.stringify({
                    id: editingRole?.id || null,
                    codigo: rCodigo,
                    nombre: rNombre,
                    vistas: vistasPayload,
                    subvistas: subvistasPayload,
                    servicios: serviciosPayload,
                }),
            });
            setEditingRole(null);
            setFeedback({ type: 'ok', text: 'Rol y permisos actualizados.' });
            queryClient.invalidateQueries({ queryKey: ['adminRbac'] });
        } catch (err: any) {
            setFeedback({ type: 'err', text: err.message });
        }
    };

    return (
        <div className="space-y-5">
            {/* Cabecera y Selector de Pestaña */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                    <button
                        type="button"
                        onClick={() => setSubTab('usuarios')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${subTab === 'usuarios'
                                ? 'bg-white text-[#FF5500] shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                    >
                        <Users size={14} />
                        <span>Usuarios ({usuarios.length})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setSubTab('roles')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${subTab === 'roles'
                                ? 'bg-white text-[#FF5500] shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                    >
                        <Shield size={14} />
                        <span>Roles y Permisos ({roles.length})</span>
                    </button>
                </div>

                <button
                    type="button"
                    onClick={subTab === 'usuarios' ? openNewUser : openNewRole}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF5500] hover:bg-[#E04B00] text-white font-bold text-xs shadow-sm transition cursor-pointer"
                >
                    <Plus size={15} />
                    <span>{subTab === 'usuarios' ? 'Nuevo Usuario' : 'Nuevo Rol'}</span>
                </button>
            </div>

            {feedback && (
                <div
                    className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between border ${feedback.type === 'ok'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-rose-50 border-rose-200 text-rose-800'
                        }`}
                >
                    <span>{feedback.text}</span>
                    <button onClick={() => setFeedback(null)} className="opacity-60 hover:opacity-100">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* TAB 1: LISTADO DE USUARIOS */}
            {subTab === 'usuarios' && (
                <div className="bg-white border border-slate-100 rounded-2xl shadow-xs overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                                    <th className="py-3 px-4 text-left">Documento</th>
                                    <th className="py-3 px-4 text-left">Nombre</th>
                                    <th className="py-3 px-4 text-left">Correo</th>
                                    <th className="py-3 px-4 text-left">Rol Asignado</th>
                                    <th className="py-3 px-4 text-center">Estado</th>
                                    <th className="py-3 px-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {usuarios.map((u) => (
                                    <tr key={u.id} className="hover:bg-slate-50/70 transition">
                                        <td className="py-3 px-4 font-extrabold text-slate-900 font-mono">{u.documento}</td>
                                        <td className="py-3 px-4 font-bold text-slate-800">{u.nombre}</td>
                                        <td className="py-3 px-4 text-slate-500">{u.email || '-'}</td>
                                        <td className="py-3 px-4">
                                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FFF0E5] text-[#FF5500] border border-orange-200 font-bold text-[10.5px]">
                                                <Shield size={11} />
                                                <span>{u.rol_nombre || u.rol_codigo || 'ADMIN'}</span>
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span
                                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${Number(u.activo) !== 0
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : 'bg-slate-100 text-slate-500'
                                                    }`}
                                            >
                                                {Number(u.activo) !== 0 ? 'ACTIVO' : 'INACTIVO'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right space-x-1.5">
                                            <button
                                                type="button"
                                                onClick={() => openEditUser(u)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition"
                                            >
                                                <Edit3 size={12} /> Editar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteUser(u.id)}
                                                className="inline-flex items-center p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition"
                                                title="Eliminar usuario"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {!isFetching && usuarios.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-slate-400">
                                            No hay usuarios registrados.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 2: ROLES Y MATRIZ DE PERMISOS */}
            {subTab === 'roles' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {roles.map((r) => (
                        <div
                            key={r.id}
                            className="bg-white border border-slate-100 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4"
                        >
                            <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                                <div>
                                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                        {r.codigo}
                                    </span>
                                    <h4 className="font-extrabold text-sm text-slate-900 mt-1">{r.nombre}</h4>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => openEditRole(r)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#FFF0E5] hover:bg-orange-100 text-[#FF5500] font-bold text-xs transition"
                                >
                                    <Edit3 size={12} /> Configurar
                                </button>
                            </div>

                            <div className="space-y-2.5 text-xs">
                                <div>
                                    <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                                        Servicios Permitidos
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(r.servicios.includes('*') ? ['TODOS LOS SERVICIOS (5)'] : r.servicios).map(
                                            (s: string) => (
                                                <span
                                                    key={s}
                                                    className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[10.5px]"
                                                >
                                                    {s}
                                                </span>
                                            )
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                                        Vistas de Menú
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(r.vistas.includes('*') ? ALL_VISTAS : r.vistas).map((v: string) => (
                                            <span
                                                key={v}
                                                className="px-2 py-0.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-200 font-semibold text-[10.5px]"
                                            >
                                                {v}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* MODAL CREAR / EDITAR USUARIO */}
            {editingUser && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
                    <form
                        onSubmit={saveUser}
                        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4"
                    >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                                <UserCheck size={16} className="text-[#FF5500]" />
                                <span>{editingUser.id ? 'Editar Usuario' : 'Nuevo Usuario'}</span>
                            </h3>
                            <button type="button" onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-700">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <label className="font-bold text-slate-700 block mb-1">Documento (DNI/CE)</label>
                                <input
                                    type="text"
                                    required
                                    value={uDoc}
                                    onChange={(e) => setUDoc(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-semibold"
                                />
                            </div>
                            <div>
                                <label className="font-bold text-slate-700 block mb-1">Rol Operativo</label>
                                <select
                                    value={uRolId}
                                    onChange={(e) => setURolId(Number(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-800"
                                >
                                    {roles.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.nombre}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="text-xs">
                            <label className="font-bold text-slate-700 block mb-1">Nombre Completo</label>
                            <input
                                type="text"
                                required
                                value={uNombre}
                                onChange={(e) => setUNombre(e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-semibold"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <label className="font-bold text-slate-700 block mb-1">Correo Corporativo</label>
                                <input
                                    type="email"
                                    value={uEmail}
                                    onChange={(e) => setUEmail(e.target.value)}
                                    placeholder="usuario@win.pe"
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50"
                                />
                            </div>
                            <div>
                                <label className="font-bold text-slate-700 block mb-1">
                                    {editingUser.id ? 'Nueva Clave (opcional)' : 'Contraseña'}
                                </label>
                                <div className="relative">
                                    <KeyRound size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        required={!editingUser.id}
                                        value={uPass}
                                        onChange={(e) => setUPass(e.target.value)}
                                        placeholder={editingUser.id ? 'Sin cambios' : 'Clave de acceso'}
                                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-semibold"
                                    />
                                </div>
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer pt-1">
                            <input
                                type="checkbox"
                                checked={uActivo}
                                onChange={(e) => setUActivo(e.target.checked)}
                                className="rounded text-[#FF5500]"
                            />
                            <span>Usuario activo (puede iniciar sesión)</span>
                        </label>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
                            <button
                                type="button"
                                onClick={() => setEditingUser(null)}
                                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 rounded-xl bg-[#FF5500] text-white font-bold shadow-sm"
                            >
                                Guardar Usuario
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* MODAL CREAR / CONFIGURAR ROL */}
            {editingRole && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
                    <form
                        onSubmit={saveRole}
                        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
                    >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                                <Shield size={16} className="text-[#FF5500]" />
                                <span>{editingRole.id ? 'Configurar Permisos del Rol' : 'Crear Nuevo Rol'}</span>
                            </h3>
                            <button type="button" onClick={() => setEditingRole(null)} className="text-slate-400 hover:text-slate-700">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                                <label className="font-bold text-slate-700 block mb-1">Código Único</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: SUP_INSTA_LIMA"
                                    value={rCodigo}
                                    onChange={(e) => setRCodigo(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono font-bold uppercase"
                                />
                            </div>
                            <div>
                                <label className="font-bold text-slate-700 block mb-1">Nombre Descriptivo</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Supervisor Instalaciones"
                                    value={rNombre}
                                    onChange={(e) => setRNombre(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-semibold"
                                />
                            </div>
                        </div>

                        {/* Checkboxes de Servicios Permitidos */}
                        <div className="space-y-2">
                            <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                                <Layers size={14} className="text-[#FF5500]" />
                                <span>Servicios que este Rol puede visualizar</span>
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {ALL_SERVICIOS.map((srv) => {
                                    const active = rServicios.includes(srv);
                                    return (
                                        <button
                                            key={srv}
                                            type="button"
                                            onClick={() => toggleItem(rServicios, setRServicios, srv)}
                                            className={`px-3 py-2 rounded-xl border text-left text-[11px] font-bold flex items-center justify-between transition ${active
                                                    ? 'bg-[#FFF0E5] border-[#FF5500] text-[#FF5500]'
                                                    : 'bg-slate-50 border-slate-200 text-slate-600'
                                                }`}
                                        >
                                            <span className="truncate">{srv}</span>
                                            {active && <Check size={13} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Checkboxes de Vistas del Sidebar */}
                        <div className="space-y-2">
                            <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                                <LayoutGrid size={14} className="text-[#FF5500]" />
                                <span>Vistas del Menú Lateral permitidas</span>
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {ALL_VISTAS.map((v) => {
                                    const active = rVistas.includes(v);
                                    return (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() => toggleItem(rVistas, setRVistas, v)}
                                            className={`px-3 py-2 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition ${active
                                                    ? 'bg-sky-50 border-sky-400 text-sky-800'
                                                    : 'bg-slate-50 border-slate-200 text-slate-600'
                                                }`}
                                        >
                                            <span>{v}</span>
                                            {active && <Check size={13} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Checkboxes de Sub-pestañas del Dashboard */}
                        <div className="space-y-2">
                            <label className="text-xs font-extrabold text-slate-800 block">
                                Pestañas internas del Dashboard
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {ALL_SUBVISTAS.map((sv) => {
                                    const active = rSubvistas.includes(sv.id);
                                    return (
                                        <button
                                            key={sv.id}
                                            type="button"
                                            onClick={() => toggleItem(rSubvistas, setRSubvistas, sv.id)}
                                            className={`px-2.5 py-2 rounded-xl border text-center text-[11px] font-bold transition ${active
                                                    ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                                                    : 'bg-slate-50 border-slate-200 text-slate-600'
                                                }`}
                                        >
                                            {sv.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
                            <button
                                type="button"
                                onClick={() => setEditingRole(null)}
                                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 rounded-xl bg-[#FF5500] text-white font-bold shadow-sm"
                            >
                                Guardar Permisos
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}