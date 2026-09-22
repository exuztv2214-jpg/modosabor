import { useState } from 'react';
import toast from 'react-hot-toast';
import { Check, MapPin, Pencil, Plus, Star, Trash2, X } from 'lucide-react';

import api from '../../lib/api.js';
import { BRAND, STROKE } from '../../lib/theme.js';
import { Card, Empty } from './clientesUi.jsx';

const EMPTY_FORM = { etiqueta: '', direccion: '', referencia: '', principal: false };

export default function DireccionesPanel({ clienteId, direcciones = [], onChanged }) {
  const lista = Array.isArray(direcciones) ? direcciones : [];
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const closeForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };
  const openNew = () => {
    setEditingId('new');
    setForm({
      ...EMPTY_FORM,
      etiqueta: lista.length ? `Dirección ${lista.length + 1}` : 'Principal',
    });
  };
  const openEdit = (direccion) => {
    setEditingId(direccion.id);
    setForm({
      etiqueta: direccion.etiqueta || '',
      direccion: direccion.direccion || '',
      referencia: direccion.referencia || '',
      principal: Boolean(direccion.principal),
    });
  };
  const refresh = async () => {
    await onChanged?.();
    closeForm();
  };
  const save = async () => {
    if (!form.direccion.trim()) return toast.error('La dirección es obligatoria');
    setSaving(true);
    try {
      if (editingId === 'new') {
        await api.post(`/clientes/${clienteId}/direcciones`, form);
        toast.success('Dirección agregada');
      } else {
        await api.put(`/clientes/${clienteId}/direcciones/${editingId}`, form);
        toast.success('Dirección actualizada');
      }
      await refresh();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar la dirección');
    } finally {
      setSaving(false);
    }
  };
  const setPrincipal = async (direccion) => {
    try {
      await api.put(`/clientes/${clienteId}/direcciones/${direccion.id}`, {
        ...direccion,
        principal: true,
      });
      toast.success('Dirección principal actualizada');
      await onChanged?.();
    } catch (error) {
      toast.error(error?.error || 'No se pudo cambiar la dirección principal');
    }
  };
  const remove = async (direccion) => {
    if (!window.confirm(`¿Eliminar la dirección "${direccion.direccion}"?`)) return;
    try {
      await api.delete(`/clientes/${clienteId}/direcciones/${direccion.id}`);
      toast.success('Dirección eliminada');
      await onChanged?.();
    } catch (error) {
      toast.error(error?.error || 'No se pudo eliminar la dirección');
    }
  };

  return (
    <Card
      title="Direcciones"
      helper={
        lista.length
          ? `${lista.length} ${lista.length === 1 ? 'dirección guardada' : 'direcciones guardadas'}`
          : undefined
      }
    >
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={editingId === 'new' ? closeForm : openNew}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white"
          style={{ background: BRAND }}
        >
          {editingId === 'new' ? <X size={13} /> : <Plus size={13} />}
          {editingId === 'new' ? 'Cancelar' : 'Agregar dirección'}
        </button>
      </div>

      {editingId === 'new' ? (
        <AddressForm form={form} setForm={setForm} saving={saving} onSave={save} />
      ) : null}

      {lista.length ? (
        <div className="space-y-1.5">
          {lista.map((direccion) => (
            <div key={direccion.id} className="rounded-xl bg-gray-50 px-3 py-2.5">
              {editingId === direccion.id ? (
                <AddressForm
                  form={form}
                  setForm={setForm}
                  saving={saving}
                  onSave={save}
                  onCancel={closeForm}
                />
              ) : (
                <div className="flex items-start gap-2">
                  <MapPin
                    size={13}
                    strokeWidth={STROKE}
                    className="mt-0.5 shrink-0 text-gray-400"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-medium text-gray-900">
                        {direccion.direccion}
                      </p>
                      {direccion.principal ? (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                          style={{ background: BRAND }}
                        >
                          Principal
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-gray-400">
                      {direccion.etiqueta || 'Sin etiqueta'}
                      {direccion.referencia ? ` · ${direccion.referencia}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!direccion.principal ? (
                      <button
                        type="button"
                        onClick={() => setPrincipal(direccion)}
                        title="Marcar como principal"
                        className="rounded-md p-1.5 text-gray-400 hover:bg-white hover:text-amber-500"
                      >
                        <Star size={13} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openEdit(direccion)}
                      title="Editar dirección"
                      className="rounded-md p-1.5 text-gray-400 hover:bg-white hover:text-gray-700"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(direccion)}
                      title="Eliminar dirección"
                      className="rounded-md p-1.5 text-gray-400 hover:bg-white hover:text-rose-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : editingId !== 'new' ? (
        <Empty
          title="Sin direcciones guardadas"
          description="Agregá una ahora o se guardará sola al confirmar un delivery."
        />
      ) : null}
    </Card>
  );
}

function AddressForm({ form, setForm, saving, onSave, onCancel }) {
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  return (
    <div className="mb-2 space-y-2 rounded-xl border border-gray-200 bg-white p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={form.etiqueta}
          onChange={(event) => update('etiqueta', event.target.value)}
          placeholder="Etiqueta: Casa, Trabajo..."
          className="h-9 rounded-lg border border-gray-200 px-3 text-[12px] outline-none focus:border-rose-400"
        />
        <input
          value={form.direccion}
          onChange={(event) => update('direccion', event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSave();
          }}
          placeholder="Dirección completa"
          className="h-9 rounded-lg border border-gray-200 px-3 text-[12px] outline-none focus:border-rose-400"
        />
      </div>
      <input
        value={form.referencia}
        onChange={(event) => update('referencia', event.target.value)}
        placeholder="Referencia, piso, timbre..."
        className="h-9 w-full rounded-lg border border-gray-200 px-3 text-[12px] outline-none focus:border-rose-400"
      />
      <label className="flex items-center gap-2 text-[12px] text-gray-600">
        <input
          type="checkbox"
          checked={form.principal}
          onChange={(event) => update('principal', event.target.checked)}
        />
        Usar como dirección principal
      </label>
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-[12px] text-gray-500"
          >
            Cancelar
          </button>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
          style={{ background: BRAND }}
        >
          <Check size={13} /> {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}
