import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, clearSession, loadSession, saveSession } from './lib/api.js';

const money = (value) =>
  Number(value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

function uuid() {
  return (
    globalThis.crypto?.randomUUID?.() || `mozo_${Date.now()}_${Math.random().toString(36).slice(2)}`
  );
}

function parseOptions(value) {
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value || '[]');
  } catch {
    return [];
  }
}

function Login({ onLogin }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api('/auth/native-login', { method: 'POST', body: form });
      await saveSession(result);
      onLogin(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-brand">
        <span className="brand-chip">APP PARA MOZOS</span>
        <div className="brand-mark">M</div>
        <h1>
          Modo Sabor
          <br />
          Mozo
        </h1>
        <p>Mesas, comandas y cocina. Sin caja, sin vueltas.</p>
      </section>
      <form className="login-card" onSubmit={submit}>
        <h2>Abrí tu turno</h2>
        <p>Usá el usuario que te creó el encargado.</p>
        <label>
          Correo
          <input
            type="email"
            autoComplete="username"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </label>
        {error ? <div className="form-error">{error}</div> : null}
        <button className="primary" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar a mis mesas'}
        </button>
        <small>La sesión queda protegida en este teléfono.</small>
      </form>
    </main>
  );
}

function ProductOptions({ product, onClose, onAdd }) {
  const [variants, setVariants] = useState({});
  const [extras, setExtras] = useState([]);
  const [note, setNote] = useState('');
  const groups = parseOptions(product.variantes);
  const extrasOptions = parseOptions(product.extras);
  const extraTotal = extras.reduce((sum, extra) => sum + Number(extra.precio || 0), 0);

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <span className="eyebrow">PERSONALIZAR</span>
        <h2>{product.nombre}</h2>
        {groups.map((group) => (
          <fieldset key={group.nombre}>
            <legend>{group.nombre}</legend>
            <div className="choice-row">
              {group.opciones?.map((option) => (
                <button
                  type="button"
                  className={
                    variants[group.nombre]?.nombre === option.nombre ? 'choice active' : 'choice'
                  }
                  key={option.nombre}
                  onClick={() => setVariants({ ...variants, [group.nombre]: option })}
                >
                  {option.nombre}
                  {Number(option.precio_extra || 0) ? ` +${money(option.precio_extra)}` : ''}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        {extrasOptions.length ? (
          <fieldset>
            <legend>Extras</legend>
            <div className="choice-row">
              {extrasOptions.map((extra) => {
                const selected = extras.some((item) => item.nombre === extra.nombre);
                return (
                  <button
                    type="button"
                    key={extra.nombre}
                    className={selected ? 'choice active' : 'choice'}
                    onClick={() =>
                      setExtras(
                        selected
                          ? extras.filter((item) => item.nombre !== extra.nombre)
                          : [...extras, extra]
                      )
                    }
                  >
                    {extra.nombre}
                    {Number(extra.precio || 0) ? ` +${money(extra.precio)}` : ''}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <label>
          Nota para cocina
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej.: sin cebolla"
          />
        </label>
        <button
          className="primary"
          onClick={() =>
            onAdd({
              producto_id: product.id,
              nombre: product.nombre,
              cantidad: 1,
              variantes: Object.fromEntries(
                Object.entries(variants).map(([group, option]) => [group, option.nombre])
              ),
              extras,
              descripcion: note,
              precio_unitario: Number(product.precio || 0) + extraTotal,
            })
          }
        >
          Agregar {money(Number(product.precio || 0) + extraTotal)}
        </button>
      </section>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [state, setState] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [selectedMesa, setSelectedMesa] = useState(null);
  const [tableOrders, setTableOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [category, setCategory] = useState('Todas');
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [productOptions, setProductOptions] = useState(null);
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadSession()
      .then(setSession)
      .catch(() => {})
      .finally(() => setLoadingSession(false));
  }, []);

  const load = useCallback(async () => {
    if (!session?.token) return;
    try {
      const [nextState, nextCatalog] = await Promise.all([
        api('/mozo/estado', { token: session.token }),
        api('/mozo/catalogo', { token: session.token }),
      ]);
      setState(nextState);
      setCatalog(nextCatalog.productos || []);
      if (
        selectedMesa &&
        nextState.mesas.some((mesa) => mesa.mesa === selectedMesa && mesa.asignada_a_mi)
      ) {
        const detail = await api(`/mozo/mesas/${encodeURIComponent(selectedMesa)}`, {
          token: session.token,
        });
        setTableOrders(detail.pedidos || []);
      }
    } catch (err) {
      setNotice(err.message);
      if (/no autorizado|token/i.test(err.message)) {
        await clearSession();
        setSession(null);
      }
    }
  }, [session, selectedMesa]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const timer = setInterval(load, 12000);
    return () => clearInterval(timer);
  }, [load]);

  const categories = useMemo(
    () => ['Todas', ...new Set(catalog.map((product) => product.categoria_nombre))],
    [catalog]
  );
  const visibleProducts = useMemo(
    () =>
      catalog.filter(
        (product) =>
          (category === 'Todas' || product.categoria_nombre === category) &&
          product.nombre.toLowerCase().includes(search.toLowerCase())
      ),
    [catalog, category, search]
  );
  const cartTotal = cart.reduce(
    (sum, item) => sum + Number(item.precio_unitario || 0) * Number(item.cantidad || 0),
    0
  );

  const takeMesa = async (mesa) => {
    try {
      await api(`/mozo/mesas/${encodeURIComponent(mesa)}/tomar`, {
        token: session.token,
        method: 'POST',
      });
      setSelectedMesa(mesa);
      setTableOrders([]);
      setNotice(`Mesa ${mesa} asignada a vos.`);
      await load();
    } catch (err) {
      setNotice(err.message);
    }
  };

  const chooseMesa = async (mesa) => {
    if (!mesa.asignada_a_mi) return takeMesa(mesa.mesa);
    setSelectedMesa(mesa.mesa);
    try {
      const result = await api(`/mozo/mesas/${encodeURIComponent(mesa.mesa)}`, {
        token: session.token,
      });
      setTableOrders(result.pedidos || []);
    } catch (err) {
      setNotice(err.message);
    }
  };

  const addProduct = (product) => {
    const hasOptions =
      parseOptions(product.variantes).length || parseOptions(product.extras).length;
    if (hasOptions) return setProductOptions(product);
    setCart((previous) => {
      const existing = previous.find(
        (item) =>
          item.producto_id === product.id &&
          !item.descripcion &&
          !item.variantes?.length &&
          !item.extras?.length
      );
      return existing
        ? previous.map((item) =>
            item === existing ? { ...item, cantidad: item.cantidad + 1 } : item
          )
        : [
            ...previous,
            {
              producto_id: product.id,
              nombre: product.nombre,
              cantidad: 1,
              precio_unitario: Number(product.precio || 0),
              variantes: [],
              extras: [],
              descripcion: '',
            },
          ];
    });
  };

  const sendOrder = async () => {
    if (!selectedMesa || !cart.length || sending) return;
    setSending(true);
    try {
      const pedido = await api('/mozo/pedidos', {
        token: session.token,
        method: 'POST',
        body: { mesa: selectedMesa, items: cart, notas: note, idempotency_key: uuid() },
      });
      setCart([]);
      setNote('');
      setNotice(
        pedido.duplicate
          ? `Comanda #${pedido.numero} ya estaba enviada.`
          : `Comanda #${pedido.numero} enviada a cocina.`
      );
      await load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSending(false);
    }
  };

  if (loadingSession) return <div className="splash">Modo Sabor Mozo</div>;
  if (!session) return <Login onLogin={setSession} />;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">MODO SABOR · MOZOS</span>
          <h1>Hola, {session.user?.nombre?.split(' ')[0]}</h1>
        </div>
        <button
          className="ghost"
          onClick={async () => {
            await clearSession();
            setSession(null);
          }}
        >
          Salir
        </button>
      </header>
      {notice ? (
        <button className="notice" onClick={() => setNotice('')}>
          {notice} <b>×</b>
        </button>
      ) : null}
      {state && !state.operacion.abierto ? (
        <section className="closed">
          <strong>Operación cerrada</strong>
          <span>{state.operacion.mensaje}</span>
        </section>
      ) : null}
      {!selectedMesa ? (
        <section className="tables">
          <div className="section-title">
            <div>
              <span className="eyebrow">SALÓN</span>
              <h2>Elegí una mesa</h2>
            </div>
            <span>{state?.operacion?.turno || 'Cargando…'}</span>
          </div>
          <div className="table-grid">
            {state?.mesas?.map((mesa) => (
              <button
                key={mesa.mesa}
                className={`table-card ${mesa.asignada_a_mi ? 'mine' : mesa.ocupada || mesa.asignada ? 'busy' : ''}`}
                disabled={
                  !state.operacion.abierto ||
                  (mesa.ocupada && !mesa.asignada_a_mi) ||
                  (mesa.asignada && !mesa.asignada_a_mi)
                }
                onClick={() => chooseMesa(mesa)}
              >
                <small>MESA</small>
                <strong>{mesa.mesa}</strong>
                <span>
                  {mesa.asignada_a_mi
                    ? `${mesa.pedidos_abiertos || 'Nueva'} · tu mesa`
                    : mesa.ocupada || mesa.asignada
                      ? 'Ocupada'
                      : 'Libre'}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="order-workspace">
          <div className="mesa-header">
            <button
              className="back"
              onClick={() => {
                setSelectedMesa(null);
                setCart([]);
              }}
            >
              ← Mesas
            </button>
            <div>
              <span className="eyebrow">TU MESA</span>
              <h2>Mesa {selectedMesa}</h2>
            </div>
            <span>
              {tableOrders.length ? `${tableOrders.length} comandas abiertas` : 'Nueva comanda'}
            </span>
          </div>
          <div className="orders-history">
            {tableOrders.map((order) => (
              <article key={order.id}>
                <b>#{order.numero}</b>
                <span>
                  {order.items?.map((item) => `${item.cantidad}× ${item.nombre}`).join(' · ')}
                </span>
                <em>{order.estado}</em>
              </article>
            ))}
          </div>
          <input
            className="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar plato…"
          />
          <div className="categories">
            {categories.map((item) => (
              <button
                key={item}
                className={category === item ? 'active' : ''}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="product-grid">
            {visibleProducts.map((product) => (
              <button className="product" key={product.id} onClick={() => addProduct(product)}>
                <span>{product.categoria_nombre}</span>
                <b>{product.nombre}</b>
                <small>{product.descripcion}</small>
                <strong>{money(product.precio)}</strong>
              </button>
            ))}
          </div>
          <aside className="cart">
            <div className="cart-head">
              <div>
                <span className="eyebrow">COMANDA NUEVA</span>
                <h2>{cart.length ? `${cart.length} platos` : 'Todavía vacía'}</h2>
              </div>
              <b>{money(cartTotal)}</b>
            </div>
            {cart.map((item, index) => (
              <div className="cart-item" key={`${item.producto_id}-${index}`}>
                <button onClick={() => setCart(cart.filter((_item, current) => current !== index))}>
                  ×
                </button>
                <span>
                  <b>
                    {item.cantidad}× {item.nombre}
                  </b>
                  <small>
                    {item.descripcion ||
                      [
                        item.variantes?.map((v) => v.nombre).join(', '),
                        item.extras?.map((e) => e.nombre).join(', '),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                  </small>
                </span>
                <strong>{money(item.precio_unitario * item.cantidad)}</strong>
              </div>
            ))}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nota general para cocina (opcional)"
            />
            <button
              className="primary send"
              disabled={!cart.length || sending || !state?.operacion?.abierto}
              onClick={sendOrder}
            >
              {sending ? 'Enviando…' : 'Enviar comanda a cocina →'}
            </button>
          </aside>
        </section>
      )}
      {productOptions ? (
        <ProductOptions
          product={productOptions}
          onClose={() => setProductOptions(null)}
          onAdd={(item) => {
            setCart([...cart, item]);
            setProductOptions(null);
          }}
        />
      ) : null}
    </main>
  );
}
