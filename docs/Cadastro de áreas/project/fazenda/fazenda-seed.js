/* ===== Cadastro de Fazenda — dados-semente (polígonos aninhados) =====
   Centro fictício no cerrado (MT). Coordenadas geradas por código para
   garantir que retiros ⊂ fazenda, setores ⊂ retiro, locais ⊂ setor. */
(function(){
  const lat0 = -15.553, lng0 = -52.104;
  // retângulo a partir de offsets (em graus) relativos ao centro
  function rect(latA, latB, lngA, lngB){
    return [[lat0+latA, lng0+lngA],[lat0+latA, lng0+lngB],[lat0+latB, lng0+lngB],[lat0+latB, lng0+lngA]];
  }
  // octógono (fazenda) — cantos chanfrados, parece um perímetro real
  function octo(h, w, c){
    return [
      [lat0+h-c, lng0-w],[lat0+h, lng0-w+c],[lat0+h, lng0+w-c],[lat0+h-c, lng0+w],
      [lat0-h+c, lng0+w],[lat0-h, lng0+w-c],[lat0-h, lng0-w+c],[lat0-h+c, lng0-w]
    ];
  }

  const S = [
    // ---------- CAMADA FAZENDA ----------
    { id:'faz-1', nivel:'fazenda', nome:'Fazenda Natura 1', parent:null, tipo:null,
      coords: octo(0.040, 0.050, 0.012), fonte:'kml' },

    // ---------- CAMADA RETIROS ----------
    { id:'ret-sede',  nivel:'retiro', nome:'Retiro Sede',  parent:'faz-1', tipo:null,
      coords: rect(-0.036, 0.036, -0.046, -0.004), fonte:'desenho' },
    { id:'ret-brejo', nivel:'retiro', nome:'Retiro Brejo', parent:'faz-1', tipo:null,
      coords: rect(-0.036, 0.036,  0.004,  0.046), fonte:'desenho' },

    // ---------- CAMADA SETORES ----------
    { id:'set-cab', nivel:'setor', nome:'Setor Cabeceira', parent:'ret-sede', tipo:null,
      coords: rect( 0.004, 0.032, -0.042, -0.008), fonte:'desenho' },
    { id:'set-bax', nivel:'setor', nome:'Setor Baixão',    parent:'ret-sede', tipo:null,
      coords: rect(-0.032,-0.002, -0.042, -0.008), fonte:'desenho' },
    { id:'set-bno', nivel:'setor', nome:'Setor Brejo Norte', parent:'ret-brejo', tipo:null,
      coords: rect( 0.000, 0.032,  0.008,  0.042), fonte:'desenho' },

    // ---------- CAMADA LOCAIS ----------
    { id:'loc-p1', nivel:'local', nome:'Pasto Cabeceira 1', parent:'set-cab', tipo:'Pasto',
      coords: rect( 0.006, 0.018, -0.040, -0.026), fonte:'desenho' },
    { id:'loc-p2', nivel:'local', nome:'Pasto Cabeceira 2', parent:'set-cab', tipo:'Pasto',
      coords: rect( 0.020, 0.030, -0.040, -0.012), fonte:'desenho' },
    { id:'loc-cur', nivel:'local', nome:'Curral de Manejo', parent:'set-cab', tipo:'Curral',
      coords: rect( 0.006, 0.012, -0.022, -0.012), fonte:'desenho' },
    { id:'loc-p3', nivel:'local', nome:'Pasto Baixão',      parent:'set-bax', tipo:'Pasto',
      coords: rect(-0.030,-0.006, -0.040, -0.012), fonte:'desenho' },
    { id:'loc-conf', nivel:'local', nome:'Confinamento',    parent:'set-bno', tipo:'Confinamento',
      coords: rect( 0.004, 0.014,  0.012,  0.024), fonte:'desenho' },
    { id:'loc-p4', nivel:'local', nome:'Pasto Brejo',       parent:'set-bno', tipo:'Pasto',
      coords: rect( 0.016, 0.030,  0.012,  0.040), fonte:'desenho' },
  ];

  window.FZ_SEED = S;
  window.FZ_CENTER = [lat0, lng0];
})();
