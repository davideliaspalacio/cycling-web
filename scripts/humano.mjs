/**
 * Utilidades para que una grabación automatizada se vea como una persona
 * usando la app: cursor visible, movimientos con curva, tecleo irregular y
 * scroll con inercia.
 */

/** Cursor y pulso de clic dibujados dentro de la página, para que la grabación los capture. */
export const PINTAR_CURSOR = (esTactil) => `
(() => {
  const css = document.createElement('style');
  css.textContent = \`
    #cursor-demo {
      position: fixed; top: 0; left: 0; z-index: 2147483647;
      width: ${esTactil ? 44 : 22}px; height: ${esTactil ? 44 : 22}px;
      margin-left: ${esTactil ? -22 : -3}px; margin-top: ${esTactil ? -22 : -2}px;
      pointer-events: none; opacity: 0;
      transition: opacity .25s ease;
      will-change: transform;
    }
    #cursor-demo.visible { opacity: 1; }
    #cursor-demo .aro {
      position: absolute; inset: 0; border-radius: 999px;
      background: ${esTactil ? "rgba(203,255,71,.32)" : "transparent"};
      border: ${esTactil ? "3px solid #cbff47" : "0"};
      transform: scale(1); transition: transform .18s ease;
    }
    #cursor-demo.pulsa .aro { transform: scale(.72); }
    #cursor-demo svg { position: absolute; inset: 0; filter: drop-shadow(0 2px 3px rgba(0,0,0,.55)); }
    #onda-demo {
      position: fixed; z-index: 2147483646; pointer-events: none;
      width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 999px;
      border: 3px solid #cbff47; opacity: 0;
    }
    @keyframes onda-demo-anim {
      from { transform: scale(.4); opacity: .9; }
      to   { transform: scale(4.2); opacity: 0; }
    }
  \`;
  const cursor = document.createElement('div');
  cursor.id = 'cursor-demo';
  cursor.innerHTML = '<div class="aro"></div>' + ${esTactil
    ? "''"
    : `'<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 2l14 9.5-6.1 1.1L16 20l-2.9 1.3-3-6.8L5 18.6z" fill="#fff" stroke="#04100c" stroke-width="1.6" stroke-linejoin="round"/></svg>'`};
  const onda = document.createElement('div');
  onda.id = 'onda-demo';

  const montar = () => {
    if (!document.body) return;
    for (const nodo of [css, cursor, onda]) {
      if (nodo.parentNode !== document.body) document.body.appendChild(nodo);
    }
  };
  montar();
  document.addEventListener('DOMContentLoaded', montar);
  addEventListener('load', montar);
  // React puede barrer nodos ajenos al hidratar: lo volvemos a poner.
  setInterval(montar, 400);

  let x = innerWidth / 2, y = innerHeight / 2;
  const pintar = () => { cursor.style.transform = \`translate3d(\${x}px, \${y}px, 0)\`; };
  pintar();

  addEventListener('mousemove', (e) => {
    x = e.clientX; y = e.clientY;
    cursor.classList.add('visible');
    pintar();
  }, true);

  const golpe = () => {
    cursor.classList.add('visible', 'pulsa');
    setTimeout(() => cursor.classList.remove('pulsa'), 190);
    onda.style.left = x + 'px';
    onda.style.top = y + 'px';
    onda.style.animation = 'none';
    void onda.offsetWidth;
    onda.style.animation = 'onda-demo-anim .55s ease-out';
  };
  addEventListener('mousedown', golpe, true);
  addEventListener('touchstart', golpe, true);
})();
`;

export const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/** Variación aleatoria alrededor de un valor, para que nada quede metronómico. */
const jitter = (base, pct = 0.3) =>
  Math.round(base * (1 - pct + Math.random() * pct * 2));

/**
 * Mueve el puntero hasta el centro del elemento describiendo una curva suave,
 * como haría una mano. Devuelve el rectángulo del elemento.
 */
export async function mover(page, objetivo, { desvio = 0.18 } = {}) {
  const caja = await objetivo.boundingBox();
  if (!caja) throw new Error("Elemento sin caja visible");
  const destino = {
    x: caja.x + caja.width / 2 + (Math.random() - 0.5) * caja.width * 0.25,
    y: caja.y + caja.height / 2 + (Math.random() - 0.5) * caja.height * 0.35,
  };

  const origen = page.__puntero ?? {
    x: page.viewportSize().width / 2,
    y: page.viewportSize().height * 0.6,
  };

  // Bézier cuadrática con un punto de control desviado: la trayectoria se
  // arquea en vez de ir en línea recta.
  const cx =
    (origen.x + destino.x) / 2 + (destino.y - origen.y) * desvio * (Math.random() < 0.5 ? -1 : 1);
  const cy =
    (origen.y + destino.y) / 2 + (destino.x - origen.x) * desvio * (Math.random() < 0.5 ? -1 : 1);

  const pasos = 26;
  for (let i = 1; i <= pasos; i++) {
    // easeInOutQuad: arranca lento, acelera, frena al llegar.
    const p = i / pasos;
    const t = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const x = (1 - t) ** 2 * origen.x + 2 * (1 - t) * t * cx + t ** 2 * destino.x;
    const y = (1 - t) ** 2 * origen.y + 2 * (1 - t) * t * cy + t ** 2 * destino.y;
    await page.mouse.move(x, y);
    await pausa(9);
  }
  page.__puntero = destino;
  return caja;
}

export async function clic(page, objetivo, { antes = 260, despues = 620 } = {}) {
  await objetivo.scrollIntoViewIfNeeded();
  await pausa(180);
  await mover(page, objetivo);
  await pausa(jitter(antes));
  await page.mouse.down();
  await pausa(jitter(70));
  await page.mouse.up();
  await pausa(jitter(despues));
}

/** Tecleo con ritmo irregular y una pausa extra después de cada palabra. */
export async function escribir(page, objetivo, texto, { velocidad = 62 } = {}) {
  await clic(page, objetivo, { antes: 180, despues: 160 });
  for (const caracter of texto) {
    await page.keyboard.type(caracter);
    await pausa(caracter === " " ? jitter(velocidad * 2.1) : jitter(velocidad));
  }
  await pausa(jitter(280));
}

/** Scroll con aceleración y frenado, no un salto. */
export async function desplazar(page, distancia, duracion = 1100) {
  await page.evaluate(
    ([d, ms]) =>
      new Promise((listo) => {
        const inicio = window.scrollY;
        const t0 = performance.now();
        const paso = (ahora) => {
          const p = Math.min(1, (ahora - t0) / ms);
          const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          window.scrollTo(0, inicio + d * e);
          if (p < 1) requestAnimationFrame(paso);
          else listo();
        };
        requestAnimationFrame(paso);
      }),
    [distancia, duracion],
  );
  await pausa(240);
}

/** Deja el elemento centrado en pantalla, suavemente. */
export async function centrar(page, objetivo, duracion = 900) {
  const caja = await objetivo.boundingBox();
  if (!caja) return;
  const alto = page.viewportSize().height;
  await desplazar(page, caja.y - alto / 2 + caja.height / 2, duracion);
}

/** Pausa de lectura: el tiempo que tarda alguien en leer lo que apareció. */
export const leer = (segundos = 1.6) => pausa(segundos * 1000);
