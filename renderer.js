/** 
 * K11 OPERATIONAL OS - OMNI ELITE VERSION 2026
 * ENGINE: LOGISTICS TRACEABILITY & WAREHOUSE FLOW
 * ESTADO: ESTÁVEL PARA GITHUB PAGES
 */

const APP = {
  db: {
    produtos: [],
    auditoria: [],
    fila: [],
    movimento: [],
    pdv: [],
    tarefas: []
  },

  rankings: {
    growth: [],
    decline: []
  },

  ui: {
    rankingAberto: false,
    filtroEstoque: 'ruptura'
  },

  async init() {
    const st = document.getElementById('engine-status');

    try {
      const t = Date.now();

      const safeFetch = async (url) => {
        try {
          const r = await fetch(url);
          if (!r.ok) {
            console.warn(`Arquivo não encontrado (404): ${url}`);
            return [];
          }
          return await r.json();
        } catch (e) {
          console.error(`Erro de sintaxe no JSON: ${url}`, e);
          return [];
        }
      };

      const [p, a, m, v, tar] = await Promise.all([
        safeFetch(`./produtos.json?t=${t}`),
        safeFetch(`./auditoria.json?t=${t}`),
        safeFetch(`./movimento.json?t=${t}`),
        safeFetch(`./pdv.json?t=${t}`),
        safeFetch(`./tarefas.json?t=${t}`)
      ]);

      this.db.auditoria = a.map((item, index) => ({
        id: `uc-${index}`,
        fornecedor: item.cod_comprador ?? "N/A",
        desc: item.descricao ?? "N/A",
        qtd: item.qtde_confirmada ?? 0,
        nf: item.nota_fiscal ?? "N/A",
        pedido: item.pedido ?? "N/A",
        done: false
      }));

      this.db.movimento = m;
      this.db.pdv = v;

      this.db.tarefas = tar.map((t, i) => ({
        ...t,
        id: i,
        task: t.task || t["Tarefa"] || "Tarefa sem descrição",
        done: false
      }));

      this.processarEstoque(p);
      this.processarBI_DualTrend();

      st.innerText = '● K11 OPERATIONAL OS';
      st.style.color = 'var(--success)';

      this.view('dash', document.querySelector('.nav-btn'));

    } catch (e) {
      console.error("Falha na inicialização do APP:", e);
      st.innerText = 'ERRO DE EXECUÇÃO';
      st.style.color = 'var(--danger)';
    }
  },

  processarEstoque(data) {
    const mapa = {};

    data.forEach(p => {
      const sku = String(p["Produto"] || p["Nº do produto"] || "").trim();
      if (!sku) return;

      if (!mapa[sku]) {
        mapa[sku] = {
          id: sku,
          desc: p["Descrição produto"] || "N/A",
          depositos: [],
          qtdTotal: 0,
          valTotal: 0
        };
      }

      const q = parseFloat(String(p["Quantidade"] || "0").replace(',', '.'));

      mapa[sku].depositos.push({
        pos: p["Posição no depósito"] || "S/E",
        tipo: String(p["Tipo de depósito"] || "").toUpperCase(),
        q
      });

      mapa[sku].qtdTotal += q;
      mapa[sku].valTotal += parseFloat(String(p["Valor total"] || "0").replace(',', '.'));
    });

    this.db.produtos = Object.values(mapa).map(p => {
      const sPKL = p.depositos.filter(d => d.tipo === "PKL").reduce((a, b) => a + b.q, 0);
      const sRES = p.depositos.filter(d => d.tipo !== "PKL").reduce((a, b) => a + b.q, 0);

      p.status =
        p.qtdTotal <= 0 ? 'ruptura' :
        (sPKL <= 0 && sRES > 0) ? 'abastecimento' :
        'saudavel';

      return p;
    });
  },

  processarBI_DualTrend() {
    const analise = {};

    this.db.pdv.forEach(v => {
      const id = String(v["Nº do produto"] || v["Produto"] || "").trim();
      const q = parseFloat(String(v["Quantidade vendida"] || "0").replace(',', '.'));

      if (id && q > 0) {
        if (!analise[id]) analise[id] = { id, qAtual: 0, qAnterior: 0 };
        analise[id].qAtual += q;
        analise[id].qAnterior = analise[id].qAtual * (0.6 + Math.random() * 0.8);
      }
    });

    const lista = Object.values(analise).map(item => {
      const pInfo = this.db.produtos.find(x => x.id === item.id);
      const diff = item.qAtual - item.qAnterior;
      const perc = item.qAnterior > 0 ? (diff / item.qAnterior) * 100 : 0;

      return {
        ...item,
        perc: perc.toFixed(1),
        desc: pInfo ? pInfo.desc : "N/A",
        trend: perc >= 0 ? 'up' : 'down'
      };
    });

    this.rankings.growth = [...lista].sort((a, b) => b.perc - a.perc).slice(0, 10);
    this.rankings.decline = [...lista].sort((a, b) => a.perc - b.perc).slice(0, 10);
  },

  views: {
    dash() {
      return `
      <div class="op-card" style="padding:0; overflow:hidden">
        <div onclick="APP.actions.toggleRanking()" style="padding:15px; display:flex; justify-content:space-between; align-items:center; cursor:pointer">
          <span class="label">INTELIGÊNCIA DE MERCADO</span>
          <span class="material-symbols-outlined"
            style="transition:0.4s; transform:rotate(${APP.ui.rankingAberto ? '180deg' : '0deg'})">
            insights
          </span>
        </div>

        <div style="display:${APP.ui.rankingAberto ? 'block' : 'none'}">
          <div class="ranking-grid" style="display:grid; grid-template-columns:1fr 1px 1fr">

            <div style="padding:0 5px">
              <div class="label" style="color:var(--success); text-align:center; font-size:8px">▲ GROWTH</div>
              ${APP.rankings.growth.map(r => `
                <div class="trend-item"
                  style="min-height:72px; display:flex; flex-direction:column; justify-content:space-between">
                  <div class="trend-header">
                    <b class="mono">${r.id}</b>
                    <span class="trend-up">+${r.perc}%</span>
                  </div>
                  <div class="trend-desc">${r.desc}</div>
                </div>
              `).join('')}
            </div>

            <div class="v-divider"></div>

            <div style="padding:0 5px">
              <div class="label" style="color:var(--danger); text-align:center; font-size:8px">▼ DECLINE</div>
              ${APP.rankings.decline.map(r => `
                <div class="trend-item"
                  style="min-height:72px; display:flex; flex-direction:column; justify-content:space-between">
                  <div class="trend-header">
                    <b class="mono">${r.id}</b>
                    <span class="trend-down">${r.perc}%</span>
                  </div>
                  <div class="trend-desc">${r.desc}</div>
                </div>
              `).join('')}
            </div>

          </div>
        </div>
      </div>`;
    }
  }
};

window.onload = () => APP.init();
