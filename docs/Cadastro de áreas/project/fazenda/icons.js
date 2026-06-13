/* SVG icon set — stroke=currentColor, line style */
const ICONS = (() => {
  const w = (p, o={}) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${o.sw||1.8}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  return {
    cow: w('<path d="M5 5c0 2 1 3 2 3M19 5c0 2-1 3-2 3M7 8h10v3a5 5 0 0 1-10 0V8Z"/><path d="M9.5 14.5h.01M14.5 14.5h.01M11 17h2"/><path d="M3 6c1.5 0 2 1 2 2M21 6c-1.5 0-2 1-2 2"/>'),
    collapse: w('<path d="M9 4v16M15 9l-3 3 3 3"/><rect x="3" y="4" width="18" height="16" rx="2"/>'),
    chevDown: w('<path d="m6 9 6 6 6-6"/>'),
    chevRight: w('<path d="m9 6 6 6-6 6"/>'),
    help: w('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.7-2.5 2-2.5 3.5M12 17h.01"/>'),
    search: w('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>'),
    plus: w('<path d="M12 5v14M5 12h14"/>'),
    star: w('<path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.2l1-5.8L3.5 9.2l5.9-.9L12 3Z"/>'),
    starFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.2l1-5.8L3.5 9.2l5.9-.9L12 3Z"/></svg>',
    // nav
    categoria: w('<path d="M3 7h18M3 12h18M3 17h18"/><circle cx="7" cy="7" r="0" /><path d="M6 7h.01M6 12h.01M6 17h.01"/>'),
    local: w('<path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>'),
    lotes: w('<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>'),
    ficha: w('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 16.5c.6-1.8 6-1.8 7 0M14.5 9h4M14.5 12.5h4M14.5 16h2.5"/>'),
    nascimento: w('<path d="M12 21c0-4 0-7-3-9M12 21c0-4 0-7 3-9M12 12c0-3 2-5 2-5M9 8c-2 0-3 2-3 4 2 0 3-1 3-2M15 8c2 0 3 2 3 4-2 0-3-1-3-2"/>'),
    compra: w('<path d="M3 4h2l2.2 11.5a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2L21 8H6"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17.5" cy="20" r="1.3"/><path d="M14 7v5M11.5 9.5h5"/>'),
    venda: w('<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>'),
    morte: w('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>'),
    gestaoLotes: w('<path d="M4 7h11l-2.5-2.5M4 7l2.5 2.5M20 17H9l2.5 2.5M20 17l-2.5-2.5"/>'),
    pesagens: w('<path d="M12 4a2 2 0 1 0 0-.001M12 6v0M5 9h14l2.5 7.5a4.8 4.8 0 0 1-9.5 0L5 9ZM5 9 2.5 16.5a4.8 4.8 0 0 0 9.5 0M5 9h14"/><path d="M8 7h8"/>'),
    reproducao: w('<path d="M12 20s-6-4.2-6-9a3.6 3.6 0 0 1 6-2.6A3.6 3.6 0 0 1 18 11c0 4.8-6 9-6 9Z"/>'),
    mesa: w('<rect x="4" y="3" width="16" height="18" rx="2.5"/><path d="M9 3.5h6V6H9z"/><path d="m8.5 12 2.2 2.2L15.5 9.5"/>'),
    relMov: w('<path d="M4 19V5M4 19h16"/><rect x="7" y="11" width="3" height="5"/><rect x="12" y="8" width="3" height="8"/><rect x="17" y="13" width="3" height="3"/>'),
    relPeso: w('<path d="M4 19V5M4 19h16M7 15l4-4 3 3 5-6"/><path d="M19 8v3h-3"/>'),
    relReprod: w('<path d="M4 12h3l2 6 4-14 2 8h5"/>'),
    info: w('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    check: w('<path d="m4 12 5 5L20 6"/>'),
    checkCircle: w('<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.2 2.2L15.5 9.5"/>'),
    alert: w('<path d="M12 3 2.5 19.5h19L12 3Z"/><path d="M12 10v4M12 17h.01"/>'),
    x: w('<path d="M6 6l12 12M18 6 6 18"/>'),
    edit: w('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m14.5 5.5 4 4"/>'),
    trash: w('<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>'),
    arrowUp: w('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    arrowDown: w('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    layers: w('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>'),
    scale: w('<path d="M12 4v16M7 8h10M5 8l-2.5 6a3.2 3.2 0 0 0 6 0L6 8M19 8l-2.5 6a3.2 3.2 0 0 0 6 0L20 8"/><circle cx="12" cy="4" r="1.3"/>'),
    user: w('<circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.6-3.5 3.2-5 6.5-5s5.9 1.5 6.5 5"/>'),
    filter: w('<path d="M4 5h16l-6 7v6l-4 2v-8L4 5Z"/>'),
    calendar: w('<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    trend: w('<path d="M3 17 9 11l4 4 8-9"/><path d="M21 10V6h-4"/>'),
    save: w('<path d="M5 4h11l3 3v13H5V4Z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>'),
    sliders: w('<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/>'),
    move: w('<path d="M12 3v18M3 12h18M12 3 9 6m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3M21 12l-3-3m3 3-3 3"/>'),
    estoquePartida: w('<path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z"/><path d="M3 13l9 4.5L21 13"/><path d="M3 8.5V13M21 8.5V13"/>'),
    back: w('<path d="M15 18l-6-6 6-6"/>'),
    collapseUp: w('<path d="m6 15 6-6 6 6"/>'),
    mapa: w('<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z"/><path d="M9 4v13M15 6.5v13"/>'),
    grupo: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none">'
      + '<g transform="translate(14.5 8.2) scale(.78)" opacity=".55">'
        + '<path d="M-3 -4 C-4.6 -5.1 -4.7 -6.4 -4 -6.9 C-3.5 -6 -3 -4.9 -2.3 -4.5 Z"/>'
        + '<path d="M3 -4 C4.6 -5.1 4.7 -6.4 4 -6.9 C3.5 -6 3 -4.9 2.3 -4.5 Z"/>'
        + '<ellipse cx="-4.3" cy="-2.1" rx="1.4" ry=".85"/><ellipse cx="4.3" cy="-2.1" rx="1.4" ry=".85"/>'
        + '<path d="M-3.7 -2.4 C-3.9 .2 -2.8 2.2 -1.4 3 C-.6 3.5 .6 3.5 1.4 3 C2.8 2.2 3.9 .2 3.7 -2.4 C3.3 -4 2 -4.7 0 -4.7 C-2 -4.7 -3.3 -4 -3.7 -2.4 Z"/>'
      + '</g>'
      + '<g transform="translate(8.5 10)">'
        + '<path d="M-3 -4 C-4.6 -5.1 -4.7 -6.4 -4 -6.9 C-3.5 -6 -3 -4.9 -2.3 -4.5 Z"/>'
        + '<path d="M3 -4 C4.6 -5.1 4.7 -6.4 4 -6.9 C3.5 -6 3 -4.9 2.3 -4.5 Z"/>'
        + '<ellipse cx="-4.3" cy="-2.1" rx="1.4" ry=".85"/><ellipse cx="4.3" cy="-2.1" rx="1.4" ry=".85"/>'
        + '<path d="M-3.7 -2.4 C-3.9 .2 -2.8 2.2 -1.4 3 C-.6 3.5 .6 3.5 1.4 3 C2.8 2.2 3.9 .2 3.7 -2.4 C3.3 -4 2 -4.7 0 -4.7 C-2 -4.7 -3.3 -4 -3.7 -2.4 Z"/>'
      + '</g>'
      + '</svg>',
    link: w('<path d="M9.5 14.5 14.5 9.5M8 12l-2 2a3.2 3.2 0 0 0 4.5 4.5l2-2M16 12l2-2a3.2 3.2 0 0 0-4.5-4.5l-2 2"/>'),
    alvo: w('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>'),
    regime: w('<path d="M5 21c0-7 3-11 9-13M5 21c0-7 6-9 10-8M5 21h7"/><path d="M14 8c2-2 5-2 6-1 0 2-1 4-3 5s-4 0-4 0 .5-2 1-4Z"/>'),
    transferir: w('<path d="M3 8h13l-3.5-3.5M3 8l3.5 3.5M21 16H8l3.5-3.5M21 16l-3.5 3.5"/>'),
    relogio: w('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    historico: w('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 4v4h4M12 8v4l3 2"/>'),
    encerrar: w('<path d="M5 8V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2M4 8h16l-1 12H5L4 8ZM9.5 12.5l5 5M14.5 12.5l-5 5"/>'),
    brinco: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5C9.2 2.5 7 4.7 7 7.5 7 8.4 6.6 9 6 9.4L5.2 10C4.7 10.4 4.5 11 4.5 11.6V19A2.5 2.5 0 0 0 7 21.5H17A2.5 2.5 0 0 0 19.5 19V11.6C19.5 11 19.3 10.4 18.8 10L18 9.4C17.4 9 17 8.4 17 7.5 17 4.7 14.8 2.5 12 2.5Z"/><circle cx="12" cy="7.2" r="1.7"/><text x="12" y="17.7" text-anchor="middle" font-size="5.6" font-weight="700" font-family="Inter,system-ui,sans-serif" fill="currentColor" stroke="none">001</text></svg>',
  };
})();
function icon(name){return ICONS[name]||'';}
